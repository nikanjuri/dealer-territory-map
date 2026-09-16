import { createNeonAuth } from "@neondatabase/auth/next/server";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

let authInstance: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  authInstance ??= createNeonAuth({
    baseUrl: requiredEnvironmentVariable("NEON_AUTH_BASE_URL"),
    cookies: {
      secret: requiredEnvironmentVariable("NEON_AUTH_COOKIE_SECRET"),
    },
  });
  return authInstance;
}
