import { z } from "zod";
import { ApiError } from "./api-error";
import {
  answerDraftSchema,
  validateAnswerDraft,
  type AnswerSource,
} from "./answers";

export function answerResponseSchema(sources: AnswerSource[]) {
  const ids = [...new Set(sources.map((source) => source.id))];
  if (!ids.length) throw new Error("Answer generation needs source context.");
  const paragraph = answerDraftSchema.shape.paragraphs.element.extend({
    citations: z.array(z.enum(ids as [string, ...string[]])).max(8),
  });
  return z.toJSONSchema(
    answerDraftSchema.extend({
      paragraphs: z.array(paragraph).min(1).max(3),
    }),
  );
}

type GeminiAnswerResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
};

/** Never replace missing or invented citations with guesses. */
export function parseGeminiAnswer(
  result: GeminiAnswerResponse,
  sources: AnswerSource[],
) {
  const candidate = result.candidates?.[0];
  if (
    result.promptFeedback?.blockReason ||
    (candidate?.finishReason &&
      !["STOP", "MAX_TOKENS"].includes(candidate.finishReason))
  )
    throw new ApiError(
      502,
      "Gemini could not complete this answer. Try rephrasing your question.",
    );
  if (candidate?.finishReason === "MAX_TOKENS")
    throw new ApiError(
      502,
      "Gemini's answer was cut off at its output limit. Please try a more focused question.",
    );
  const text = candidate?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!text)
    throw new ApiError(
      502,
      "Gemini returned no answer text. Please try again.",
    );
  // Some models still wrap JSON in a code fence. Unwrap only the entire response.
  const json = text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  let draft: unknown;
  try {
    draft = JSON.parse(json);
  } catch {
    throw new ApiError(
      502,
      "Gemini returned an incomplete or malformed answer. Please try again.",
    );
  }
  try {
    return validateAnswerDraft(draft, sources);
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new ApiError(
        502,
        "Gemini's answer did not match the expected format. Please try again.",
      );
    if (
      error instanceof Error &&
      error.message === "Answer cited an unknown source."
    )
      throw new ApiError(
        502,
        "Gemini cited a source that was not in the provided context. Please try again.",
      );
    if (
      error instanceof Error &&
      error.message === "Answer omitted source citations."
    )
      throw new ApiError(
        502,
        "Gemini omitted the supporting citations. Please try again.",
      );
    throw error;
  }
}
