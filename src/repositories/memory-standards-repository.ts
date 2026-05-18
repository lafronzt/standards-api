import { randomUUID } from "node:crypto";
import type { ListStandardsFilters, StandardsRepository } from "../domain/repository.js";
import type { Standard, StandardInput } from "../domain/standard.js";

export class MemoryStandardsRepository implements StandardsRepository {
  private standards: Standard[];

  constructor(initial: StandardInput[] = []) {
    const now = new Date("2026-01-01T00:00:00.000Z");
    this.standards = initial.map((input) => ({
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      deprecatedAt: input.deprecatedAt ?? null
    }));
  }

  async list(filters: ListStandardsFilters = {}): Promise<Standard[]> {
    return this.standards
      .filter((standard) => (filters.status ? standard.status === filters.status : true))
      .sort((a, b) => a.ruleKey.localeCompare(b.ruleKey) || b.version - a.version);
  }

  async findLatestByRuleKey(ruleKey: string): Promise<Standard | null> {
    return (
      this.standards
        .filter((standard) => standard.ruleKey === ruleKey)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null> {
    return this.standards.find((standard) => standard.ruleKey === ruleKey && standard.version === version) ?? null;
  }

  async create(input: StandardInput): Promise<Standard> {
    const now = new Date();
    const standard: Standard = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      deprecatedAt: input.deprecatedAt ?? null
    };
    this.standards.push(standard);
    return standard;
  }
}
