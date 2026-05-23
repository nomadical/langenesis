import { z } from "zod";

const yearOrPresent = z.union([z.number().int(), z.literal("present")]);

const periodSchema = z
  .object({
    start: z.number().int(),
    end: yearOrPresent,
    start_uncertainty: z.number().int().nonnegative().optional(),
    end_uncertainty: z.number().int().nonnegative().optional(),
  })
  .refine(
    (p) => (p.end === "present" ? true : p.end >= p.start),
    { message: "period.end must be >= period.start" },
  );

export const statusEnum = z.enum([
  "living",
  "extinct",
  "reconstructed",
  "classical",
]);

export const languageNodeSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "id must be kebab-case (a-z, 0-9, -)"),
  name: z.string().min(1),
  glottocode: z
    .string()
    .regex(/^[a-z]{4}\d{4}$/, "glottocode is 4 letters + 4 digits")
    .optional(),
  iso639_3: z
    .string()
    .regex(/^[a-z]{3}$/, "iso639_3 is 3 lowercase letters")
    .optional(),
  parents: z.array(z.string()),
  period: periodSchema,
  status: statusEnum,
  speakers: z.number().int().nonnegative().optional(),
  sources: z.array(z.string().url()).default([]),
  notes: z.string().optional(),
});

export type LanguageNode = z.infer<typeof languageNodeSchema>;

export const CURRENT_YEAR = 2026;

export function periodEnd(node: LanguageNode): number {
  return node.period.end === "present" ? CURRENT_YEAR : node.period.end;
}
