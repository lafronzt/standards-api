import type { Standard, StandardInput, StandardStatus } from "./standard.js";

export type ListStandardsFilters = {
  status?: StandardStatus;
};

export interface StandardsRepository {
  list(filters?: ListStandardsFilters): Promise<Standard[]>;
  findLatestByRuleKey(ruleKey: string): Promise<Standard | null>;
  findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null>;
  create(input: StandardInput): Promise<Standard>;
}
