import { FileText, ImageIcon, Link2, Video } from "lucide-react";
import type { ItemType } from "@/lib/knowledge";

export const typeLabels: Record<ItemType, string> = {
  note: "Note",
  pdf: "PDF",
  image: "Image",
  link: "Article",
  video: "Video",
};
export const icons = {
  note: FileText,
  pdf: FileText,
  image: ImageIcon,
  link: Link2,
  video: Video,
};

/** A search the user ran in this browser. Stored locally; never sent to the server. */
export type SearchHistoryEntry = {
  id: string;
  query: string;
  at: string;
  resultCount: number;
  topItemId?: string;
  mode: string;
};
