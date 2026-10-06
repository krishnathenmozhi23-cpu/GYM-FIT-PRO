import { env } from "../../config/env.js";
import { AnthropicProvider } from "./anthropic.js";
import { DevMockProvider } from "./devMock.js";
import type { LlmProvider } from "./types.js";

let provider: LlmProvider | null | undefined;

/** The configured LLM, or null when AI_PROVIDER=none (rule engine only). */
export function getProvider(): LlmProvider | null {
  if (provider !== undefined) return provider;
  provider =
    env.AI_PROVIDER === "anthropic"
      ? new AnthropicProvider(env.AI_MODEL, env.AI_TIMEOUT_MS)
      : env.AI_PROVIDER === "mock"
        ? new DevMockProvider()
        : null;
  return provider;
}

/** Test hook: swap the provider (e.g. a fake that returns invalid output). */
export function setProviderForTests(p: LlmProvider | null) {
  provider = p;
}
