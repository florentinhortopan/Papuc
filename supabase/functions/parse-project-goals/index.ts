// Edge Function: parse-project-goals
// Input:  { prompt: string }
// Output: { constraints: ProjectConstraints }
//
// Calls Claude with the parseProjectGoals tool to produce structured constraints.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authedUser } from "../_shared/supabase.ts";
import { anthropicMessages, findToolUse } from "../_shared/anthropic.ts";
import {
  PARSE_PROJECT_SYSTEM,
  PARSE_PROJECT_TOOL,
} from "../_shared/prompts.ts";

interface ParseRequest {
  prompt: string;
}

interface ParseResponse {
  constraints: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const user = await authedUser(req);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: ParseRequest;
  try {
    body = (await req.json()) as ParseRequest;
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return jsonResponse({ error: "prompt is required" }, 400);

  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

  try {
    const res = await anthropicMessages({
      model,
      max_tokens: 2048,
      system: PARSE_PROJECT_SYSTEM,
      tools: [PARSE_PROJECT_TOOL],
      tool_choice: { type: "tool", name: PARSE_PROJECT_TOOL.name },
      messages: [{ role: "user", content: prompt }],
    });
    const tool = findToolUse<{ constraints: unknown }>(
      res.content,
      PARSE_PROJECT_TOOL.name,
    );
    if (!tool) {
      return jsonResponse({ error: "model did not return tool call" }, 502);
    }
    const out: ParseResponse = { constraints: tool.constraints };
    return jsonResponse(out);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
