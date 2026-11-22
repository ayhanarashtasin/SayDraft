import assert from "node:assert/strict";
import test from "node:test";
import { errorResponse, guardRequest, json } from "../../src/server/http.ts";

test("Vercel domains require the configured workspace password", () => {
  const originalEnv = process.env;
  const domain = "saydraft-check.vercel.app";
  process.env = { ...originalEnv, VERCEL: "1", VERCEL_URL: domain, SAYDRAFT_PASSWORD: "" };
  try {
    const request = (headers = {}) => new Request(`https://${domain}/api/notes`, { headers: { Host: domain, ...headers } });
    assert.throws(() => guardRequest(request()), (error) => errorResponse(error).status === 503);
    const password = "temporary-workspace-password-for-test";
    process.env.SAYDRAFT_PASSWORD = password;
    assert.throws(() => guardRequest(request()), (error) => errorResponse(error).status === 401);
    const Authorization = `Basic ${Buffer.from(`saydraft:${password}`).toString("base64")}`;
    assert.doesNotThrow(() => guardRequest(request({ Authorization })));
    assert.throws(() => guardRequest(request({ Authorization, "Sec-Fetch-Site": "cross-site" })),
      (error) => errorResponse(error).status === 403);
  } finally {
    process.env = originalEnv;
  }
});

test("large JSON responses stream and preserve multibyte text", async () => {
  const note = { transcript: "🙂".repeat(1_200_000) };
  const response = json(note);
  const reader = response.clone().body!.getReader();
  const { value } = await reader.read();
  assert.ok(value && value.byteLength < 1_000_000);
  await Promise.all([reader.cancel(), response.json().then((data) => assert.deepEqual(data, note))]);
});
