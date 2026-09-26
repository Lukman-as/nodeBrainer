import { z } from "zod";
import { KnowledgeItem, SearchResponse, Segment, tokens } from "./knowledge";

export type AnswerSource = {
  id: string;
  itemId: string;
  segmentId: string;
  title: string;
  type: KnowledgeItem["type"];
  text: string;
  kind: Segment["kind"];
  locator: Segment["locator"];
};
export type KnowledgeAnswer = {
  mode: "gemini" | "extractive" | "empty";
  paragraphs: { text: string; citations: string[] }[];
  sources: AnswerSource[];
  insufficientContext: boolean;
};
export const answerDraftSchema = z.object({
  paragraphs: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(3000),
        citations: z.array(z.string().max(12)).max(8),
      }),
    )
    .min(1)
    .max(6),
  insufficientContext: z.boolean(),
});

export function answerSources(
  items: KnowledgeItem[],
  retrieval: SearchResponse,
): AnswerSource[] {
  return retrieval.results.slice(0, 6).flatMap((result, i) => {
    const item = items.find((item) => item.id === result.itemId);
    const segment = item?.segments.find(
      (segment) => segment.id === result.segmentId,
    );
    return item && segment
      ? [
          {
            id: `S${i + 1}`,
            itemId: item.id,
            segmentId: segment.id,
            title: item.title,
            type: item.type,
            text: segment.text.slice(0, 3500),
            kind: segment.kind,
            locator: segment.locator,
          },
        ]
      : [];
  });
}

export function validateAnswerDraft(
  input: unknown,
  sources: AnswerSource[],
): KnowledgeAnswer {
  const draft = answerDraftSchema.parse(input);
  const valid = new Set(sources.map((source) => source.id));
  for (const paragraph of draft.paragraphs) {
    if (paragraph.citations.some((id) => !valid.has(id)))
      throw new Error("Answer cited an unknown source.");
    if (!draft.insufficientContext && !paragraph.citations.length)
      throw new Error("Answer omitted source citations.");
  }
  const used = new Set(draft.paragraphs.flatMap((p) => p.citations));
  return {
    ...draft,
    mode: "gemini",
    sources: sources.filter((s) => used.has(s.id)),
  };
}

/** Keyless preview: extracts actual sentences; never impersonates AI synthesis. */
export function extractiveAnswer(
  query: string,
  sources: AnswerSource[],
): KnowledgeAnswer {
  if (!sources.length)
    return {
      mode: "empty",
      insufficientContext: true,
      sources: [],
      paragraphs: [
        {
          text: "I couldn’t find enough information in your library to answer that. Add a relevant source or try a more specific question.",
          citations: [],
        },
      ],
    };
  const queryTokens = new Set(tokens(query));
  const seen = new Set<string>();
  const sentences = sources
    .flatMap((source) =>
      source.text
        .replace(/^#+\s+.*$/gm, "")
        .split(/(?<=[.!?])\s+|\n\n/)
        .map((text) => ({
          text: text.trim(),
          source,
          score:
            tokens(text).filter((token) => queryTokens.has(token)).length * 2 +
            tokens(source.title).filter((token) => queryTokens.has(token))
              .length *
              3,
        })),
    )
    .filter(
      (sentence) =>
        sentence.text.length > 25 &&
        sentence.score > 0 &&
        !/^(see|connected to|for more)\b/i.test(sentence.text) &&
        !sentence.text.includes("[["),
    )
    .sort((a, b) => b.score - a.score)
    .filter((sentence) => {
      if (seen.has(sentence.text)) return false;
      seen.add(sentence.text);
      return true;
    })
    .slice(0, 3);
  if (!sentences.length)
    return {
      mode: "empty",
      insufficientContext: true,
      sources: [],
      paragraphs: [
        {
          text: "I found related material, but no direct passage that answers this question. Try a more specific question or enable Gemini for synthesis.",
          citations: [],
        },
      ],
    };
  const citations = [...new Set(sentences.map((s) => s.source.id))];
  return {
    mode: "extractive",
    insufficientContext: false,
    paragraphs: [{ text: sentences.map((s) => s.text).join(" "), citations }],
    sources: sources.filter((s) => citations.includes(s.id)),
  };
}
