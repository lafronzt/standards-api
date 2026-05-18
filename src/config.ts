import "dotenv/config";

export type AppConfig = {
  host: string;
  port: number;
  logLevel: string;
};

export function getConfig(): AppConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number.parseInt(process.env.PORT ?? "3000", 10),
    logLevel: process.env.LOG_LEVEL ?? "info"
  };
}
