import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DASHBOARD_BACKGROUNDS,
  ROTATION_BOUNDARY_BUFFER_MS,
  ROTATION_INTERVAL_MS,
  backgroundPreferenceLabel,
  getBackgroundIndex,
  msUntilNextRotation,
  parseBackgroundPreference,
  resolveBackgroundIndex,
} from "../../src/lib/dashboard-backgrounds.ts";

test("dashboard backgrounds rotate deterministically every 30 minutes across all 7 assets", () => {
  assert.equal(ROTATION_INTERVAL_MS, 30 * 60 * 1000);
  assert.equal(DASHBOARD_BACKGROUNDS.length, 7);

  const base = 1_700_000_000_000 - (1_700_000_000_000 % (ROTATION_INTERVAL_MS * 7));
  const seen: number[] = [];
  for (let slot = 0; slot < 14; slot += 1) {
    const start = base + slot * ROTATION_INTERVAL_MS;
    const idx = getBackgroundIndex(start);
    assert.equal(idx, slot % 7);
    assert.equal(getBackgroundIndex(start + ROTATION_INTERVAL_MS - 1), idx);
    seen.push(idx);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]);
  assert.ok(getBackgroundIndex(-1) >= 0 && getBackgroundIndex(-1) < 7);
});

test("msUntilNextRotation stays within one 30-minute window plus safety buffer and crosses the slot boundary", () => {
  const boundary = 1_700_001_000_000 - (1_700_001_000_000 % ROTATION_INTERVAL_MS);

  // Exact boundary waits a full 30 minutes (+ buffer) rather than firing immediately.
  assert.equal(msUntilNextRotation(boundary), ROTATION_INTERVAL_MS + ROTATION_BOUNDARY_BUFFER_MS);

  // 1 ms before a boundary waits 1 ms + buffer and lands strictly inside the next slot.
  const almost = boundary + ROTATION_INTERVAL_MS - 1;
  const wait = msUntilNextRotation(almost);
  assert.equal(wait, 1 + ROTATION_BOUNDARY_BUFFER_MS);
  assert.equal(getBackgroundIndex(almost + wait), (getBackgroundIndex(almost) + 1) % 7);

  // Mid-slot stays strictly inside (buffer, interval + buffer].
  const mid = boundary + 12 * 60 * 1000 + 345;
  const midWait = msUntilNextRotation(mid);
  assert.ok(midWait > ROTATION_BOUNDARY_BUFFER_MS && midWait <= ROTATION_INTERVAL_MS + ROTATION_BOUNDARY_BUFFER_MS);
  assert.equal(getBackgroundIndex(mid + midWait), (getBackgroundIndex(mid) + 1) % 7);
});

test("all 7 dashboard background files exist in public/dashboard-bg/ and are non-empty WebP images", () => {
  const publicDir = path.resolve(import.meta.dirname, "../../public");
  const ids = new Set<string>();

  for (const bg of DASHBOARD_BACKGROUNDS) {
    assert.ok(bg.src.startsWith("/dashboard-bg/"), `expected /dashboard-bg/ prefix, got ${bg.src}`);
    assert.ok(!ids.has(bg.id), `duplicate background id ${bg.id}`);
    ids.add(bg.id);

    const filePath = path.join(publicDir, bg.src.slice(1));
    assert.ok(fs.existsSync(filePath), `missing asset ${filePath}`);
    const data = fs.readFileSync(filePath);
    assert.ok(data.length > 1024, `asset too small: ${bg.src} (${data.length} bytes)`);
    assert.equal(data.subarray(0, 4).toString("ascii"), "RIFF", `expected RIFF header in ${bg.src}`);
    assert.equal(data.subarray(8, 12).toString("ascii"), "WEBP", `expected WEBP header in ${bg.src}`);
  }
});

test("background preference parsing and resolution default to none and support auto rotation and pinned wallpapers", () => {
  assert.equal(parseBackgroundPreference(null), "none");
  assert.equal(parseBackgroundPreference("none"), "none");
  assert.equal(parseBackgroundPreference("auto"), "auto");
  assert.equal(parseBackgroundPreference("does-not-exist"), "none");
  assert.equal(parseBackgroundPreference("neon-silk"), "neon-silk");

  const fixedNow = 1_700_000_000_000;
  assert.equal(resolveBackgroundIndex("none", fixedNow), null);
  assert.equal(backgroundPreferenceLabel("none"), "Default");
  assert.equal(resolveBackgroundIndex("auto", fixedNow), getBackgroundIndex(fixedNow));
  assert.equal(backgroundPreferenceLabel("auto"), "Auto (30m)");

  DASHBOARD_BACKGROUNDS.forEach((bg, idx) => {
    assert.equal(resolveBackgroundIndex(bg.id, fixedNow), idx);
    assert.equal(resolveBackgroundIndex(bg.id, fixedNow + ROTATION_INTERVAL_MS * 3), idx);
    assert.equal(backgroundPreferenceLabel(bg.id), bg.label);
  });
});
