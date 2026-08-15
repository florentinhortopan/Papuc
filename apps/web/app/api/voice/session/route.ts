import { createHash } from "node:crypto";

import {
  VOICE_CONCIERGE_SYSTEM,
  VOICE_CONCIERGE_TOOLS,
} from "@papuc/core/llm";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a short-lived OpenAI Realtime ephemeral client secret for the
 * browser WebRTC Concierge. The long-lived OPENAI_API_KEY never leaves
 * the server.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set" },
      { status: 500 },
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "marin";
  const safetyId = createHash("sha256").update(user.id).digest("hex");

  try {
    const res = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model,
            instructions: VOICE_CONCIERGE_SYSTEM,
            tools: VOICE_CONCIERGE_TOOLS,
            audio: {
              output: { voice },
              input: {
                // Required for User: lines in the hangup transcript → parse.
                // Without this, only Papuc speech is captured and budget/etc. vanish.
                transcription: {
                  model: "gpt-4o-mini-transcribe",
                  language: "en",
                },
                turn_detection: {
                  type: "semantic_vad",
                  eagerness: "medium",
                },
              },
            },
          },
        }),
      },
    );

    const data = (await res.json()) as {
      value?: string;
      client_secret?: { value?: string; expires_at?: number };
      expires_at?: number;
      error?: { message?: string };
    };

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            data.error?.message ??
            `OpenAI client_secrets failed (${res.status})`,
        },
        { status: 502 },
      );
    }

    const clientSecret =
      data.value ?? data.client_secret?.value ?? null;
    const expiresAt =
      data.expires_at ?? data.client_secret?.expires_at ?? null;

    if (!clientSecret) {
      return NextResponse.json(
        { error: "OpenAI returned no client secret" },
        { status: 502 },
      );
    }

    return NextResponse.json({ clientSecret, expiresAt, model, voice });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
