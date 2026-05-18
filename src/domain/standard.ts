export const statuses = ["active", "deprecated", "draft"] as const;
export const severities = ["critical", "high", "medium", "low", "info"] as const;
export const categories = [
  "reliability",
  "security",
  "observability",
  "performance",
  "cost",
  "maintainability",
  "architecture",
  "compliance"
] as const;

export type StandardStatus = (typeof statuses)[number];
export type StandardSeverity = (typeof severities)[number];
export type StandardCategory = (typeof categories)[number];

export type AppliesTo = {
  languages?: string[];
  frameworks?: string[];
  runtimes?: string[];
  file_patterns?: string[];
  teams?: string[];
  repos?: string[];
  environments?: string[];
};

export type Standard = {
  id: string;
  ruleKey: string;
  title: string;
  description: string;
  status: StandardStatus;
  severity: StandardSeverity;
  category: StandardCategory;
  appliesTo: AppliesTo;
  ruleText: string;
  reviewGuidance: string;
  goodExample?: string | null;
  badExample?: string | null;
  owner: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deprecatedAt?: Date | null;
};

export type StandardInput = Omit<Standard, "id" | "createdAt" | "updatedAt" | "deprecatedAt"> & {
  deprecatedAt?: Date | null;
};

export type ApplicableFilters = {
  repo?: string;
  team?: string;
  language?: string;
  framework?: string;
  runtime?: string;
  environment?: string;
  changedPaths?: string[];
};
