# Free stack and sponsor strategy

Checked September 26, 2026. Recommendations are specific to Lattice's knowledge-search workflow.

## Recommended free stack

| Layer                             | Recommendation                        | Limits and fit                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend and API                  | Next.js + TypeScript                  | One codebase, responsive React UI, server-only integrations                                                                                                                                                  |
| Authentication                    | Auth0 Free                            | Current pricing lists up to 25,000 monthly active users. Use Universal Login and private-library authorization. [Pricing](https://auth0.com/pricing)                                                         |
| Database                          | MongoDB Atlas Free                    | 512 MB shared database storage. Fits small notes, segments, and metadata; included here. [Pricing](https://www.mongodb.com/pricing)                                                                          |
| SQL alternative                   | Supabase Free Postgres                | 500 MB database and 1 GB file storage; projects pause after inactivity. Good if SQL/pgvector becomes the priority. Keep Auth0 for login. [Pricing](https://supabase.com/pricing)                             |
| AI                                | Gemini API free tier, eligible models | Useful for PDF/image/video extraction and optional embeddings. Model-specific quotas; free content may be used for product improvement. [Pricing](https://ai.google.dev/gemini-api/docs/pricing)             |
| Deployment                        | Vercel Hobby                          | Simple Next.js hosting for qualifying personal/noncommercial projects. Long media jobs need a worker. [Plan](https://vercel.com/docs/plans/hobby)                                                            |
| Larger original files, next stage | Cloudflare R2 Standard                | Monthly free allowance includes 10 GB-month storage, 1M Class A and 10M Class B operations; usage above allowances is billable. Not yet integrated. [Pricing](https://developers.cloudflare.com/r2/pricing/) |

For this weekend, use Auth0 + Atlas + Gemini. Extra infrastructure should serve a visible feature. A free allowance is not a guarantee that every model, quota, advanced authentication feature, or deployment configuration is free.

## Prize priorities

MLH's general prize page lists Auth0, Gemini, MongoDB Atlas, ElevenLabs, Backboard, Vultr, DigitalOcean, and other tracks. This is a general catalog, not confirmation of eligibility at your event. The page includes sponsor artwork with different date ranges. Verify the event-specific Devpost/organizer rules before choosing submissions. [MLH prize catalog](https://www.mlh.com/events/prizes)

| Priority | Integration           | A meaningful Lattice demo                                                                                                                                   |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Auth0                 | Sign in, save private knowledge, then demonstrate a second account cannot retrieve it. Implemented; tenant setup and live verification remain.              |
| 1        | Gemini                | Extract a diagram and a video passage, then retrieve them through a paraphrased question with locators. Implemented adapter; requires a key and validation. |
| 1        | MongoDB Atlas         | Persist original content, source-linked segments, and account ownership. Show a reload retaining real user data. Implemented; cluster setup remains.        |
| 2        | ElevenLabs            | Add an accessible “Listen to this passage” feature or a short audio briefing with source links. Proposed, not implemented.                                  |
| 3        | Backboard             | Add a research assistant that remembers the user's open questions between sessions; retain source evidence. Proposed, not implemented.                      |
| Optional | Vultr or DigitalOcean | Deploy the extraction worker using event credits when durable media jobs exist. Proposed; credits are not permanent free hosting.                           |

ElevenLabs currently offers a free text-to-speech allowance; it is a natural accessibility extension. Check account limits and attribution/license terms before sharing generated audio. [ElevenLabs pricing](https://elevenlabs.io/pricing)

Avoid adding Solana, biometrics, or a second database solely for a prize unless the product develops a real need. Strong judging material comes from a reliable, distinctive workflow and demonstrated user benefit, not the number of sponsor logos.

The local folder suggests Hack the Hill. Its official website lists September 25–27, 2026 at uOttawa, but your event-specific sponsor track eligibility still needs confirmation. [Hack the Hill](https://hackthehill.com/)

## Two-minute demo

1. **Problem:** “My research is scattered across files, videos, and saved posts. Search finds words but misses connections.”
2. **Capture:** Import a small real PDF and an image into a signed-in private library.
3. **Retrieve:** Search a question in different wording and open the exact source passage.
4. **Differentiate:** Follow a graph discovery into a related item. Show the recorded path and edge evidence.
5. **Trust:** Distinguish source text from generated descriptions, and demonstrate account isolation.
6. **Evidence:** Report an honest small evaluation if available. Otherwise describe measured behavior as a prototype, without claiming accuracy or speed improvements.

Use the built-in sample query to rehearse, but use your own successfully ingested material for a sponsor-integration submission. A keyless demo alone does not demonstrate a live sponsor API integration.
