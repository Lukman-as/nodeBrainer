import { randomUUID } from "node:crypto";
import { requireOwner, apiError, json, readJson } from "@/lib/http";
import {
  indexMissingEmbeddings,
  insertItem,
  listItems,
  withoutVectors,
} from "@/lib/repository";
import { noteInput } from "@/lib/validation";
import { segmentText, KnowledgeItem, buildGraph } from "@/lib/knowledge";
import { embedSegments } from "@/lib/gemini";
import { limitExpensiveRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    const owner = await requireOwner();
    const items = await listItems(owner);
    await indexMissingEmbeddings(owner, items);
    return json({ items: items.map(withoutVectors), edges: buildGraph(items) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    await limitExpensiveRequests(owner);
    const input = noteInput.parse(await readJson(request));
    const now = new Date().toISOString();
    const item: KnowledgeItem = {
      ...input,
      tags: [...new Set(input.tags.map((t) => t.toLowerCase()))],
      id: randomUUID(),
      type: "note",
      segments: await embedSegments(segmentText(input.content), input.title),
      status: "ready",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await insertItem(owner, item);
    return json({ item: withoutVectors(item) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
