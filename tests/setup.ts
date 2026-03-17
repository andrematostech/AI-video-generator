import path from "node:path";
import { config as loadEnv } from "dotenv";

Object.assign(process.env, {
  NODE_ENV: "test"
});

for (const envFile of [
  ".env.test.local",
  ".env.test",
  ".env"
]) {
  loadEnv({
    path: path.resolve(process.cwd(), envFile),
    override: false
  });
}
