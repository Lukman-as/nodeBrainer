import { z } from "zod";

export const noteInput = z.object({
  title: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(40000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});
export const locatorSchema = z.object({
  page: z.number().int().positive().optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().nonnegative().optional(),
  section: z.string().max(120).optional(),
});
export const extractionSchema = z.object({
  title: z.string().min(1).max(180),
  tags: z.array(z.string().max(40)).max(12),
  segments: z
    .array(
      z.object({
        text: z.string().min(1).max(5000),
        kind: z.enum(["text", "transcript", "description"]),
        locator: locatorSchema,
      }),
    )
    .min(1)
    .max(24),
});
