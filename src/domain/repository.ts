import type { Standard, StandardCategory, StandardInput, StandardSeverity, StandardStatus } from "./standard.js";

export type ListStandardsFilters = {
  status?: StandardStatus;
  category?: StandardCategory;
  severity?: StandardSeverity;
  owner?: string;
  limit?: number;
  offset?: number;
};

export interface StandardsRepository {
  list(filters?: ListStandardsFilters): Promise<Standard[]>;
  findLatestByRuleKey(ruleKey: string): Promise<Standard | null>;
  findActiveByRuleKey(ruleKey: string): Promise<Standard | null>;
  findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null>;
  create(input: StandardInput): Promise<Standard>;
  createReplacingActive(input: StandardInput): Promise<Standard>;
  update(id: string, input: StandardInput): Promise<Standard>;
  updateReplacingActive(id: string, input: StandardInput): Promise<Standard>;
}
