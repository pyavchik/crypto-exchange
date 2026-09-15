import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * D-09: the single JSON error shape every non-2xx response uses, so bug
 * reports and RCA write-ups can quote `requestId` and find the matching log
 * line.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, requestId } };
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

  reply.code(statusCode).send(errorBody(code, error.message, request.id));
}

/** Registers the D-09 not-found and error handlers on the given app. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(notFoundHandler);
  app.setErrorHandler(errorHandler);
}
