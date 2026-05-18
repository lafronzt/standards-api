import type { z } from "zod";
import { ValidationError } from "../domain/errors.js";

export function parseWithSchema<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Request validation failed", result.error.flatten());
  }

  return result.data;
}
