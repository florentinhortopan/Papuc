import type { LLMProvider } from "./types";
import type { ProjectConstraints } from "../schemas";

export async function parseProjectGoals(
  llm: LLMProvider,
  prompt: string,
): Promise<ProjectConstraints> {
  return llm.parseProjectGoals(prompt);
}
