import { GoogleGenAI } from "@google/genai";
import { logger } from "../../lib/logger.js";
import { toOutputJsonSchema } from "./jsonSchema.js";
import { AiProviderError, type LlmProvider, type StructuredRequest, type StructuredResult } from "./types.js";

/**
 * Gemini via the official @google/genai SDK.
 * Credentials come from the environment (GEMINI_API_KEY).
 * Output is constrained with JSON Schema and re-validated with Zod.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;
  readonly source = "ai" as const;
  private readonly client: GoogleGenAI;

  constructor(
    readonly model: string,
    apiKey?: string,
  ) {
    this.client = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    try {
      const contents = [
        ...(req.history?.map((h) => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        })) ?? []),
        { role: "user", parts: [{ text: req.prompt }] },
      ];

      const jsonSchema = toOutputJsonSchema(req.schema);

      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseSchema: jsonSchema as any,
          temperature: 0.4,
        },
      });

      const text = response.text;
      if (!text) {
        throw new AiProviderError("Gemini returned an empty response", "invalid_output");
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiProviderError("Gemini returned malformed JSON", "invalid_output");
      }

      const parsed = req.schema.safeParse(json);
      if (!parsed.success) {
        logger.warn({ issues: parsed.error.issues, task: req.task }, "Gemini output failed schema validation");
        throw new AiProviderError("Gemini output did not match required schema", "invalid_output");
      }

      return { data: parsed.data, model: this.model };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      logger.warn({ err, task: req.task }, "Gemini API error");
      throw new AiProviderError(`Gemini service error (${(err as Error).message})`, "api_error");
    }
  }
}
