import type { PrismaClient } from "@prisma/client";
import type { ListStandardsFilters, StandardsRepository } from "../domain/repository.js";
import type { Standard, StandardInput } from "../domain/standard.js";
import { toDomain, toPrismaCreate } from "./mappers.js";

export class PrismaStandardsRepository implements StandardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filters: ListStandardsFilters = {}): Promise<Standard[]> {
    const rows = await this.prisma.standard.findMany({
      where: {
        status: filters.status
      },
      orderBy: [{ ruleKey: "asc" }, { version: "desc" }]
    });

    return rows.map(toDomain);
  }

  async findLatestByRuleKey(ruleKey: string): Promise<Standard | null> {
    const row = await this.prisma.standard.findFirst({
      where: { ruleKey },
      orderBy: { version: "desc" }
    });

    return row ? toDomain(row) : null;
  }

  async findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null> {
    const row = await this.prisma.standard.findUnique({
      where: {
        ruleKey_version: {
          ruleKey,
          version
        }
      }
    });

    return row ? toDomain(row) : null;
  }

  async create(input: StandardInput): Promise<Standard> {
    const row = await this.prisma.standard.create({
      data: toPrismaCreate(input)
    });

    return toDomain(row);
  }
}
