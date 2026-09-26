import "server-only";
import { ApiError } from "./api-error";

/** Supabase Storage over its REST API. Objects live in a private bucket; the service key never leaves the server. */
export const BUCKET = "assets";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(503, "Add Supabase Storage settings to store uploaded files.");
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, key };
}

async function call(path: string, init: RequestInit) {
  const { base, key } = config();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new ApiError(502, "File storage is unavailable. Try again shortly.");
  return response;
}

export async function uploadAsset(path: string, buffer: Buffer, mime: string) {
  await call(`/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: new Uint8Array(buffer),
  });
}

/** Short-lived URL so the browser streams (and range-requests) video straight from storage. */
export async function signedAssetUrl(path: string) {
  const response = await call(`/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  const { signedURL } = await response.json();
  return `${config().base}${signedURL}`;
}

export async function deleteAsset(path: string) {
  await call(`/object/${BUCKET}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
}
