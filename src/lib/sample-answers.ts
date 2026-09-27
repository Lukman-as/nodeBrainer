import "server-only";
import { ApiError } from "./api-error";

const state = globalThis as typeof globalThis & {
  sampleAnswerWindow?: { until: number; count: number };
};

/** Bound sample-library Gemini use without requiring a database connection. */
export function limitSampleAnswers(request: Request) {
  const target = new URL(process.env.APP_BASE_URL || request.url);
  const allowed = new Set([target.origin]);
  if (
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(target.hostname)
  ) {
    for (const hostname of ["localhost", "127.0.0.1"]) {
      const local = new URL(target);
      local.hostname = hostname;
      allowed.add(local.origin);
    }
  }
  if (!allowed.has(request.headers.get("origin") || ""))
    throw new ApiError(403, "Request origin is not allowed.");
  const now = Date.now();
  if (!state.sampleAnswerWindow || state.sampleAnswerWindow.until <= now)
    state.sampleAnswerWindow = { until: now + 60000, count: 0 };
  if (state.sampleAnswerWindow.count >= 12)
    throw new ApiError(
      429,
      "Please wait a moment before asking another sample question.",
    );
  state.sampleAnswerWindow.count++;
}
