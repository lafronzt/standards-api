import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { PrismaStandardsRepository } from "./repositories/prisma-standards-repository.js";

const config = getConfig();
const prisma = new PrismaClient();
const app = await buildApp(new PrismaStandardsRepository(prisma), config.logLevel);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ host: config.host, port: config.port });
