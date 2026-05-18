import { minimatch } from "minimatch";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { StandardsRepository } from "../domain/repository.js";
import type { ApplicableFilters, AppliesTo, Standard, StandardInput } from "../domain/standard.js";

type ReviewOpsPayload = {
  standards_version: string;
  rules: Standard[];
};

export class StandardsService {
  constructor(private readonly repository: StandardsRepository) {}

  async listActive(): Promise<Standard[]> {
    return this.latestByRuleKey(await this.repository.list({ status: "active" }));
  }

  async list(status?: Standard["status"]): Promise<Standard[]> {
    const rules = await this.repository.list(status ? { status } : undefined);
    return status === "active" ? this.latestByRuleKey(rules) : rules;
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
    return this.repository.create(normalizeInput(input));
  }

  async createNextVersion(ruleKey: string, patch: Partial<StandardInput>): Promise<Standard> {
    const current = await this.getLatest(ruleKey);
    const nextVersion = patch.version ?? current.version + 1;
    await this.assertNoVersionConflict(ruleKey, nextVersion);

    return this.repository.create(
      normalizeInput({
        ruleKey,
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
        owner: patch.owner ?? current.owner,
        version: nextVersion,
        deprecatedAt: patch.deprecatedAt ?? null
      })
    );
  }

  async applicable(filters: ApplicableFilters): Promise<ReviewOpsPayload> {
    const rules = (await this.listActive()).filter((rule) => isApplicable(rule.appliesTo, filters));
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

function normalizeInput(input: StandardInput): StandardInput {
  return {
    ...input,
    appliesTo: compactAppliesTo(input.appliesTo),
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

function isApplicable(appliesTo: AppliesTo, filters: ApplicableFilters): boolean {
  if (Object.values(filters).every((value) => value === undefined || (Array.isArray(value) && value.length === 0))) {
    return true;
  }

  return (
    includesValue(appliesTo.repos, filters.repo) ||
    includesValue(appliesTo.teams, filters.team) ||
    includesValue(appliesTo.languages, filters.language) ||
    includesValue(appliesTo.frameworks, filters.framework) ||
    includesValue(appliesTo.runtimes, filters.runtime) ||
    includesValue(appliesTo.environments, filters.environment) ||
    matchesAnyPath(appliesTo.file_patterns, filters.changedPaths)
  );
}

function includesValue(candidates: string[] | undefined, value: string | undefined): boolean {
  if (!value || !candidates?.length) {
    return false;
  }

  return candidates.some((candidate) => candidate === "*" || candidate.toLowerCase() === value.toLowerCase());
}

function matchesAnyPath(patterns: string[] | undefined, paths: string[] | undefined): boolean {
  if (!patterns?.length || !paths?.length) {
    return false;
  }

  return paths.some((path) =>
    patterns.some((pattern) => minimatch(path, pattern, { dot: true, matchBase: pattern.includes("/") === false }))
  );
}

function standardsVersion(rules: Standard[]): string {
  if (rules.length === 0) {
    return "empty";
  }

  const maxUpdatedAt = rules.reduce((max, rule) => Math.max(max, rule.updatedAt.getTime()), 0);
  const versionSum = rules.reduce((sum, rule) => sum + rule.version, 0);
  return `${new Date(maxUpdatedAt).toISOString()}-${rules.length}-${versionSum}`;
}
