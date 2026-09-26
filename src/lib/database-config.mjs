/** Shared by the server and database scripts. Never imported by client components. */
export function databaseConfig() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  // Verify the server certificate and hostname even when the dashboard supplies sslmode=require.
  url.searchParams.set('sslmode', 'verify-full');
  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: 'nodebrainer',
  };
}
