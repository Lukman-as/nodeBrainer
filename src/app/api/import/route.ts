import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOwner, apiError, ApiError, json, readJson } from "@/lib/http";
import { insertItem, withoutVectors } from "@/lib/repository";
import { KnowledgeItem, segmentText } from "@/lib/knowledge";
import { embedSegments, extractMedia } from "@/lib/gemini";
import { extractArticle, validatePublicUrl } from "@/lib/safe-url";
import { limitExpensiveRequests } from "@/lib/rate-limit";
import { deleteAsset, uploadAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 150;
const mediaTypes: Record<string, KnowledgeItem["type"]> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
};
// ponytail: files go to Gemini inline (base64, 20 MB request cap), so 14 MB is the ceiling.
// Longer videos need a direct browser-to-storage upload plus the Gemini Files API.
const MAX_FILE = 14_000_000;
export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    await limitExpensiveRequests(ownerId);
    let item: KnowledgeItem;
    let asset: { path: string; mime: string } | undefined;
    const now = new Date().toISOString();
    const base = {
      id: randomUUID(),
      status: "ready" as const,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const reader = request.body?.getReader();
      if (!reader) throw new ApiError(400, "Choose a file.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_FILE + 200_000) {
          await reader.cancel();
          throw new ApiError(413, "Choose a file smaller than 14 MB.");
        }
        chunks.push(value);
      }
      const form = await new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > MAX_FILE)
        throw new ApiError(400, "Choose a nonempty file smaller than 14 MB.");
      const buffer = Buffer.from(await file.arrayBuffer());
      if (/\.(md|markdown|txt)$/i.test(file.name)) {
        const text = buffer.toString("utf8");
        if (text.length > 40000)
          throw new ApiError(
            413,
            "Text imports support up to 40,000 characters.",
          );
        item = {
          ...base,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 180),
          type: "note",
          content: text,
          tags: [
            ...new Set(
              [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) =>
                m[1].toLowerCase(),
              ),
            ),
          ].slice(0, 12),
          segments: segmentText(text),
        };
      } else {
        const type = mediaTypes[file.type];
        if (!type)
          throw new ApiError(
            415,
            "Supported: Markdown, text, PDF, PNG, JPEG, WebP, MP4, and WebM.",
          );
        if (form.get("consent") !== "true")
          throw new ApiError(400, "Please allow Gemini to process this file.");
        const valid =
          file.type === "application/pdf"
            ? buffer.subarray(0, 5).toString() === "%PDF-"
            : file.type === "image/png"
              ? buffer
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : file.type === "image/jpeg"
                ? buffer[0] === 255 && buffer[1] === 216
                : file.type === "image/webp"
                  ? buffer.subarray(0, 4).toString() === "RIFF" &&
                    buffer.subarray(8, 12).toString() === "WEBP"
                  : file.type === "video/mp4"
                    ? buffer.subarray(4, 8).toString() === "ftyp"
                    : buffer
                        .subarray(0, 4)
                        .equals(Buffer.from([26, 69, 223, 163]));
        if (!valid)
          throw new ApiError(415, "The file content does not match its type.");
        const extracted = await extractMedia({ buffer, mime: file.type });
        item = {
          ...base,
          ...extracted,
          type,
          content: extracted.segments.map((s) => s.text).join("\n\n"),
          hasAsset: true,
        };
        asset = { path: base.id, mime: file.type };
        await uploadAsset(asset.path, buffer, file.type);
      }
    } else {
      const input = z
        .object({
          url: z.string().max(2000),
          consent: z.boolean().default(false),
        })
        .parse(await readJson(request));
      const url = validatePublicUrl(input.url);
      if (
        ["www.youtube.com", "youtube.com", "youtu.be"].includes(url.hostname)
      ) {
        if (!input.consent)
          throw new ApiError(400, "Please allow Gemini to process this video.");
        const extracted = await extractMedia({ youtubeUrl: url.href });
        item = {
          ...base,
          ...extracted,
          type: "video",
          content: extracted.segments.map((s) => s.text).join("\n\n"),
          sourceUrl: url.href,
        };
      } else {
        const article = await extractArticle(url.href);
        item = {
          ...base,
          title: article.title,
          type: "link",
          content: article.text,
          tags: [],
          segments: segmentText(article.text),
          sourceUrl: article.url,
        };
      }
    }
    try {
      item.segments = await embedSegments(item.segments);
      await insertItem(ownerId, item, asset);
    } catch (error) {
      if (asset) await deleteAsset(asset.path).catch(() => {});
      throw error;
    }
    return json({ item: withoutVectors(item) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
