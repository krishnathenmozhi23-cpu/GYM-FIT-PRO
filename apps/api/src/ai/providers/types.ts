import type { z } from "zod";

export type AiTask = "workout_plan" | "daily_workout" | "exercise_alternatives" | "insight" | "chat";

export interface StructuredRequest<T> {
  task: AiTask;
  /** Stable instructions (safety rules, output contract). */
  system: string;
  /** Prior conversation turns, oldest first (chat only). */
  history?: { role: "user" | "assistant"; content: string }[];
  /** The user turn: structured context (JSON) plus the request. */
  prompt: string;
  /** Output contract; the response is validated against it. */
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  /**
   * DEVELOPMENT MOCK ONLY: the value the mock provider returns. Callers pass
   * a deterministic engine result here so the full validation pipeline can
   * be exercised without an API key. Never used by real providers.
   */
  devMockOutput: () => T;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
}

/**
 * An LLM that returns schema-constrained JSON. Implementations must never
 * touch the database; callers validate and persist results.
 */
export interface LlmProvider {
  readonly name: "anthropic" | "mock";
  readonly model: string;
  /** Source label recorded with every result. */
  readonly source: "ai" | "dev_mock";
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "refusal" | "invalid_output" | "truncated" | "api_error",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
