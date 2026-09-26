import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Uses local credentials without printing them. The optional file is sent only to Google.
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const args = process.argv.slice(2);
async function call(endpoint, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${endpoint}`,
    {
      method: body ? "POST" : "GET",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!response.ok) {
    const hints = {
      400: "Check the model name and file format.",
      401: "Check your Gemini API key.",
      403: "Check API access and project permissions.",
      404: "This model is not available. Run with --list-models and update GEMINI_MODEL.",
      429: "Your project has reached a quota. Wait or choose an available free-tier model.",
    };
    throw new Error(
      `Gemini returned HTTP ${response.status}. ${hints[response.status] || "Retry later; the provider may be unavailable."}`,
    );
  }
  return response.json();
}
async function main() {
  if (!key)
    throw new Error(
      "Set GEMINI_API_KEY in .env.local first. Never paste it in chat.",
    );
  if (args[0] === "--list-models") {
    const data = await call("models");
    console.log("Generation models visible to this key:");
    for (const entry of data.models || [])
      if (entry.supportedGenerationMethods?.includes("generateContent"))
        console.log(entry.name.replace(/^models\//, ""));
    if (data.nextPageToken)
      console.log("Additional models may be available; consult AI Studio.");
    return;
  }
  let parts = [{ text: "Reply with READY only." }];
  if (args[0] === "--video") {
    const filename = args[1];
    if (!filename)
      throw new Error(
        "Usage: npm run gemini:check -- --video /path/to/short-video.mp4",
      );
    const metadata = await stat(filename);
    if (metadata.size > 3000000 || !metadata.size)
      throw new Error(
        "Choose a nonempty MP4/WebM smaller than 3 MB, matching the app limit.",
      );
    const extension = path.extname(filename).toLowerCase();
    if (![".mp4", ".webm"].includes(extension))
      throw new Error("Choose an MP4 or WebM.");
    const bytes = await readFile(filename);
    parts = [
      {
        text: "Describe what is said and shown in this short video. Return JSON with a title and segments array. Each segment must have text, start_seconds, end_seconds. Use only actual content and timestamps. If there is no speech, describe visible content and label it as a visual description.",
      },
      {
        inlineData: {
          mimeType: extension === ".mp4" ? "video/mp4" : "video/webm",
          data: bytes.toString("base64"),
        },
      },
    ];
    console.log(
      "Sending the selected short video to Google Gemini for this test.",
    );
  } else if (args.length)
    throw new Error(
      "Supported options: --list-models or --video /path/to/clip.mp4",
    );
  const data = await call(
    `models/${encodeURIComponent(model)}:generateContent`,
    {
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: 1500,
        ...(args[0] === "--video"
          ? { responseMimeType: "application/json" }
          : {}),
      },
    },
  );
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");
  if (!text)
    throw new Error(
      "No text was returned. The model may have blocked or could not read the input.",
    );
  console.log(`Gemini responded successfully using ${model}.`);
  if (args[0] === "--video") console.log(text);
  else
    console.log(
      "Next: sign in at /workspace, import a small video, and ask about its content.",
    );
}
main().catch((error) => {
  console.error(
    error.name === "TimeoutError"
      ? "The Gemini request timed out. Try a shorter clip."
      : error.message,
  );
  process.exitCode = 1;
});
