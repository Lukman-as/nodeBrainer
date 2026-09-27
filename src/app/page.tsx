import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { getAuth0, isAuthConfigured } from "@/lib/auth0";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ready = isAuthConfigured();
  // The demo is the 100-note mock library; /?mock shows it even when signed in.
  const mock = "mock" in (await searchParams);
  if (!mock && ready && (await getAuth0().getSession())?.user?.sub)
    redirect("/workspace");
  return <KnowledgeWorkspace authConfigured={ready} mock />;
}
