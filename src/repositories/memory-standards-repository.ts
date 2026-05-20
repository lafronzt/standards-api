import { randomUUID } from "node:crypto";
import { ConflictError } from "../domain/errors.js";
import type { ListStandardsFilters, StandardsRepository } from "../domain/repository.js";
import type { Standard, StandardInput } from "../domain/standard.js";

export class MemoryStandardsRepository implements StandardsRepository {
  private standards: Standard[];

  constructor(initial: StandardInput[] = []) {
    const now = new Date("2026-01-01T00:00:00.000Z");
    this.standards = initial.map((input) => ({
      ...input,
      tags: input.tags ?? [],
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      deprecatedAt: input.deprecatedAt ?? null
    }));
  }

  async list(filters: ListStandardsFilters = {}): Promise<Standard[]> {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? Number.POSITIVE_INFINITY;

    return this.standards
      .filter((standard) => (filters.status ? standard.status === filters.status : true))
      .filter((standard) => (filters.category ? standard.category === filters.category : true))
      .filter((standard) => (filters.severity ? standard.severity === filters.severity : true))
      .filter((standard) => (filters.owner ? standard.owner === filters.owner : true))
      .sort((a, b) => a.ruleKey.localeCompare(b.ruleKey) || b.version - a.version)
      .slice(offset, offset + limit);
  }

  async findLatestByRuleKey(ruleKey: string): Promise<Standard | null> {
    return (
      this.standards
        .filter((standard) => standard.ruleKey === ruleKey)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async findActiveByRuleKey(ruleKey: string): Promise<Standard | null> {
    return this.standards.find((standard) => standard.ruleKey === ruleKey && standard.status === "active") ?? null;
  }

  async findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null> {
    return this.standards.find((standard) => standard.ruleKey === ruleKey && standard.version === version) ?? null;
  }

  async create(input: StandardInput): Promise<Standard> {
    const duplicate = this.standards.find((s) => s.ruleKey === input.ruleKey && s.version === input.version);
    if (duplicate) {
      throw new ConflictError("A standard with this rule_key and version already exists");
    }

    const now = new Date();
    const standard: Standard = {
      ...input,
      tags: input.tags ?? [],
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      deprecatedAt: input.deprecatedAt ?? null
    };
    this.standards.push(standard);
    return standard;
  }

  async createReplacingActive(input: StandardInput): Promise<Standard> {
    const duplicate = this.standards.find((s) => s.ruleKey === input.ruleKey && s.version === input.version);
    if (duplicate) {
      throw new ConflictError("A standard with this rule_key and version already exists");
    }

    const now = new Date();
    this.standards = this.standards.map((standard) =>
      standard.ruleKey === input.ruleKey && standard.status === "active"
        ? { ...standard, status: "deprecated", deprecatedAt: now, updatedAt: now }
        : standard
    );

    return this.create(input);
  }

  async update(id: string, input: StandardInput): Promise<Standard> {
    const index = this.standards.findIndex((standard) => standard.id === id);
    const current = this.standards[index];
    if (index === -1 || !current) {
      throw new Error(`Standard ${id} was not found`);
    }

    const updated: Standard = {
      ...current,
      ...input,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date(),
      deprecatedAt: input.deprecatedAt ?? null
    };
    this.standards[index] = updated;
    return updated;
  }

  async updateReplacingActive(id: string, input: StandardInput): Promise<Standard> {
    const now = new Date();
    this.standards = this.standards.map((standard) =>
      standard.id !== id && standard.ruleKey === input.ruleKey && standard.status === "active"
        ? { ...standard, status: "deprecated", deprecatedAt: now, updatedAt: now }
        : standard
    );

    return this.update(id, input);
  }
}
