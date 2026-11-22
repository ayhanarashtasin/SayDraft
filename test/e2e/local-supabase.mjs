import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(exec);
const cli = "npx --yes supabase@3.2.0";

export async function createTestSupabase(dir, freePort) {
  const suppliedUrl = process.env.TEST_SUPABASE_URL;
  if (suppliedUrl) {
    const parsed = new URL(suppliedUrl);
    if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !process.env.TEST_SUPABASE_SECRET_KEY) {
      throw new Error("API tests require an empty local Supabase project and its test key.");
    }
    return { url: suppliedUrl, key: process.env.TEST_SUPABASE_SECRET_KEY, stop: async () => {} };
  }

  const cwd = path.join(dir, "supabase-test");
  const configDir = path.join(cwd, "supabase");
  fs.mkdirSync(configDir, { recursive: true });
  fs.cpSync(path.join(process.cwd(), "supabase", "migrations"), path.join(configDir, "migrations"), { recursive: true });
  const api = await freePort();
  const db = await freePort();
  const shadow = await freePort();
  const project = `saydraft-test-${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(path.join(configDir, "config.toml"), `project_id = "${project}"
[api]
port = ${api}
[db]
port = ${db}
shadow_port = ${shadow}
[db.seed]
enabled = false
[storage]
file_size_limit = "50MiB"
`);
  const options = { cwd, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 };
  const stop = async () => {
    await run(`${cli} stop --no-backup`, options).catch(() => undefined);
  };
  try {
    await run(`${cli} start --exclude studio,imgproxy,mailpit,edge-runtime,logflare,vector,postgres-meta,realtime`, options);
    const { stdout } = await run(`${cli} status --output json`, options);
    const { API_URL: url, SECRET_KEY: key } = JSON.parse(stdout);
    if (!url || !key) throw new Error("Supabase did not return local API configuration.");
    return { url, key, stop };
  } catch (error) {
    await stop();
    const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").split(/\r?\n/)
      .filter((line) => !/sb_(secret|publishable)_|eyJ[A-Za-z0-9_-]{10}|secret key|access key/i.test(line))
      .filter(Boolean).slice(-16).join("\n");
    throw new Error(`Could not start isolated Supabase. Start Docker and check the Supabase CLI output.\n${detail}`);
  }
}
