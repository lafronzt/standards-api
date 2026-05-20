import { Prisma, type PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { ListStandardsFilters, StandardsRepository } from "../domain/repository.js";
import type { Standard, StandardInput } from "../domain/standard.js";
import { toDomain, toPrismaCreate } from "./mappers.js";

export class PrismaStandardsRepository implements StandardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filters: ListStandardsFilters = {}): Promise<Standard[]> {
    try {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async findLatestByRuleKey(ruleKey: string): Promise<Standard | null> {
    try {
      const row = await this.prisma.standard.findFirst({
        where: { ruleKey },
        orderBy: [{ ruleKey: "asc" }, { version: "desc" }]
      });

      return row ? toDomain(row) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async findActiveByRuleKey(ruleKey: string): Promise<Standard | null> {
    try {
      const row = await this.prisma.standard.findFirst({
        where: { ruleKey, status: "active" },
        orderBy: [{ ruleKey: "asc" }, { version: "desc" }]
      });

      return row ? toDomain(row) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async findByRuleKeyAndVersion(ruleKey: string, version: number): Promise<Standard | null> {
    try {
      const row = await this.prisma.standard.findUnique({
        where: {
          ruleKey_version: {
            ruleKey,
            version
          }
        }
      });

      return row ? toDomain(row) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async create(input: StandardInput): Promise<Standard> {
    try {
      const row = await this.prisma.standard.create({
        data: toPrismaCreate(input)
      });

      return toDomain(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictError("A standard with this rule_key and version already exists");
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async createReplacingActive(input: StandardInput): Promise<Standard> {
    try {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictError("A standard with this rule_key and version already exists");
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async update(id: string, input: StandardInput): Promise<Standard> {
    try {
      const row = await this.prisma.standard.update({
        where: { id },
        data: toPrismaCreate(input)
      });

      return toDomain(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictError("A standard with this rule_key and version already exists");
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }

  async updateReplacingActive(id: string, input: StandardInput): Promise<Standard> {
    try {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictError("A standard with this rule_key and version already exists");
        if (error.code === "P2025") throw new NotFoundError("Standard not found");
      }
      throw error;
    }
  }
}
