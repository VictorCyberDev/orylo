/** Local default is public (it is in the repository). A public deployment MUST set DEMO_PASSWORD (scripts/seed.ts refuses otherwise). */
export const DEFAULT_DEMO_PASSWORD = "OryloDemo!2026";
export const getDemoPassword = () => process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
