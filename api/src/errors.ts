import type { ErrorRequestHandler } from "express";

/** An error that becomes the standard body { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type PriceProviderFailure = "unavailable" | "timeout" | "bad_response";

export class PriceProviderError extends Error {
  constructor(
    public kind: PriceProviderFailure,
    message: string,
  ) {
    super(message);
  }
}

const PRICE_PROVIDER_ERRORS: Record<PriceProviderFailure, { status: number; code: string }> = {
  unavailable: { status: 503, code: "PRICE_PROVIDER_UNAVAILABLE" },
  timeout: { status: 504, code: "PRICE_PROVIDER_TIMEOUT" },
  bad_response: { status: 502, code: "PRICE_PROVIDER_BAD_RESPONSE" },
};

function toApiError(err: any): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof PriceProviderError) {
    const { status, code } = PRICE_PROVIDER_ERRORS[err.kind];
    return new ApiError(status, code, err.message);
  }
  if (err?.type === "entity.parse.failed") {
    return new ApiError(400, "INVALID_REQUEST", "Request body is not valid JSON");
  }
  return new ApiError(500, "INTERNAL_ERROR", "Unexpected error");
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const apiError = toApiError(err);
  const log = res.locals.log;
  if (apiError.status >= 500) log?.error("request failed", { code: apiError.code, reason: err.message });
  res.status(apiError.status).json({ error: { code: apiError.code, message: apiError.message } });
};
