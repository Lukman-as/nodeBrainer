import { z } from "zod";
import { requireOwner, apiError, json, readJson } from "@/lib/http";
import { listItems } from "@/lib/repository";
import { searchKnowledge } from "@/lib/knowledge";
import { embedQuery } from "@/lib/gemini";
import { limitExpensiveRequests } from "@/lib/rate-limit";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    await limitExpensiveRequests(ownerId);
    const input = z
      .object({
        query: z.string().trim().min(1).max(500),
        type: z
          .enum(["all", "note", "pdf", "image", "link", "video"])
          .default("all"),
        tag: z.string().max(40).optional(),
      })
      .parse(await readJson(request));
    const items = (await listItems(ownerId)).filter(
      (i) =>
        (input.type === "all" || i.type === input.type) &&
        (!input.tag || i.tags.includes(input.tag)),
    );
    const started = performance.now();
    const vector = await embedQuery(input.query);
    const embeddingMs = Math.round(performance.now() - started);
    return json({
      ...searchKnowledge(items, input.query, vector),
      embeddingMs,
    });
  } catch (error) {
    return apiError(error);
  }
}
