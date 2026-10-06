import type { CompleteSessionInput, CompleteSessionResponse } from "@gymfit/shared";
import { withTransaction } from "../../db/pool.js";
import { completeSession, getSession } from "./service.js";

/**
 * Completes a session. Phase 5 extends this with plan adaptation; the
 * response shape already carries the list of adaptations.
 */
export async function completeAndAdapt(userId: string, sessionId: string, input: CompleteSessionInput): Promise<CompleteSessionResponse> {
  await withTransaction((db) => completeSession(userId, sessionId, input, db));
  return { session: await getSession(userId, sessionId), adaptations: [] };
}
