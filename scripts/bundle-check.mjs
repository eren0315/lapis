#!/usr/bin/env node
/**
 * 빌드가 **만들기로 한 것을 실제로 만들었는지** 본다.
 *
 * ## 🔴 왜 (2026-09-02)
 *
 * `tauri build` 는 타깃을 조용히 건너뛴다. `"targets": "all"` 이 nsis 하나만 낸 것을
 * **13번의 릴리스 동안** 아무도 몰랐다 — 로그에 `Finished 1 bundle` 이라고만 적히고,
 * 그 "1" 이 몇이어야 하는지는 아무도 말해주지 않는다.
 *
 * ⚠️ 이 검사는 **빌드 뒤에** 돌린다. `npm run bundle:check`
 *
 * ⚠️ 버전까지 본다. 예전 버전 번들이 디렉터리에 남아 있어서 "있다"고 읽는 것이
 * 이 검사가 막아야 할 바로 그 실수다 — 그 폴더에는 1.14.0 부터 다 쌓여 있다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONF = path.join(ROOT, "src-tauri", "tauri.conf.json");
const BUNDLE = path.join(ROOT, "src-tauri", "target", "release", "bundle");

const { expectedBundles } = await import("./bundleTargets.mjs");

const conf = JSON.parse(readFileSync(CONF, "utf8"));
const version = conf.version;
const expected = expectedBundles(conf.bundle?.targets, process.platform);

if (expected === null) {
  console.error('번들 검사 실패 — `targets` 가 배열이 아니다("all" 은 무엇이 나올지 말해주지 않는다).');
  process.exit(1);
}
if (expected.length === 0) {
  console.log(`번들 검사 건너뜀 — ${process.platform} 는 배포 대상이 아니다.`);
  process.exit(0);
}

const missing = [];
const found = [];
for (const target of expected) {
  const dir = path.join(BUNDLE, target);
  // ⚠️ 디렉터리 존재만 보면 안 된다 — 옛 버전 번들이 거기 그대로 있다.
  const hit = existsSync(dir) && readdirSync(dir).some((f) => f.includes(version));
  (hit ? found : missing).push(target);
}

if (missing.length > 0) {
  console.error(`번들 검사 실패 — v${version} 로 안 나온 타깃: ${missing.join(" · ")}`);
  console.error(`  기대: ${expected.join(" · ")}  (${process.platform})`);
  console.error(`  나옴: ${found.join(" · ") || "없음"}`);
  console.error(`  ⚠️ tauri 는 타깃을 건너뛰어도 에러를 안 낸다. 빌드 로그의 "Finished N bundle" 을 확인하라.`);
  process.exit(1);
}

console.log(`번들 검사 통과 — v${version} · ${found.join(" · ")} (${process.platform})`);
