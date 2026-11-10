export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "VALIDATION"
  | "CONFLICT"
  | "ILLEGAL_TRANSITION"
  | "POLICY_DENIED"
  | "POLICY_STALE"
  | "CONSENT_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "STALE_STATE"
  | "RATE_LIMITED"
  | "ADAPTER_FAILURE"
  | "ADAPTER_TIMEOUT"
  | "ADAPTER_DENIED"
  | "UNSUPPORTED";

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  VALIDATION: 400,
  CONFLICT: 409,
  ILLEGAL_TRANSITION: 409,
  POLICY_DENIED: 422,
  POLICY_STALE: 409,
  CONSENT_REQUIRED: 422,
  APPROVAL_REQUIRED: 422,
  STALE_STATE: 409,
  RATE_LIMITED: 429,
  ADAPTER_FAILURE: 502,
  ADAPTER_TIMEOUT: 504,
  ADAPTER_DENIED: 502,
  UNSUPPORTED: 422,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const forbidden = (msg = "You do not have permission to do that") => new AppError("FORBIDDEN", msg);

export function toErrorBody(e: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (e instanceof AppError)
    return { status: e.status, body: { error: { code: e.code, message: e.message } } };
  return { status: 500, body: { error: { code: "INTERNAL", message: "Unexpected error" } } };
}
