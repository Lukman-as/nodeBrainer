import { getAuth0, isAuthConfigured } from "@/lib/auth0";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isAuthConfigured())
    return Response.json(
      { error: "Authentication is not configured." },
      { status: 503, headers },
    );
  const session = await getAuth0().getSession();
  if (!session?.user?.sub)
    return Response.json(
      { error: "Sign in required." },
      { status: 401, headers },
    );
  return Response.json(
    { user: { id: session.user.sub, name: session.user.name ?? null } },
    { headers },
  );
}
