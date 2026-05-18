import type { Standard } from "../domain/standard.js";

export function serializeStandard(standard: Standard) {
  return {
    id: standard.id,
    rule_key: standard.ruleKey,
    title: standard.title,
    description: standard.description,
    status: standard.status,
    severity: standard.severity,
    category: standard.category,
    applies_to: standard.appliesTo,
    rule_text: standard.ruleText,
    review_guidance: standard.reviewGuidance,
    good_example: standard.goodExample,
    bad_example: standard.badExample,
    rationale: standard.rationale,
    tags: standard.tags,
    source_url: standard.sourceUrl,
    created_by: standard.createdBy,
    updated_by: standard.updatedBy,
    approved_by: standard.approvedBy,
    owner: standard.owner,
    version: standard.version,
    created_at: standard.createdAt.toISOString(),
    updated_at: standard.updatedAt.toISOString(),
    deprecated_at: standard.deprecatedAt?.toISOString() ?? null,
    ...("matchReason" in standard ? { match_reason: standard.matchReason } : {})
  };
}

export function serializeReviewOpsPayload(payload: { standards_version: string; rules: Standard[] }) {
  return {
    standards_version: payload.standards_version,
    rules: payload.rules.map(serializeStandard)
  };
}
