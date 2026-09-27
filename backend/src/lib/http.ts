import type { ErrorRequestHandler } from "express";
import { z } from "zod";

/** Throw one of these from any route; the error handler turns it into a JSON response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Please log in") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You can't do that") => new HttpError(403, "forbidden", message);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);

/** Validates input against a zod schema, or throws a 400 listing what's wrong. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    throw new HttpError(400, "validation_error", "Some fields are invalid", details);
  }
  return result.data;
}

// Reusable field schemas
export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  } else if (err?.name === "MulterError") {
    const message = err.code === "LIMIT_FILE_SIZE" ? "That file is too large" : "Couldn't read the uploaded file";
    res.status(400).json({ error: { code: "bad_upload", message } });
  } else if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_json", message: "Request body is not valid JSON" } });
  } else if (err?.status >= 400 && err.status < 500) {
    // Errors raised by Express itself, e.g. a missing static file
    res.status(err.status).json({ error: { code: "request_error", message: err.message } });
  } else {
    console.error(err);
    res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
  }
};
