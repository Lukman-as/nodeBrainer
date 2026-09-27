# Lattice

A multimedia knowledge workspace: collect notes, PDFs, images, public articles, and short videos; find source passages; inspect the connections that led to a discovery.

Built from the supplied conversation. The earlier Python/Postgres architecture was a proposal, not a requirement. This first implementation uses one TypeScript application to reduce hackathon setup, while keeping extraction, storage, and retrieval separate.

## Run the demo

Requires Node.js 20.19+ and npm. Dependencies and a lockfile are included.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. No API keys are needed for the local demo.

- Create/edit/delete notes, import `.md`/`.txt`, filter types/topics, and export Markdown or a library JSON snapshot.
- Ask **what is a transformer architecture**. The question box returns one answer card with source citations. Without Gemini it is explicitly labeled an extractive preview.
- The app opens on the **Memory Map**, the interactive 3D knowledge brain: drag to orbit, hover for details, filter edges by strength, and search it with “What are you trying to remember?”. **Recent Activity**, **Search History**, and **My Library** are in the sidebar.
- Select graph nodes to open related content.
- Demo edits are stored in this browser. Sample PDF/image/video/article entries contain illustrative excerpts, not attached originals. Demo search uses keywords, explicit links, and tags; it does not claim to use an AI model.

## Connect the private application

1. Copy the template (do not overwrite an existing configuration):

   ```sh
   cp .env.example .env.local
   openssl rand -hex 32
   ```

2. Create an Auth0 **Regular Web Application**. In `.env.local`, set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and the generated value as `AUTH0_SECRET`. Set `APP_BASE_URL=http://localhost:3000`.

