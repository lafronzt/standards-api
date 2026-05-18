import { z } from "zod";
import { categories, severities, statuses } from "../domain/standard.js";

const nonEmptyArray = z.array(z.string().trim().min(1)).default([]);

export const appliesToSchema = z
  .object({
    languages: nonEmptyArray.optional(),
    frameworks: nonEmptyArray.optional(),
    runtimes: nonEmptyArray.optional(),
    file_patterns: nonEmptyArray.optional(),
    teams: nonEmptyArray.optional(),
    repos: nonEmptyArray.optional(),
    environments: nonEmptyArray.optional()
  })
  .strict()
  .default({});

const standardBodyBaseSchema = z
  .object({
    rule_key: z.string().trim().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3,}$/),
    title: z.string().trim().min(3),
    description: z.string().trim().min(3),
    status: z.enum(statuses).default("draft"),
    severity: z.enum(severities),
    category: z.enum(categories),
    applies_to: appliesToSchema,
    rule_text: z.string().trim().min(3),
    review_guidance: z.string().trim().min(3),
    good_example: z.string().trim().optional().nullable(),
    bad_example: z.string().trim().optional().nullable(),
    owner: z.string().trim().min(1),
    version: z.number().int().positive().default(1),
    deprecated_at: z.coerce.date().optional().nullable()
  })
  .strict();

export const standardBodySchema = standardBodyBaseSchema.superRefine((value, ctx) => {
    if (value.status === "deprecated" && !value.deprecated_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deprecated_at"],
        message: "deprecated_at is required when status is deprecated"
      });
    }
  });

export const updateStandardBodySchema = standardBodyBaseSchema.omit({ rule_key: true }).partial().extend({
  version: z.number().int().positive().optional()
});

export const listStandardsQuerySchema = z.object({
  status: z.enum(statuses).optional().default("active")
});

const csv = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

export const applicableQuerySchema = z.object({
  repo: z.string().trim().min(1).optional(),
  team: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  framework: z.string().trim().min(1).optional(),
  runtime: z.string().trim().min(1).optional(),
  environment: z.string().trim().min(1).optional(),
  changed_paths: csv
});
