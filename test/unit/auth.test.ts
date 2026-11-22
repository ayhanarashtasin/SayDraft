import assert from "node:assert/strict";
import test from "node:test";
import { safeNext } from "../../src/lib/auth-shared.ts";
import { applyPending, forwardedRequestHeaders } from "../../src/server/auth.ts";

test("a login redirect can only go to a page on this site", () => {
  assert.equal(safeNext("/"), "/");
  assert.equal(safeNext("/notes/12"), "/notes/12");
  assert.equal(safeNext("/settings/tags?from=feed"), "/settings/tags?from=feed");
  for (const unsafe of [
    undefined,
    null,
    42,
    "",
    "notes",
    "//evil.example.com",
    "/\\evil.example.com",
    "https://evil.example.com",
    "javascript:alert(1)",
    "/login",
    "/signup?x=1",
    "/api/notes",
    "/ok\r\nSet-Cookie: a=b",
  ]) {
    assert.equal(safeNext(unsafe), "/", String(unsafe));
  }
});

test("session cookies are written HttpOnly, SameSite=Lax and never cached", () => {
  const response = applyPending(Response.json({ ok: true }), {
    cookies: [
      { name: "sb-test-auth-token", value: "base64-abc", options: { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 100 } },
      { name: "sb-test-auth-token.1", value: "", options: { path: "/", maxAge: 0 } },
    ],
    headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
  });
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^sb-test-auth-token=base64-abc;/);
  assert.match(cookies[0], /HttpOnly/i);
  assert.match(cookies[0], /SameSite=Lax/i);
  assert.match(cookies[0], /Secure/i);
  assert.match(cookies[1], /Max-Age=0/i);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("responses that carry no new cookies are left untouched", () => {
  const original = Response.json({ ok: true });
  assert.equal(applyPending(original, { cookies: [], headers: {} }), original);
});

test("refreshed cookies replace old ones and cleared cookies disappear for the next handler", () => {
  const request = new Request("https://example.com/api/notes", {
    headers: { cookie: "theme=dark; sb-x-auth-token=old; sb-x-auth-token.1=old-part" },
  });
  const headers = forwardedRequestHeaders(request, {
    cookies: [
      { name: "sb-x-auth-token", value: "fresh", options: { path: "/" } },
      { name: "sb-x-auth-token.1", value: "", options: { path: "/", maxAge: 0 } },
    ],
    headers: {},
  });
  const jar = new Map((headers.get("cookie") ?? "").split("; ").map((pair) => pair.split("=") as [string, string]));
  assert.equal(jar.get("theme"), "dark");
  assert.equal(jar.get("sb-x-auth-token"), "fresh");
  assert.equal(jar.has("sb-x-auth-token.1"), false);
});
