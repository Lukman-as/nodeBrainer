import { redirect } from "next/navigation";
import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { getAuth0, isAuthConfigured } from "@/lib/auth0";

export const dynamic = "force-dynamic";
export default async function WorkspacePage() {
  if (!isAuthConfigured()) redirect("/setup");
  const session = await getAuth0().getSession();
  if (!session?.user?.sub) redirect("/auth/login");
  return (
    <KnowledgeWorkspace
      live
      authConfigured
      name={session.user.name}
      geminiConfigured={Boolean(process.env.GEMINI_API_KEY)}
      semanticEnabled={
        process.env.ENABLE_GEMINI_EMBEDDINGS === "true" &&
        Boolean(process.env.GEMINI_API_KEY)
      }
    />
  );
}
