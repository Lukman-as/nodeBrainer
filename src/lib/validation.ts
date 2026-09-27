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
export const previewLibrarySchema = z
  .array(
    z.object({
      id: z.string().max(180),
      title: z.string().max(180),
      type: z.enum(["note", "pdf", "image", "link", "video"]),
      content: z.string().max(120000),
      tags: z.array(z.string().max(40)).max(12),
      segments: z
        .array(
          z.object({
            id: z.string().max(180),
            text: z.string().max(5000),
            kind: z.enum(["text", "transcript", "description"]),
            locator: locatorSchema,
          }),
        )
        .max(24),
      status: z.enum(["ready", "needs-attention"]),
      createdAt: z.string().max(50),
      updatedAt: z.string().max(50),
      version: z.number().int().positive(),
      sample: z.boolean().optional(),
    }),
  )
  .max(200);
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
