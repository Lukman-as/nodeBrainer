import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { getAuth0, isAuthConfigured } from "@/lib/auth0";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function Home() {
  const ready = isAuthConfigured();
  if (ready && (await getAuth0().getSession())?.user?.sub)
    redirect("/workspace");
  return <KnowledgeWorkspace authConfigured={ready} />;
}
