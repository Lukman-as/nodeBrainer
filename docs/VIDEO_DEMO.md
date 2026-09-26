# Test videos, Gemini, and the answer box

## 1. Check Gemini independently

Copy `.env.example` to `.env.local` if you have not already created it. Add your key from [Google AI Studio](https://aistudio.google.com/apikey) as `GEMINI_API_KEY`. Keep this file private. Set `GEMINI_MODEL` to an available video-capable generation model for your project.

```sh
npm run gemini:check -- --list-models
npm run gemini:check
```

The first command lists generation models visible to your key (consult Google's model documentation for video support). The second sends a tiny test prompt. Neither prints your key. If the template's model is unavailable, select a supported model and update `GEMINI_MODEL`.

To test a video directly, use your own short, non-sensitive MP4 or WebM under **3 MB**:

```sh
npm run gemini:check -- --video /absolute/path/to/demo.mp4
```

This explicitly sends the selected file to Google and prints an extraction preview. It does not save anything to Lattice, and does not need Auth0 or MongoDB. Check whether the output matches what you actually said or showed.

## 2. Test the complete app

The `/` page is a keyless, browser-local sample library. Real uploads and generated answers use the private **`/workspace`** page.

1. Configure Auth0 and MongoDB using the [README](../README.md), then run `npm run db:setup`.
2. Set `GEMINI_API_KEY` and an available `GEMINI_MODEL` in `.env.local`.
3. Optional: set `ENABLE_GEMINI_EMBEDDINGS=true` for semantic retrieval, then import/re-save the content you want indexed. Synthesis works without this flag, but retrieval then uses keywords and graph connections.
4. Restart `npm run dev`, open `http://localhost:3000/workspace`, and sign in.
5. Select **Add content → Upload a file** and choose a short MP4/WebM below 3 MB. Select the checkbox allowing Gemini processing, then add it.
6. Wait for the item to appear. Open it and check its transcript/description, original video, and timestamp links. Extraction is a limited preview, not a guaranteed full transcript.
7. Ask a question using a specific term from that video. You should see **one answer**, labeled **Answer from your knowledge**, followed by numbered source citations.
8. Click a citation to inspect the passage. If necessary, open **Sources behind this answer** to see all cited items. The model should say when retrieved passages do not contain enough evidence.

Suggested controlled demo: record yourself explaining “Self-attention compares queries with keys, then uses the resulting weights to combine values.” Ask **“How does self-attention combine information in my video?”** A successful test retrieves the video passage, cites it, and describes that process without adding unsupported claims.

## YouTube alternative

Use **Add content → Paste a link**, paste a public YouTube video URL, and select the Gemini consent checkbox. Start with a short public video. Gemini's YouTube support is a preview capability; access and quotas vary, and some videos cannot be processed. This uses the video URL rather than the app's 3 MB file-upload path. See [Google's video-understanding documentation](https://ai.google.dev/gemini-api/docs/video-understanding).

## Troubleshooting

| Symptom                      | What to check                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local excerpt preview        | You are on `/`, or Gemini is not configured. Open the signed-in `/workspace` and restart after changing environment values.                       |
| Sign-in redirects to setup   | Auth0 variables are missing. Use the callback URL from the README.                                                                                |
| Database configuration error | Add `MONGODB_URI`, allow your development IP in Atlas, and create indexes.                                                                        |
| HTTP 404 from model test     | Run `--list-models`; update `GEMINI_MODEL` to an available model with video support.                                                              |
| HTTP 403                     | Check the API key's project and Gemini access.                                                                                                    |
| HTTP 429                     | Your model/project hit a quota. Wait and check AI Studio quota limits.                                                                            |
| File too large               | Use a smaller clip under 3 MB, or try a supported public YouTube URL. Larger uploads need the planned object-store/worker pipeline.               |
| No answer from the video     | Check extracted passages, clear type/topic filters, ask with a term actually present, or enable embeddings and reimport.                          |
| Generated citation error     | The response used an unknown source ID or omitted citations. Retry; the app rejects that response. This check does not prove factual correctness. |
| 3D graph unavailable         | Enable browser hardware acceleration/WebGL or use the keyboard-accessible source selector.                                                        |

Free-tier Gemini content may be used to improve Google's products. Start with non-sensitive demonstration material. [Gemini pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing)

## Graph controls

- Drag: orbit in three dimensions. Right-drag: pan. Scroll/pinch: zoom.
- Hover a source: title and connection count. Click: open that source.
- Hover an edge: numeric strength and relationship evidence.
- Stronger edges are thicker and brighter. Weak edges are dashed.
- Use **Min. strength** to hide weak connections; displayed counts show filtering and the rendering cap.
- Play/pause toggles optional auto-rotation. Reset restores the camera. Expand opens fullscreen when supported.
- **Focus a source** and **Open source** provide a keyboard alternative.

Only library items are data nodes. Faint cortical contours are decoration, not fabricated connections. The 3D renderer caps visible edges at 1,200; this does not change retrieval.

## Automatic model fallback

Set `GEMINI_MODEL` in `.env.local` to an ordered, comma-separated list of compatible generation models. A single name provides no fallback. For example:

```env
GEMINI_MODEL=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash
```

The server tries the next configured model on quota (429), unavailable model (404), or overload (503). It temporarily skips failed models on subsequent requests, respecting provider retry intervals with a minimum 60-second cooldown (five minutes for unavailable models). Cooldowns are local to each server process and reset on restart. All attempts share the request's existing timeout budget. Authentication and invalid-input errors are not retried across models.

Embedding models are kept separate to avoid mixing incompatible vector spaces. Switching generation models cannot guarantee success when all alternatives have exhausted quotas or project-level limits apply. `npm run gemini:check` checks the first model; fallback behavior has separate automated tests. Restart the development server after changing the environment list.
