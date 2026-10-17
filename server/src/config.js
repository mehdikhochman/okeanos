// Reads configuration from environment variables once, at start-up.
// The app refuses to start in production if a required value is missing,
// because a half-configured shop is worse than a stopped one.
import path from 'node:path';

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const port = Number(env.PORT ?? 3000);

function required(name) {
  const value = env[name];
  if (isProduction && !value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config = Object.freeze({
  isProduction,
  host: env.HOST ?? '127.0.0.1',
  port,
  publicOrigin: (required('PUBLIC_ORIGIN') ?? `http://localhost:${port}`).replace(/\/$/, ''),
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  trustProxy: env.TRUST_PROXY === 'true',
  ipHashSecret: required('IP_HASH_SECRET') ?? 'development-only-secret',
});
