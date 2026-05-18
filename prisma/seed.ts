import { PrismaClient } from "@prisma/client";
import { seedStandards } from "../src/seed-data.js";
import { toPrismaCreate } from "../src/repositories/mappers.js";

const prisma = new PrismaClient();

try {
  for (const standard of seedStandards) {
    await prisma.standard.upsert({
      where: {
        ruleKey_version: {
          ruleKey: standard.ruleKey,
          version: standard.version
        }
      },
      update: toPrismaCreate(standard),
      create: toPrismaCreate(standard)
    });
  }
} finally {
  await prisma.$disconnect();
}
