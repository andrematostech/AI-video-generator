import { loadServerEnv, type ServerEnv } from "@/lib/config/env";

let cachedEnv: ServerEnv | null = null;

export function getServerEnv() {
  if (!cachedEnv) {
    cachedEnv = loadServerEnv();
  }

  return cachedEnv;
}

export function resetServerEnvForTests() {
  cachedEnv = null;
}
