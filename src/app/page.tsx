import { KnowledgeWorkspace } from "@/components/knowledge-workspace";
import { isAuthConfigured } from "@/lib/auth0";

export const dynamic = "force-dynamic";
export default function Home() {
  return <KnowledgeWorkspace authConfigured={isAuthConfigured()} />;
}
