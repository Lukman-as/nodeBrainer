import { requireOwner, json, apiError, ApiError } from "@/lib/http";
import { listItems, saveIndex } from "@/lib/repository";
import { semanticEnabled, reindexItems } from "@/lib/semantic-index";
import { limitExpensiveRequests } from "@/lib/rate-limit";
export const maxDuration = 150;
export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    await limitExpensiveRequests(owner);
    if (!semanticEnabled())
      throw new ApiError(
        503,
        "Enable Gemini embeddings in server settings first.",
      );
    const result = await reindexItems(
      await listItems(owner),
      (item, segments, graph) => saveIndex(owner, item, segments, graph),
    );
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
