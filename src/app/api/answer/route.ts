import { z } from "zod";
import { requireOwner, apiError, json, readJson, ApiError } from "@/lib/http";
import { listItems } from "@/lib/repository";
import { searchKnowledge } from "@/lib/knowledge";
import { embedQuery, generateGroundedAnswer } from "@/lib/gemini";
import { extractiveAnswer } from "@/lib/answers";
import { limitExpensiveRequests } from "@/lib/rate-limit";

import { buildAnswerContext } from "@/lib/answer-context";
import { mockItems } from "@/lib/mock-data";
import { demoItems } from "@/lib/demo-data";
import { previewLibrarySchema } from "@/lib/validation";
import { limitSampleAnswers } from "@/lib/sample-answers";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = z
      .object({
        library: z.enum(["private", "mock", "demo"]).default("private"),
        previewItems: previewLibrarySchema.optional(),
        stream: z.boolean().default(false),
        query: z.string().trim().min(1).max(500),
        type: z
          .enum(["all", "note", "pdf", "image", "link", "video"])
          .default("all"),
        tag: z.string().max(40).optional(),
      })
      .parse(await readJson(request, 1500000));
    let library;
    let vector;
    let answerScope = `sample:${input.library}`;
    if (input.library === "private") {
      const ownerId = await requireOwner(request);
      answerScope = `owner:${ownerId}`;
      await limitExpensiveRequests(ownerId);
      [library, vector] = await Promise.all([
        listItems(ownerId),
        embedQuery(input.query),
      ]);
    } else {
      limitSampleAnswers(request);
      library =
        input.library === "mock" ? mockItems : input.previewItems || demoItems;
    }
    const items = library.filter(
      (item) =>
        (input.type === "all" || item.type === input.type) &&
        (!input.tag || item.tags.includes(input.tag)),
    );
    const retrieval = searchKnowledge(items, input.query, vector);
    const context = buildAnswerContext(library, retrieval);
    const sources = context.sources;
    const generate = async () => {
      if (!sources.length) return extractiveAnswer(input.query, sources);
      if (!process.env.GEMINI_API_KEY)
        throw new ApiError(
          503,
          "Configure GEMINI_API_KEY on the server to generate answers.",
        );
      return generateGroundedAnswer(input.query, sources, context, answerScope);
    };
    if (!input.stream)
      return json({ ...retrieval, context, answer: await generate() });
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          if (!cancelled && !request.signal.aborted)
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        send({ type: "retrieval", retrieval, context });
        try {
          if (!request.signal.aborted)
            send({ type: "answer", answer: await generate() });
        } catch (error) {
          const response = apiError(error);
          send({ type: "error", ...(await response.json()) });
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
