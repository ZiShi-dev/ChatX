export type AppConfig = {
  trustProxy: boolean;
  corsOrigin: string | null;
  port: number;
  tlsCertPath: string | null;
  tlsKeyPath: string | null;
  tlsPort: number;
  databaseUrl: string;
  authRateLimit: number;
  authRateWindowMs: number;
  authCooldownMs: number;
  googleClientId: string | null;
};

const AUTH_RATE_LIMIT = 5;
const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
const AUTH_COOLDOWN_MS = 30 * 1000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL is missing');
  const port = Number(env.PORT ?? '8787');
  const tlsCertPath = env.CHATX_TLS_CERT?.trim() || null;
  const tlsKeyPath = env.CHATX_TLS_KEY?.trim() || null;
  if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) throw new Error('CHATX_TLS_CERT and CHATX_TLS_KEY must be set together');
  const tlsPort = Number(env.CHATX_TLS_PORT ?? '8443');
  return {
    trustProxy: env.CHATX_TRUST_PROXY === 'true',
    corsOrigin: env.CHATX_CORS_ORIGIN?.trim() || null,
    port: Number.isInteger(port) && port > 0 ? port : 8787,
    tlsCertPath,
    tlsKeyPath,
    tlsPort: Number.isInteger(tlsPort) && tlsPort > 0 ? tlsPort : 8443,
    databaseUrl,
    authRateLimit: AUTH_RATE_LIMIT,
    authRateWindowMs: AUTH_RATE_WINDOW_MS,
    authCooldownMs: AUTH_COOLDOWN_MS,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || null,
  };
}
