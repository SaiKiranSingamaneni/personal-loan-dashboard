import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function validationFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    fields[key] = [...(fields[key] ?? []), issue.message];
  }
  return fields;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  void _next;
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        fields: validationFields(error),
      },
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  const bodyParserError = error as { status?: unknown; type?: unknown };
  if (
    error instanceof SyntaxError &&
    bodyParserError.status === 400 &&
    bodyParserError.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body contains invalid JSON." },
    });
    return;
  }

  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." },
  });
};
