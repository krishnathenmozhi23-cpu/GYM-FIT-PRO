import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../lib/logger.js";
import { toOutputJsonSchema } from "./jsonSchema.js";
import { AiProviderError, type LlmProvider, type StructuredRequest, type StructuredResult } from "./types.js";

/**
 * Claude via the official SDK. Credentials come from the environment
 * (ANTHROPIC_API_KEY or another source the SDK resolves) — never from code.
 * Output is constrained with a JSON schema and then re-validated with Zod.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly source = "ai" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    timeoutMs: number,
  ) {
    this.client = new Anthropic({ timeout: timeoutMs, maxRetries: 2 });
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        // Server-side fallback if a safety classifier declines the request.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: req.effort ?? "low",
          format: { type: "json_schema", schema: toOutputJsonSchema(req.schema) },
        },
        system: req.system,
        messages: [...(req.history ?? []), { role: "user", content: req.prompt }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        logger.warn({ status: err.status, task: req.task }, "Anthropic API error");
        throw new AiProviderError(`AI service error (${err.status ?? "network"})`, "api_error");
      }
      throw err;
    }

    if (response.stop_reason === "refusal") throw new AiProviderError("The AI declined this request", "refusal");
    if (response.stop_reason === "max_tokens") throw new AiProviderError("AI response was truncated", "truncated");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiProviderError("AI returned malformed JSON", "invalid_output");
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiProviderError(`AI output failed schema validation: ${parsed.error.issues[0]?.message ?? ""}`, "invalid_output");
    }
    return { data: parsed.data, model: response.model };
  }
}
