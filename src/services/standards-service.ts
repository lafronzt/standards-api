import { minimatch } from "minimatch";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { ListStandardsFilters } from "../domain/repository.js";
import type { StandardsRepository } from "../domain/repository.js";
import type {
  ApplicableFilters,
  ApplicableStandard,
  AppliesTo,
  Standard,
  StandardInput,
  StandardPatch
} from "../domain/standard.js";

type ReviewOpsPayload = {
  standards_version: string;
  rules: Array<Standard | ApplicableStandard>;
};

export class StandardsService {
  constructor(private readonly repository: StandardsRepository) {}

  async listActive(): Promise<Standard[]> {
    return this.latestByRuleKey(await this.repository.list({ status: "active" }));
  }

  async list(filters: ListStandardsFilters = { status: "active" }): Promise<Standard[]> {
    const rules = await this.repository.list(filters);
    return filters.status === "active" ? this.latestByRuleKey(rules) : rules;
  }

  async latestPayload(): Promise<ReviewOpsPayload> {
    const rules = await this.listActive();
    return {
      standards_version: standardsVersion(rules),
      rules
    };
  }

  async getLatest(ruleKey: string): Promise<Standard> {
    const rule = await this.repository.findLatestByRuleKey(ruleKey);
    if (!rule) {
      throw new NotFoundError(`Standard ${ruleKey} was not found`);
    }

    return rule;
  }

  async create(input: StandardInput): Promise<Standard> {
    await this.assertNoVersionConflict(input.ruleKey, input.version);
    const normalized = normalizeInput(input);
    if (normalized.status === "active") {
      return this.repository.createReplacingActive(normalized);
    }

    return this.repository.create(normalized);
  }

  async updateRule(ruleKey: string, patch: StandardPatch): Promise<Standard> {
    const current = await this.getLatest(ruleKey);
    if (current.status === "draft") {
      const next = normalizeInput(mergeInput(current, patch, current.version));
      if (next.status === "active" && (await this.repository.findActiveByRuleKey(ruleKey))) {
        return this.repository.updateReplacingActive(current.id, next);
      }

      return this.repository.update(current.id, next);
    }

    const nextVersion = patch.version ?? current.version + 1;
    await this.assertNoVersionConflict(ruleKey, nextVersion);
    const next = normalizeInput(mergeInput(current, patch, nextVersion));

    if (next.status === "active") {
      return this.repository.createReplacingActive(next);
    }

    return this.repository.create(next);
  }

  async applicable(filters: ApplicableFilters): Promise<ReviewOpsPayload> {
    const rules = (await this.listActive())
      .map((rule) => {
        const matchReason = getMatchReason(rule.appliesTo, filters);
        return matchReason ? { ...rule, matchReason } : null;
      })
      .filter((rule): rule is ApplicableStandard => rule !== null);

    return {
      standards_version: standardsVersion(rules),
      rules
    };
  }

  private async assertNoVersionConflict(ruleKey: string, version: number): Promise<void> {
    const existing = await this.repository.findByRuleKeyAndVersion(ruleKey, version);
    if (existing) {
      throw new ConflictError(`Standard ${ruleKey} version ${version} already exists`, {
        rule_key: ruleKey,
        version
      });
    }
  }

  private latestByRuleKey(rules: Standard[]): Standard[] {
    const latest = new Map<string, Standard>();
    for (const rule of rules) {
      const current = latest.get(rule.ruleKey);
      if (!current || rule.version > current.version) {
        latest.set(rule.ruleKey, rule);
      }
    }

    return [...latest.values()].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
  }
}

function mergeInput(current: Standard, patch: StandardPatch, version: number): StandardInput {
  return {
    ruleKey: current.ruleKey,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    status: patch.status ?? current.status,
    severity: patch.severity ?? current.severity,
    category: patch.category ?? current.category,
    appliesTo: patch.appliesTo ?? current.appliesTo,
    ruleText: patch.ruleText ?? current.ruleText,
    reviewGuidance: patch.reviewGuidance ?? current.reviewGuidance,
    goodExample: patch.goodExample ?? current.goodExample,
    badExample: patch.badExample ?? current.badExample,
    rationale: patch.rationale ?? current.rationale,
    tags: patch.tags ?? current.tags,
    sourceUrl: patch.sourceUrl ?? current.sourceUrl,
    createdBy: patch.createdBy ?? current.createdBy,
    updatedBy: patch.updatedBy ?? current.updatedBy,
    approvedBy: patch.approvedBy ?? current.approvedBy,
    owner: patch.owner ?? current.owner,
    version,
    deprecatedAt: patch.deprecatedAt ?? null
  };
}

function normalizeInput(input: StandardInput): StandardInput {
  return {
    ...input,
    appliesTo: compactAppliesTo(input.appliesTo),
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    deprecatedAt: input.status === "deprecated" ? input.deprecatedAt ?? new Date() : null
  };
}

function compactAppliesTo(appliesTo: AppliesTo): AppliesTo {
  return Object.fromEntries(
    Object.entries(appliesTo).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...new Set(value.map((item) => item.trim()).filter(Boolean))] : value
    ])
  );
}

function getMatchReason(appliesTo: AppliesTo, filters: ApplicableFilters): string | null {
  const reasons: string[] = [];
  const fields = [
    ["repo", appliesTo.repos, filters.repo],
    ["team", appliesTo.teams, filters.team],
    ["language", appliesTo.languages, filters.language],
    ["framework", appliesTo.frameworks, filters.framework],
    ["runtime", appliesTo.runtimes, filters.runtime],
    ["environment", appliesTo.environments, filters.environment]
  ] as const;

  for (const [name, candidates, value] of fields) {
    if (!candidates?.length) {
      continue;
    }

    if (!includesValue(candidates, value)) {
      return null;
    }

    reasons.push(`Matched ${name}=${value}`);
  }

  if (appliesTo.file_patterns?.length) {
    const path = matchedPath(appliesTo.file_patterns, filters.changedPaths);
    if (!path) {
      return null;
    }

    reasons.push(`Matched changed_paths=${path}`);
  }

  return reasons.length > 0 ? reasons.join(" and ") : "Matched globally";
}

function includesValue(candidates: string[] | undefined, value: string | undefined): boolean {
  if (!value || !candidates?.length) {
    return false;
  }

  return candidates.some((candidate) => candidate === "*" || candidate.toLowerCase() === value.toLowerCase());
}

function matchedPath(patterns: string[] | undefined, paths: string[] | undefined): string | null {
  if (!patterns?.length || !paths?.length) {
    return null;
  }

  for (const path of paths) {
    if (patterns.some((pattern) => minimatch(path, pattern, { dot: true, matchBase: pattern.includes("/") === false }))) {
      return path;
    }
  }

  return null;
}

function standardsVersion(rules: Standard[]): string {
  if (rules.length === 0) {
    return "empty";
  }

  const maxUpdatedAt = rules.reduce((max, rule) => Math.max(max, rule.updatedAt.getTime()), 0);
  return `${new Date(maxUpdatedAt).toISOString()}-count-${rules.length}`;
}
