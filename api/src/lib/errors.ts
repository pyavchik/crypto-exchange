import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * D-09: the single JSON error shape every non-2xx response uses, so bug
 * reports and RCA write-ups can quote `requestId` and find the matching log
 * line. D-27 adds `fields` as an OPTIONAL fourth member, present only on
 * VALIDATION_ERROR responses — every other error keeps the original
 * three-member shape unchanged.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string>;
  };
}

export function errorBody(
  code: string,
  message: string,
  requestId: string,
  fields?: Record<string, string>,
): ApiErrorBody {
  const body: ApiErrorBody = { error: { code, message, requestId } };
  if (fields && Object.keys(fields).length > 0) {
    body.error.fields = fields;
  }
  return body;
}

/**
 * D-27: the single constructor every client-facing route failure in this
 * codebase throws. Replaces the cast-and-assign idiom
 * (`new Error(...) as Error & { statusCode; code }`) used in 02-01. The
 * existing `errorHandler` below already turns any thrown error carrying
 * `statusCode`/`code` into the D-09 envelope, so no handler rewiring is
 * needed for the status or the code — only `fields` is new.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  const path = request.url.split("?")[0] ?? request.url;
  const message = `Route ${request.method} ${path} not found`;
  reply.code(404).send(errorBody("NOT_FOUND", message, request.id));
}

function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const statusCode = error.statusCode;

  // 500 (or no statusCode at all): never leak the original message or stack —
  // details go only to the log, keyed by the same request ID the client sees.
  if (statusCode === undefined || statusCode >= 500) {
    request.log.error({ err: error }, "unhandled error");
    reply.code(500).send(errorBody("INTERNAL_ERROR", "Internal Server Error", request.id));
    return;
  }

  const code = error.validation
    ? "VALIDATION_ERROR"
    : typeof error.code === "string"
      ? error.code
      : "BAD_REQUEST";

  // D-27: attach fields only when the thrown error actually carries a
  // non-empty record (errorBody already guards the empty case) and the
  // status is below 500 (guaranteed by the early return above).
  const fields = (error as FastifyError & { fields?: Record<string, string> }).fields;
  reply.code(statusCode).send(errorBody(code, error.message, request.id, fields));
}

/** Registers the D-09 not-found and error handlers on the given app. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(notFoundHandler);
  app.setErrorHandler(errorHandler);
}
