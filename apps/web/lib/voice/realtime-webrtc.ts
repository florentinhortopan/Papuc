/**
 * Browser WebRTC client for OpenAI Realtime Concierge calls.
 * Mints an ephemeral key via /api/voice/session, then exchanges SDP
 * with https://api.openai.com/v1/realtime/calls.
 */

export type VoiceProgressTopic = "place" | "budget" | "use";

export type VoiceSessionEvent =
  | { type: "status"; status: VoiceSessionStatus }
  | { type: "caption"; role: "user" | "assistant"; text: string }
  | { type: "progress"; topic: VoiceProgressTopic; label?: string }
  | { type: "finished"; summary?: string }
  | { type: "error"; message: string };

export type VoiceSessionStatus =
  | "connecting"
  | "listening"
  | "speaking"
  | "finishing";

export type VoiceSessionHandle = {
  /** End call and emit `finished` (unless discard). */
  stop: (opts?: { discard?: boolean }) => void;
  setMuted: (muted: boolean) => void;
  getTranscript: () => string;
};

const MAX_MS = 150_000;
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
/** Let the farewell audio finish before tearing down WebRTC. */
const FINISH_AUDIO_GRACE_MS = 2_500;

type TranscriptLine = { role: "user" | "assistant"; text: string };

export async function startVoiceSession(
  onEvent: (ev: VoiceSessionEvent) => void,
): Promise<VoiceSessionHandle> {
  onEvent({ type: "status", status: "connecting" });

  const tokenRes = await fetch("/api/voice/session", { method: "POST" });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    clientSecret?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.clientSecret) {
    throw new Error(tokenJson.error || `voice session failed (${tokenRes.status})`);
  }
  const clientSecret = tokenJson.clientSecret;

  const pc = new RTCPeerConnection();
  const remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.setAttribute("playsinline", "true");

  pc.ontrack = (e) => {
    remoteAudio.srcObject = e.streams[0] ?? null;
    void remoteAudio.play().catch(() => {});
  };

  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    pc.close();
    throw new Error(
      "Microphone permission denied. You can type your goals instead.",
    );
  }
  for (const track of localStream.getAudioTracks()) {
    pc.addTrack(track, localStream);
  }

  const lines: TranscriptLine[] = [];
  const notedTopics = new Set<VoiceProgressTopic>();
  const processedCallIds = new Set<string>();
  let finished = false;
  let dc: RTCDataChannel | null = null;
  let responseInFlight = false;
  let pendingResponseCreate = false;
  let finishTimer: number | undefined;
  let awaitingAudioBeforeFinish = false;
  let pendingFinishSummary: string | undefined;

  const pushLine = (role: "user" | "assistant", text: string) => {
    const t = text.trim();
    if (!t) return;
    const last = lines[lines.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text} ${t}`.trim();
    } else {
      lines.push({ role, text: t });
    }
    onEvent({ type: "caption", role, text: t });
  };

  const userTurnCount = () => lines.filter((l) => l.role === "user").length;

  const cleanup = () => {
    if (finishTimer != null) window.clearTimeout(finishTimer);
    try {
      dc?.close();
    } catch {
      /* ignore */
    }
    for (const t of localStream.getTracks()) t.stop();
    pc.close();
    remoteAudio.srcObject = null;
    remoteAudio.remove();
  };

  const finish = (summary?: string, discard = false) => {
    if (finished) return;
    finished = true;
    awaitingAudioBeforeFinish = false;
    window.clearTimeout(timeoutId);
    if (finishTimer != null) window.clearTimeout(finishTimer);
    if (!discard) {
      onEvent({ type: "status", status: "finishing" });
      onEvent({ type: "finished", summary });
    }
    cleanup();
  };

  /** End after current TTS drains so we don't cut audio mid-sentence. */
  const scheduleFinish = (summary?: string) => {
    if (finished || awaitingAudioBeforeFinish) return;
    awaitingAudioBeforeFinish = true;
    pendingFinishSummary = summary;
    onEvent({ type: "status", status: "finishing" });
    finishTimer = window.setTimeout(() => {
      finish(pendingFinishSummary);
    }, FINISH_AUDIO_GRACE_MS);
  };

  const timeoutId = window.setTimeout(() => {
    scheduleFinish("Time's up — drafting your project from what we heard.");
  }, MAX_MS);

  const flushPendingResponseCreate = () => {
    if (
      !pendingResponseCreate ||
      responseInFlight ||
      finished ||
      awaitingAudioBeforeFinish
    ) {
      return;
    }
    if (!dc || dc.readyState !== "open") return;
    pendingResponseCreate = false;
    responseInFlight = true;
    dc.send(JSON.stringify({ type: "response.create" }));
  };

  const sendToolOutput = (
    callId: string,
    output: unknown,
    opts?: { createResponse?: boolean },
  ) => {
    if (!dc || dc.readyState !== "open" || !callId || finished) return;
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      }),
    );
    if (opts?.createResponse === false) return;
    if (responseInFlight) {
      // Never start a second model turn while one is active — that surfaces as
      // "another response/process in progress" and kills the call UX.
      pendingResponseCreate = true;
      return;
    }
    responseInFlight = true;
    dc.send(JSON.stringify({ type: "response.create" }));
  };

  const handleFunctionCall = (
    name: string,
    args: Record<string, unknown>,
    callId: string,
  ) => {
    if (!callId || processedCallIds.has(callId)) return;
    processedCallIds.add(callId);

    if (name === "note_progress") {
      const topic = args.topic as VoiceProgressTopic;
      if (topic === "place" || topic === "budget" || topic === "use") {
        notedTopics.add(topic);
        onEvent({
          type: "progress",
          topic,
          label: typeof args.label === "string" ? args.label : undefined,
        });
      }
      sendToolOutput(callId, { ok: true });
      return;
    }

    if (name === "finish_intake") {
      const summary =
        typeof args.summary === "string" ? args.summary : undefined;
      // Model often finishes after the 2nd answer while chips are still thin —
      // reject and keep the WebRTC call alive instead of navigating away.
      const richFirstRant =
        userTurnCount() <= 1 && notedTopics.size >= 3;
      const enoughTopics = notedTopics.size >= 2;
      if (!enoughTopics && !richFirstRant) {
        sendToolOutput(callId, {
          ok: false,
          reason:
            "Too early. Ask one more missing question (place, budget, or use), then call finish_intake. Do not end the call yet.",
        });
        return;
      }
      // Never start another model turn while hanging up — that races teardown.
      sendToolOutput(callId, { ok: true }, { createResponse: false });
      scheduleFinish(summary);
    }
  };

  const handleServerEvent = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || finished) return;
    const ev = raw as Record<string, unknown>;
    const type = String(ev.type ?? "");

    if (type === "session.updated" || type === "session.created") {
      onEvent({ type: "status", status: "listening" });
    }
    if (type === "input_audio_buffer.speech_started") {
      if (!awaitingAudioBeforeFinish) {
        onEvent({ type: "status", status: "listening" });
      }
    }
    if (
      type === "response.created" ||
      type === "output_audio_buffer.started" ||
      type === "response.output_audio.delta"
    ) {
      responseInFlight = true;
      if (!awaitingAudioBeforeFinish) {
        onEvent({ type: "status", status: "speaking" });
      }
    }
    if (type === "output_audio_buffer.stopped") {
      if (awaitingAudioBeforeFinish) {
        finish(pendingFinishSummary);
        return;
      }
      onEvent({ type: "status", status: "listening" });
    }
    if (type === "response.done") {
      responseInFlight = false;
      if (!awaitingAudioBeforeFinish) {
        onEvent({ type: "status", status: "listening" });
      }
      // Process function calls once here (not also on arguments.done).
      const response = ev.response as
        | { output?: Array<Record<string, unknown>> }
        | undefined;
      for (const item of response?.output ?? []) {
        if (item.type !== "function_call") continue;
        const name = String(item.name ?? "");
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(item.arguments ?? "{}")) as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        const callId = String(item.call_id ?? "");
        handleFunctionCall(name, args, callId);
      }
      flushPendingResponseCreate();
    }

    // Transcriptions (GA event names + beta fallbacks)
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(
        (ev.transcript as string) ??
          ((ev.item as { transcript?: string } | undefined)?.transcript ?? ""),
      );
      pushLine("user", transcript);
    }
    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      pushLine("assistant", String(ev.transcript ?? ""));
    }
    if (type === "response.output_text.done" || type === "response.text.done") {
      pushLine("assistant", String(ev.text ?? ev.transcript ?? ""));
    }

    if (type === "error") {
      const msg =
        (ev.error as { message?: string } | undefined)?.message ??
        "Realtime error";
      // Concurrent-response errors are recoverable if we queued correctly;
      // surface others to the UI.
      const lower = msg.toLowerCase();
      if (
        lower.includes("active response") ||
        lower.includes("already") ||
        lower.includes("in progress")
      ) {
        responseInFlight = true;
        return;
      }
      onEvent({ type: "error", message: msg });
    }
  };

  dc = pc.createDataChannel("oai-events");
  dc.addEventListener("message", (e) => {
    try {
      handleServerEvent(JSON.parse(String(e.data)));
    } catch {
      /* ignore malformed */
    }
  });
  dc.addEventListener("open", () => {
    // Ask the model to greet and wait for the user.
    responseInFlight = true;
    dc?.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Greet briefly in one short line and invite them to rant freely about what they're looking for. Then wait.",
        },
      }),
    );
    onEvent({ type: "status", status: "listening" });
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const sdpRes = await fetch(REALTIME_CALLS_URL, {
    method: "POST",
    body: offer.sdp ?? "",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp",
    },
  });
  if (!sdpRes.ok) {
    cleanup();
    window.clearTimeout(timeoutId);
    const errText = await sdpRes.text().catch(() => "");
    throw new Error(
      errText || `Realtime SDP exchange failed (${sdpRes.status})`,
    );
  }
  const answerSdp = await sdpRes.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return {
    stop: (opts) => finish(undefined, opts?.discard === true),
    setMuted: (muted: boolean) => {
      for (const t of localStream.getAudioTracks()) t.enabled = !muted;
    },
    getTranscript: () =>
      lines
        .map((l) => `${l.role === "user" ? "User" : "Papuc"}: ${l.text}`)
        .join("\n"),
  };
}
