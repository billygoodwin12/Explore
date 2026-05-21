export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // App routes (current + planned)
  "manage",
  "portfolio",
  "onboarding",
  "dev",
  "creator",
  "creators",
  "discover",
  "feed",
  "leaderboard",
  "search",
  "trade",
  "vault",
  "vaults",
  "deposit",
  "withdraw",
  "follow",

  // Next.js + framework
  "api",
  "_next",
  "next",
  "static",
  "public",
  "assets",
  "favicon",

  // Auth / account
  "login",
  "logout",
  "signin",
  "signout",
  "signup",
  "register",
  "account",
  "profile",
  "settings",
  "wallet",
  "auth",

  // Brand / org
  "theorise",
  "theorize",
  "theo",
  "admin",
  "root",
  "support",
  "help",
  "docs",
  "blog",
  "about",
  "team",
  "press",

  // Legal / policy
  "terms",
  "privacy",
  "legal",
  "tos",
  "policy",

  // Infra / common
  "www",
  "app",
  "web",
  "status",
  "health",
  "robots",
  "sitemap",
  "images",
  "fonts",
  "files",

  // Confusables
  "null",
  "undefined",
  "test",
  "tests",
  "example",
]);

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.toLowerCase());
}
