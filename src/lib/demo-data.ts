import { KnowledgeItem, segmentText } from "./knowledge";

const entries: {
  id: string;
  title: string;
  type: KnowledgeItem["type"];
  tags: string[];
  content: string;
  page?: number;
  start?: number;
}[] = [
  {
    id: "attention",
    title: "Understanding self-attention",
    type: "note",
    tags: ["machine learning", "transformers"],
    content:
      "# Understanding self-attention\n\nAttention lets each token consider information from other tokens. Queries are compared with keys, and the resulting weights combine the values.\n\n## The intuition\nThink of reading a sentence: the meaning of a word changes with its context. Self-attention learns which context matters.\n\nThe scaled dot-product is softmax(QKᵀ / √d) V.\n\n## Connected thinking\nSee [[The transformer architecture]] for the full picture, and [[Attention, drawn simply]] for a visual explanation.",
  },
  {
    id: "transformer",
    title: "The transformer architecture",
    type: "pdf",
    tags: ["machine learning", "transformers"],
    page: 14,
    content:
      "Self-attention gives a model access to the entire input sequence. Multiple attention heads learn different relationships, while positional encodings retain information about order. Feed-forward layers transform each position independently. Residual connections help information move across layers. See [[Understanding self-attention]] and [[From tokens to meaning]].",
  },
  {
    id: "diagram",
    title: "Attention, drawn simply",
    type: "image",
    tags: ["transformers", "visual notes"],
    content:
      "A conceptual diagram of self-attention: three inputs labeled Query, Key, and Value. Query and Key meet at a similarity operation. Softmax turns the similarities into weights, which are used to combine the Values. Connected to [[Understanding self-attention]].",
  },
  {
    id: "lecture",
    title: "From tokens to meaning",
    type: "video",
    tags: ["machine learning", "transformers"],
    start: 512,
    content:
      "Each token attends to other tokens in the sequence. The attention weights tell us which parts of the context matter for this representation. Multi-head attention repeats this process in several learned spaces. See [[The transformer architecture]].",
  },
  {
    id: "probability",
    title: "Conditional probability",
    type: "note",
    tags: ["mathematics", "probability"],
    content:
      "# Conditional probability\n\nConditional probability describes how our belief changes when we learn new evidence. P(A | B) = P(A ∩ B) / P(B), provided P(B) is nonzero.\n\n[[Bayes and updating beliefs]] reverses the conditioning using a prior and likelihood.",
  },
  {
    id: "bayes",
    title: "Bayes and updating beliefs",
    type: "link",
    tags: ["probability", "research"],
    content:
      "Bayes’ theorem combines prior beliefs with the likelihood of new evidence to produce a posterior belief. It is a way to reason about conditional probability. The practical example in [[A surprising screening result]] shows why base rates matter.",
  },
  {
    id: "screening",
    title: "A surprising screening result",
    type: "note",
    tags: ["research", "mathematics"],
    content:
      "# A surprising screening result\n\nIn a fictional screening exercise, a rare condition occurs in 1 of every 1,000 cases. A positive result alone is not enough to draw a conclusion: false positives and the base rate both matter.\n\nThis toy example is for learning mathematics, not for interpreting real tests.\n\nSee [[Bayes and updating beliefs]] for the reasoning behind the update.",
  },
  {
    id: "design",
    title: "Designing for a quieter mind",
    type: "link",
    tags: ["design", "research"],
    content:
      "Good knowledge tools make it easy to collect information and easier to return to it. A calm interface reduces visual competition. Progressive disclosure reveals detail when it helps. The best connections are the ones we can explain.",
  },
];
export const demoItems: KnowledgeItem[] = entries.map((entry, i) => ({
  ...entry,
  segments: segmentText(entry.content).map((s) => ({
    ...s,
    kind:
      entry.type === "image"
        ? "description"
        : entry.type === "video"
          ? "transcript"
          : "text",
    locator: entry.page
      ? { page: entry.page }
      : entry.start
        ? { start: entry.start, end: 550 }
        : s.locator,
  })),
  status: "ready",
  version: 1,
  sample: true,
  createdAt: new Date(Date.UTC(2026, 8, 26, 10, 30 - i * 3)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 8, 26, 10, 30 - i * 3)).toISOString(),
}));
