import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";

const isProd = process.env.NODE_ENV === "production";

function secret() {
  const s = process.env.BETTER_AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd) throw new Error("BETTER_AUTH_SECRET (>=32 chars) must be set in production");
  return "dev-only-secret-dev-only-secret-dev-only-secret";
}

/**
 * Authentication is delegated to Better Auth (established library): scrypt password hashing, signed
 * httpOnly SameSite=Lax session cookies, CSRF/origin checks on its endpoints, and rate limiting on
 * sign-in/sign-up/reset. Authorization (roles, tenancy) is Orylo's own and is enforced server-side.
 *
 * Email verification and password-reset EMAIL delivery need an email provider; none is configured, so
 * `sendResetPassword` records a SKIPPED delivery (and logs the link in development only). It never
 * pretends an email was sent.
 */
export function createAuth(opts: { nextCookies?: boolean } = {}) {
  return betterAuth({
    secret: secret(),
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000",
    database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, url }) => {
        if (!isProd) console.info(`[dev] password reset link for ${user.email}: ${url}`);
        // No email provider configured: nothing is sent. Production deployments must wire EmailAdapter.
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 15 },
    advanced: { useSecureCookies: isProd, defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProd } },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    plugins: opts.nextCookies === false ? [] : [nextCookiesPlugin()],
  });
}

// Loaded lazily so scripts (seed/tests) that run outside Next never import next/headers.
function nextCookiesPlugin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("better-auth/next-js") as typeof import("better-auth/next-js")).nextCookies();
}

const g = globalThis as unknown as { __oryloAuth?: ReturnType<typeof createAuth> };
export const getAuth = () => (g.__oryloAuth ??= createAuth());
