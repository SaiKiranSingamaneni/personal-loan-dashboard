import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function parseInput<TSchema extends ZodType>(
  schema: TSchema,
  value: unknown,
): TSchema["_output"] {
  return schema.parse(value);
}

export function validateBody<TSchema extends ZodType>(schema: TSchema): RequestHandler {
  return (request, _response, next) => {
    try {
      request.body = schema.parse(request.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
