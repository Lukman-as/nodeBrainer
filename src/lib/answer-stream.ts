import type { AnswerContext } from "./answer-context";
import type { KnowledgeAnswer } from "./answers";
import type { SearchResponse } from "./knowledge";

type RetrievalEvent = {
  type: "retrieval";
  retrieval: SearchResponse;
  context: AnswerContext;
};
type AnswerEvent =
  | RetrievalEvent
  | { type: "answer"; answer: KnowledgeAnswer }
  | { type: "error"; error: string };

export async function readAnswerStream(
  response: Response,
  onRetrieval: (event: RetrievalEvent) => void,
) {
  if (!response.ok) {
    const data = await response.json();
    throw new Error(
      data.error || "Unable to answer this question. Please try again.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error("The answer stream is unavailable. Please try again.");
  const decoder = new TextDecoder();
  let buffer = "";
  let retrieval: SearchResponse | undefined;
  let context: AnswerContext | undefined;
  let answer: KnowledgeAnswer | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AnswerEvent;
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "retrieval") {
      retrieval = event.retrieval;
      context = event.context;
      onRetrieval(event);
    } else if (event.type === "answer") answer = event.answer;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) consume(line);
      if (done) {
        consume(buffer);
        break;
      }
    }
    if (!retrieval || !context || !answer)
      throw new Error("The answer was interrupted. Please try again.");
    return { ...retrieval, context, answer };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
