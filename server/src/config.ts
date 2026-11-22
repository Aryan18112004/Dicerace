const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-secret-do-not-use"),
  // how long a dropped player has to come back before they forfeit
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 30_000),
};
