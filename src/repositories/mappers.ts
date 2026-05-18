import type { Standard as PrismaStandard } from "@prisma/client";
import type { AppliesTo, Standard, StandardInput } from "../domain/standard.js";

export function toDomain(row: PrismaStandard): Standard {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    title: row.title,
    description: row.description,
    status: row.status,
    severity: row.severity,
    category: row.category,
    appliesTo: row.appliesTo as AppliesTo,
    ruleText: row.ruleText,
    reviewGuidance: row.reviewGuidance,
    goodExample: row.goodExample,
    badExample: row.badExample,
    rationale: row.rationale,
    tags: row.tags,
    sourceUrl: row.sourceUrl,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    approvedBy: row.approvedBy,
    owner: row.owner,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deprecatedAt: row.deprecatedAt
  };
}

export function toPrismaCreate(input: StandardInput) {
  return {
    ruleKey: input.ruleKey,
    title: input.title,
    description: input.description,
    status: input.status,
    severity: input.severity,
    category: input.category,
    appliesTo: input.appliesTo,
    ruleText: input.ruleText,
    reviewGuidance: input.reviewGuidance,
    goodExample: input.goodExample,
    badExample: input.badExample,
    rationale: input.rationale,
    tags: input.tags ?? [],
    sourceUrl: input.sourceUrl,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
    approvedBy: input.approvedBy,
    owner: input.owner,
    version: input.version,
    deprecatedAt: input.deprecatedAt
  };
}
