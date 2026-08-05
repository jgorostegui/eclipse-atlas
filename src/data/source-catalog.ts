import { z } from "zod";

const sourceRecordSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    producer: z.string().min(1),
    url: z.string().url(),
    role: z.string().min(1),
    status: z.enum(["in-use", "linked-only"]),
    retrievedAt: z.string().date(),
    version: z.string().min(1),
    coverage: z.string().min(1),
    resolution: z.string().min(1),
    license: z
      .object({
        name: z.string().min(1),
        url: z.string().url().optional(),
      })
      .strict(),
    attribution: z.string().min(1),
    transformation: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const sourceCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    sources: z.array(sourceRecordSchema).min(1),
  })
  .strict()
  .superRefine(({ sources }, context) => {
    const seen = new Set<string>();
    sources.forEach(({ id }, index) => {
      if (seen.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate source id: ${id}`,
          path: ["sources", index, "id"],
        });
      }
      seen.add(id);
    });
  });
