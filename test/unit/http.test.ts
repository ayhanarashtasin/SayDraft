import assert from "node:assert/strict";
import test from "node:test";
import { errorResponse, guardRequest, isHostedHost, json } from "../../src/server/http.ts";

test("only configured domains are served, and other websites cannot make requests", () => {
  const originalEnv = process.env;
  const domain = "saydraft-check.vercel.app";
  process.env = { ...originalEnv, VERCEL: "1", VERCEL_URL: domain };
  try {
    const request = (init: { headers?: Record<string, string>; host?: string; method?: string } = {}) => {
      const host = init.host ?? domain;
      return new Request(`https://${host}/api/notes`, { method: init.method, headers: { Host: host, ...init.headers } });
    };
    assert.doesNotThrow(() => guardRequest(request()));
    assert.throws(() => guardRequest(request({ host: "other.example.com" })), (error) => errorResponse(error).status === 403);
    assert.throws(() => guardRequest(request({ headers: { "Sec-Fetch-Site": "cross-site" } })), (error) => errorResponse(error).status === 403);
    assert.doesNotThrow(() => guardRequest(request({ method: "POST", headers: { Origin: `https://${domain}` } })));
    assert.throws(
      () => guardRequest(request({ method: "POST", headers: { Origin: "https://evil.example.com" } })),
      (error) => errorResponse(error).status === 403,
    );
  } finally {
    process.env = originalEnv;
  }
});

test("a request is hosted when it is not for this computer", () => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, VERCEL: "" };
  try {
    assert.equal(isHostedHost("127.0.0.1:3000"), false);
    assert.equal(isHostedHost("localhost:3000"), false);
    assert.equal(isHostedHost("notes.example.com"), true);
    process.env.VERCEL = "1";
    assert.equal(isHostedHost("127.0.0.1:3000"), true);
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
