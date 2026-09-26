import "server-only";
import { ZodError } from "zod";
import { getAuth0, isAuthConfigured } from "./auth0";

import { ApiError } from "./api-error";
export { ApiError } from "./api-error";
export async function requireOwner(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      !origin ||
      origin !==
        new URL(process.env.APP_BASE_URL || "http://localhost:3000").origin
    )
      throw new ApiError(403, "Request origin is not allowed.");
  }
  if (!isAuthConfigured())
    throw new ApiError(
      503,
      "Connect Auth0 to use your private library. The demo is available without sign-in.",
    );
  const session = await getAuth0().getSession();
  if (!session?.user?.sub)
    throw new ApiError(401, "Please sign in to continue.");
  if (!process.env.DATABASE_URL)
    throw new ApiError(503, "Connect Tiger Data to save your library.");
  return session.user.sub;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues[0]?.message || "Invalid input." }, 400);
  if (error instanceof SyntaxError)
    return json({ error: "Invalid request format." }, 400);
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error:
        "The request could not be completed. Check the service configuration and try again.",
    },
    500,
  );
}
export async function readJson(request: Request, maximum = 200000) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maximum) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
