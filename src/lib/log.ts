/**
 * Error logging that cannot leak PII. Drizzle's error message embeds `params: …` (bound values: emails, tokens
 * hashes, uploaded bytes), so we log only the error name, Postgres code and the message up to the params dump.
 */
export function logError(tag: string, e: unknown, extra?: Record<string, unknown>) {
  const err = e as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  const message = String(err?.cause?.message ?? err?.message ?? e)
    .split(/\n?params:/)[0]
    .slice(0, 300);
  console.error(tag, { name: err?.name, code: err?.cause?.code ?? err?.code, message, ...extra });
}
