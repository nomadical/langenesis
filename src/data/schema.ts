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

/** UNESCO's scale, mapped from Glottolog's Agglomerated Endangerment Status. */
export const endangermentEnum = z.enum([
  "safe",
  "vulnerable",
  "definitely-endangered",
  "severely-endangered",
  "critically-endangered",
]);

/** Foreign Service Institute estimate of classroom time for an English speaker. */
const learningSchema = z.object({
  fsi_category: z.number().int().min(1).max(4),
  weeks: z.number().int().positive(),
});

/** Lemma count of the language's category on the English Wiktionary. */
const vocabularySchema = z.object({
  wiktionary_lemmas: z.number().int().positive(),
  wiktionary_language: z.string().min(1),
});

const nodeObject = z.object({
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
  endangerment: endangermentEnum.optional(),
  learning: learningSchema.optional(),
  vocabulary: vocabularySchema.optional(),
  sources: z.array(z.string().url()).default([]),
  notes: z.string().optional(),
});

export const languageNodeSchema = nodeObject.refine(
  (n) => n.endangerment === undefined || n.status === "living",
  { message: "endangerment applies to living languages only", path: ["endangerment"] },
);

export type LanguageNode = z.infer<typeof languageNodeSchema>;

export {
  type CoreNode,
  CURRENT_YEAR,
  type NodeDetails,
  periodEnd,
} from "./model";
