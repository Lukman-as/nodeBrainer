import { requireOwner, apiError, ApiError } from "@/lib/http";
import { getAsset } from "@/lib/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerId = await requireOwner();
    const { id } = await context.params;
    const item = await getAsset(ownerId, id);
    if (!item?.asset || !item.mime)
      throw new ApiError(404, "Original file not found.");
    return new Response(new Uint8Array(item.asset), {
      headers: {
        "Content-Type": item.mime,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
