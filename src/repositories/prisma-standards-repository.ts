import type { PrismaClient } from "@prisma/client";
import type { ListStandardsFilters, StandardsRepository } from "../domain/repository.js";
import type { Standard, StandardInput } from "../domain/standard.js";
import { toDomain, toPrismaCreate } from "./mappers.js";

export class PrismaStandardsRepository implements StandardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filters: ListStandardsFilters = {}): Promise<Standard[]> {
    const rows = await this.prisma.standard.findMany({
      where: {
        status: filters.status,
        category: filters.category,
        severity: filters.severity,
        owner: filters.owner
      },
      orderBy: [{ ruleKey: "asc" }, { version: "desc" }],
      take: filters.limit,
      skip: filters.offset
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

  async findActiveByRuleKey(ruleKey: string): Promise<Standard | null> {
    const row = await this.prisma.standard.findFirst({
      where: { ruleKey, status: "active" }
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

  async createReplacingActive(input: StandardInput): Promise<Standard> {
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.standard.updateMany({
        where: {
          ruleKey: input.ruleKey,
          status: "active"
        },
        data: {
          status: "deprecated",
          deprecatedAt: now
        }
      });

      return tx.standard.create({
        data: toPrismaCreate(input)
      });
    });

    return toDomain(row);
  }

  async update(id: string, input: StandardInput): Promise<Standard> {
    const row = await this.prisma.standard.update({
      where: { id },
      data: toPrismaCreate(input)
    });

    return toDomain(row);
  }

  async updateReplacingActive(id: string, input: StandardInput): Promise<Standard> {
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.standard.updateMany({
        where: {
          id: { not: id },
          ruleKey: input.ruleKey,
          status: "active"
        },
        data: {
          status: "deprecated",
          deprecatedAt: now
        }
      });

      return tx.standard.update({
        where: { id },
        data: toPrismaCreate(input)
      });
    });

    return toDomain(row);
  }
}
