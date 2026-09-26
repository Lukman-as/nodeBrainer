import "server-only";
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export function isAuthConfigured() {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    process.env.AUTH0_SECRET &&
    process.env.APP_BASE_URL,
  );
}

let client: Auth0Client | undefined;
export function getAuth0() {
  if (!isAuthConfigured()) throw new Error("Auth0 is not configured.");
  client ??= new Auth0Client({ signInReturnToPath: "/workspace" });
  return client;
}
