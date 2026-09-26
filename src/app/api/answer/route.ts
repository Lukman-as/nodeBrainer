import { z } from "zod";
import { requireOwner, apiError, json, readJson } from "@/lib/http";
import { listItems } from "@/lib/repository";
import { searchKnowledge } from "@/lib/knowledge";
import { embedQuery, generateGroundedAnswer } from "@/lib/gemini";
import { answerSources, extractiveAnswer } from "@/lib/answers";
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
      (item) =>
        (input.type === "all" || item.type === input.type) &&
        (!input.tag || item.tags.includes(input.tag)),
    );
    const vector = await embedQuery(input.query);
    const retrieval = searchKnowledge(items, input.query, vector);
    const sources = answerSources(items, retrieval);
    const answer =
      sources.length && process.env.GEMINI_API_KEY
        ? await generateGroundedAnswer(input.query, sources)
        : extractiveAnswer(input.query, sources);
    return json({ ...retrieval, answer });
  } catch (error) {
    return apiError(error);
  }
}
