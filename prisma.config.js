require('dotenv').config({ override: true });

// NOTE: this file is ONLY used by the Prisma CLI (migrate/studio/generate) —
// the running app does NOT read this. PrismaService (src/prisma/prisma.service.ts)
// builds its own pg.Pool directly from process.env.DATABASE_URL (the pooled,
// transaction-mode connection), independent of this config.
//
// Prisma 7 removed `directUrl` — the CLI now just uses whatever `url` is set
// to here. Migrations need a direct/session connection (transaction-mode
// pgbouncer on 6543 can't run DDL), so this points at DIRECT_URL instead of
// DATABASE_URL. Falls back to DATABASE_URL if DIRECT_URL isn't set yet, so
// this doesn't hard-crash `prisma generate` in environments that don't need
// to run migrations.
//
// { override: true } above is deliberate: dotenv normally refuses to
// overwrite a variable that's already set in the shell/session env, which
// silently defeats a freshly-added .env value. This makes .env win instead.
const resolvedUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!resolvedUrl) {
  throw new Error(
    '[prisma.config] Neither DIRECT_URL nor DATABASE_URL is set. Copy .env.example to .env and fill in a database connection string.'
  );
}
console.log(
  '[prisma.config] using',
  process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL (fallback — DIRECT_URL not set)',
  '→ port', (resolvedUrl.match(/:(\d+)\//) || [])[1] || '?'
);

module.exports = {
  datasource: {
    url: resolvedUrl,
  },
};