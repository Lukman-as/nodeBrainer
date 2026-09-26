import { z } from "zod";
import { requireOwner, apiError, ApiError, json, readJson } from "@/lib/http";
import { getItem, updateNote, deleteItem, withoutVectors } from "@/lib/repository";
import { noteInput } from "@/lib/validation";
import { segmentText } from "@/lib/knowledge";
import { embedSegments } from "@/lib/gemini";
import { limitExpensiveRequests } from "@/lib/rate-limit";

type Context = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export async function PATCH(request: Request, context: Context) {
  try {
    const ownerId = await requireOwner(request);
    await limitExpensiveRequests(ownerId);
    const { id } = await context.params;
    const { version, ...input } = noteInput
      .extend({ version: z.number().int().positive() })
      .parse(await readJson(request));
    const existing = await getItem(ownerId, id);
    if (!existing) throw new ApiError(404, "Item not found.");
    if (existing.type !== "note")
      throw new ApiError(
        400,
        "Only notes can be edited. Source extractions are preserved.",
      );
    if (existing.version !== version)
      throw new ApiError(
        409,
        "This note changed in another window. Reload before saving again.",
      );
    const segments = await embedSegments(segmentText(input.content));
    const item = await updateNote(ownerId, id, version, {
      ...input,
      tags: [...new Set(input.tags.map((t) => t.toLowerCase()))],
      segments,
      updatedAt: new Date().toISOString(),
    });
    if (!item)
      throw new ApiError(
        409,
        "This note changed while you were saving. Reload before saving again.",
      );
    return json({ item: withoutVectors(item) });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    if (!(await deleteItem(ownerId, id))) throw new ApiError(404, "Item not found.");
    return json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
