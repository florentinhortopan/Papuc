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
  let finished = false;
  let dc: RTCDataChannel | null = null;

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

  const cleanup = () => {
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
    window.clearTimeout(timeoutId);
    if (!discard) {
      onEvent({ type: "status", status: "finishing" });
      onEvent({ type: "finished", summary });
    }
    cleanup();
  };

  const timeoutId = window.setTimeout(() => {
    finish("Time's up — drafting your project from what we heard.");
  }, MAX_MS);

  const handleServerEvent = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const ev = raw as Record<string, unknown>;
    const type = String(ev.type ?? "");

    if (type === "session.updated" || type === "session.created") {
      onEvent({ type: "status", status: "listening" });
    }
    if (type === "input_audio_buffer.speech_started") {
      onEvent({ type: "status", status: "listening" });
    }
    if (
      type === "response.created" ||
      type === "output_audio_buffer.started" ||
      type === "response.output_audio.delta"
    ) {
      onEvent({ type: "status", status: "speaking" });
    }
    if (
      type === "response.done" ||
      type === "output_audio_buffer.stopped"
    ) {
      onEvent({ type: "status", status: "listening" });
    }

    // Transcriptions (GA event names + beta fallbacks)
    if (
      type === "conversation.item.input_audio_transcription.completed"
    ) {
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

    // Function calls
    if (type === "response.function_call_arguments.done") {
      const name = String(ev.name ?? "");
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(String(ev.arguments ?? "{}")) as Record<
          string,
          unknown
        >;
      } catch {
        args = {};
      }
      const callId = String(ev.call_id ?? ev.callId ?? "");

      if (name === "note_progress") {
        const topic = args.topic as VoiceProgressTopic;
        if (topic === "place" || topic === "budget" || topic === "use") {
          onEvent({
            type: "progress",
            topic,
            label:
              typeof args.label === "string" ? args.label : undefined,
          });
        }
        sendToolOutput(dc, callId, { ok: true });
      } else if (name === "finish_intake") {
        sendToolOutput(dc, callId, { ok: true });
        finish(
          typeof args.summary === "string" ? args.summary : undefined,
        );
      }
    }

    // Nested function calls on response.done
    if (type === "response.done") {
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
        if (name === "note_progress") {
          const topic = args.topic as VoiceProgressTopic;
          if (topic === "place" || topic === "budget" || topic === "use") {
            onEvent({
              type: "progress",
              topic,
              label:
                typeof args.label === "string" ? args.label : undefined,
            });
          }
          sendToolOutput(dc, callId, { ok: true });
        } else if (name === "finish_intake") {
          sendToolOutput(dc, callId, { ok: true });
          finish(
            typeof args.summary === "string" ? args.summary : undefined,
          );
        }
      }
    }

    if (type === "error") {
      const msg =
        (ev.error as { message?: string } | undefined)?.message ??
        "Realtime error";
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

function sendToolOutput(
  dc: RTCDataChannel | null,
  callId: string,
  output: unknown,
) {
  if (!dc || dc.readyState !== "open" || !callId) return;
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
  dc.send(JSON.stringify({ type: "response.create" }));
}
