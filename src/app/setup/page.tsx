import Link from "next/link";
import { ArrowLeft, ArrowRight, Mountain } from "lucide-react";
import { isAuthConfigured } from "@/lib/auth0";

export const dynamic = "force-dynamic";
export default function SetupPage() {
  const ready = isAuthConfigured();
  return (
    <main className="setup-page">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        Back to the demo
      </Link>
      <div className="setup-card">
        <span className="brand-mark">
          <Mountain size={25} />
        </span>
        <div className="eyebrow">MAKE IT YOURS</div>
        <h1>Connect your knowledge space.</h1>
        <p>
          Try the interactive demo any time. Connect your accounts to save a
          private multimedia library.
        </p>
        <ol className="setup-list">
          <li>
            <strong>Create your local configuration</strong>
            <p>
              Copy <code>.env.example</code> to <code>.env.local</code>. Keep
              credentials in that file, never in chat or source control.
            </p>
          </li>
          <li>
            <strong>Connect Auth0</strong>
            <p>
              Create a Regular Web Application. Add the domain, client ID,
              client secret, and a generated session secret to your local
              configuration.
            </p>
            <p>
              Callback: <code>http://localhost:3000/auth/callback</code>
              <br />
              Logout: <code>http://localhost:3000</code>
            </p>
          </li>
          <li>
            <strong>Connect Tiger Data</strong>
            <p>
              Create a Tiger Cloud PostgreSQL service and set{" "}
              <code>DATABASE_URL</code>. Then run npm run db:setup to create
              tables and indexes. Notes, source files, and extracted passages are stored
              privately under your Auth0 account.
            </p>
          </li>
          <li>
            <strong>Enable multimedia with Gemini</strong>
            <p>
              Add <code>GEMINI_API_KEY</code> for PDF, image, and short-video
              extraction. Set <code>ENABLE_GEMINI_EMBEDDINGS=true</code> only if
              you want notes and queries sent to Google for semantic search.
              Free-tier content may be used to improve Google’s products.
            </p>
          </li>
          <li>
            <strong>Restart and sign in</strong>
            <p>
              Restart the development server after saving configuration. Full
              instructions and the build plan are in the project README.
            </p>
          </li>
        </ol>
        <div className="setup-status">
          {ready
            ? "Auth0 credentials are configured. You can try signing in."
            : "Auth0 needs configuration before sign-in is available."}
        </div>
        {ready && (
          <a className="button dark" href="/auth/login">
            Sign in with Auth0
            <ArrowRight size={17} />
          </a>
        )}
      </div>
    </main>
  );
}