3. Configure Auth0:

   | Setting               | Local value                           |
   | --------------------- | ------------------------------------- |
   | Allowed Callback URLs | `http://localhost:3000/auth/callback` |
   | Allowed Logout URLs   | `http://localhost:3000`               |
   | Application type      | Regular Web Application               |

   Use `localhost` consistently for login and API requests; do not switch to `127.0.0.1` midway through a session. The official SDK handles login, logout, callback, and encrypted HTTP-only session cookies. See [Auth0 SDK setup](https://github.com/auth0/nextjs-auth0).

4. Create a MongoDB Atlas Free cluster, a database user scoped to this application's database, and a network access entry for your development IP. Put the connection string in `MONGODB_URI`; set `MONGODB_DB=lattice` or keep the default. Run:

   ```sh
   npm run db:setup
   ```

   This creates the owner/list index and a TTL index for request-limit records. See [Atlas Free setup](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/).

5. Optionally add `GEMINI_API_KEY`. This enables PDF, PNG/JPEG/WebP, small MP4/WebM, and supported YouTube extraction. `GEMINI_MODEL` is configurable; use an available model in your AI Studio project. The checked documentation currently uses `gemini-3.8-flash`. Provider access and free quotas vary.

6. For semantic search, explicitly set `ENABLE_GEMINI_EMBEDDINGS=true`. The default text embedding model is `gemini-embedding-001`. New/edited items then receive embeddings. Re-save older notes to index them. Changing embedding models requires reindexing; incompatible vectors are never compared. This sends saved passages and queries to Google. Media imports require a consent checkbox. Google's free API tier may use submitted content to improve its products. See [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [embeddings](https://ai.google.dev/gemini-api/docs/embeddings).

7. Restart the server. Use the sign-in icon, or open `/workspace`. The private library starts empty; demo data is not copied into a real account.

Keep secrets in `.env.local` or hosting environment variables. Never prefix secrets with `NEXT_PUBLIC_`.

## What is implemented

| Capability                              | Local demo                 | Private workspace                                |
| --------------------------------------- | -------------------------- | ------------------------------------------------ |
| Responsive library, graph, source panel | Yes                        | Yes                                              |
| Notes, Markdown import/export, filters  | Browser storage            | MongoDB                                          |
| Keyword and weighted graph search       | Yes                        | Yes                                              |
| Semantic passage retrieval              | No                         | Gemini key + opt-in setting                      |
| PDF/image/short-video extraction        | Illustrative samples only  | Gemini key + per-import consent                  |
| Public article import                   | Paste an excerpt as a note | Safe server-side HTML extraction                 |
| Public YouTube understanding            | Illustrative sample only   | Gemini preview capability; availability varies   |
| Source files                            | No sample originals        | Private Supabase Storage objects, at most 14 MB each |
| User authentication                     | No; public sandbox         | Auth0                                            |

The APIs are implemented but live provider calls need your credentials. No tenant, cloud database, paid account, or public deployment was created.

## Video and Gemini testing

Follow [the video demo guide](docs/VIDEO_DEMO.md) to verify your Gemini key, test a short clip directly, and run the complete import → answer → citation workflow.

```sh
npm run gemini:check
npm run gemini:check -- --video /absolute/path/to/demo.mp4
```

Generated answers send the question and up to six retrieved passages to Gemini. They cite only supplied source IDs; verify factual claims against the originals.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Tests cover recorded paths, isolated direct matches, no-match behavior, traversal limits, bounded edge weights, model compatibility, chunk integrity, semantic retrieval with a synthetic vector, and private-network URL rejection. They do not replace end-to-end Auth0/Atlas/Gemini testing with real credentials.

## Project map

```text
src/app/                         Next.js pages and API routes
src/components/knowledge-workspace.tsx  Library, editor, import and search UI
src/components/knowledge-graph.tsx      Lazy-loaded Three.js graph
src/components/graph-scene.tsx          Orbit, hover, weighted edges and camera controls
src/components/answer-panel.tsx         One answer with citations
src/lib/knowledge.ts             Pure ranking, segmentation and graph logic
src/lib/repository.ts            Owner-scoped MongoDB storage
src/lib/auth0.ts                 Server-side Auth0 client
src/lib/gemini.ts                Media extraction, embeddings, grounded answer generation
src/lib/answers.ts               Bounded source context and citation validation
src/lib/safe-url.ts              Public URL validation, pinned DNS and HTML parsing
src/lib/http.ts                  Auth guards, request limits and error handling
src/proxy.ts                    Auth0 SDK routes/session handling
scripts/setup-database.mjs       MongoDB indexes
tests/                          Retrieval and integrity checks
docs/BUILD_PLAN.md               Frontend/backend contracts and remaining work
docs/SPONSOR_STRATEGY.md         Free tiers, sponsor fit and demo strategy
```

## Prototype boundaries

- One personal library per Auth0 account. No shared workspaces or collaboration yet.
- Up to 200 items per library. Retrieval scans the bounded library and graph building compares pairs. It is not an Atlas Vector Search implementation or a large-corpus benchmark.
- Uploads are capped at 14 MB (Gemini inline limit), notes at 40,000 characters, and extraction at 24 representative passages. Media processing runs during the HTTP request with a provider timeout. There is no durable worker, job queue, cancellation/resume, ZIP vault import, or full-video transcription yet.
- Failed imports return a clear error and can be resubmitted; failed source files are not persisted as jobs. Do not present the prototype as a durable ingestion service.
- PDF pages and video timestamps are AI-extracted locators. Verify them against originals. Descriptions are labeled separately from source text. Large files need object storage and a worker before deployment to real users.
- Public article parsing cannot read arbitrary authenticated, paywalled, or JavaScript-only social posts. It does not bypass access controls.
- Edge overrides, automated reindexing, vector-index retrieval, favorites, and quantitative retrieval evaluation are not implemented.
- The public demo persists only in browser storage. Export important work; clearing browser data removes it.

## Deployment

For a small noncommercial demonstration, use Vercel Hobby with the same environment variables, a reachable Atlas cluster, and production Auth0 callback/logout URLs. Hobby is restricted to personal, noncommercial use; confirm your project fits. Media requests can exceed serverless execution time, which is why a worker is the next infrastructure milestone. See [Vercel Hobby](https://vercel.com/docs/plans/hobby).

For sponsor cloud deployment, request event credits for Vultr or DigitalOcean and run the Next.js server behind HTTPS. Do not assume these services are permanently free. The current local `start` command binds loopback; adapt network binding and the reverse proxy intentionally for deployment.
