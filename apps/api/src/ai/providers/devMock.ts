import { AiProviderError, type LlmProvider, type StructuredRequest, type StructuredResult } from "./types.js";

/**
 * ⚠️ DEVELOPMENT MOCK — NOT AN AI. ⚠️
 *
 * Returns the deterministic value supplied by the caller (`devMockOutput`,
 * usually the rule-engine result) so the request → structured output →
 * validation → persistence pipeline can be exercised without an API key.
 * Every result is labelled `dev_mock` and the UI shows it as such.
 * Enable with AI_PROVIDER=mock. Replace with a real provider for production.
 */
export class DevMockProvider implements LlmProvider {
  readonly name = "mock" as const;
  readonly model = "dev-mock";
  readonly source = "dev_mock" as const;

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const parsed = req.schema.safeParse(req.devMockOutput());
    if (!parsed.success) throw new AiProviderError("Mock output failed schema validation", "invalid_output");
    return { data: parsed.data, model: this.model };
  }
}
