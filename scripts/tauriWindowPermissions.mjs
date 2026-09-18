#!/usr/bin/env node
/**
 * 창 API 를 **부르는 곳**과 권한 **선언**을 잇는 단일 주인.
 *
 * ## 🔴 왜 있나 (2026-09-19 실사용 로그)
 *
 * `capabilities/default.json` 에 `core:window:allow-set-focus` 가 없어서
 * `lapis open` 이 연 노트를 스스로 덮어썼다. 경고는 로그에만 남았다:
 *
 *     Command plugin:window|set_focus not allowed by ACL
 *
 * Tauri 2 는 권한을 선언하기 전까지 모든 커맨드를 차단하고, `core:window:default` 는
 * 읽기용 getter 만 준다. 창 권한 다섯을 넣으면서 여섯 번째를 빠뜨린 것을
 * **13번의 릴리스 동안 아무도 몰랐다** — 에러가 화면에 안 뜬다.
 *
 * ## 한 방향만 본다
 *
 * **쓰는데 선언 안 된 것**을 막는다. 선언했는데 안 쓰는 것은 안 본다 —
 * `start-dragging` 은 HTML 속성(`data-tauri-drag-region`)으로 쓰여 정적 스캔에 안 잡힌다.
 * 그걸 "안 쓴다"고 지우면 드래그가 조용히 죽는다.
 *
 * ## ⚠️ 못 보는 것
 *
 * **동적 호출은 못 본다** — `w[name]()` 같은 것. 정적으로 보이는 것만 지킨다.
 * 전수성을 주장하지 않는다.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** 창 API 를 들여오는 표시. 이게 없는 파일은 안 본다. */
const WINDOW_IMPORT = "@tauri-apps/api/window";

/**
 * 권한이 필요한 창 메서드. **getter 는 넣지 않는다** — `core:window:default` 가 준다.
 *
 * ⚠️ 여기 없는 메서드를 쓰면 이 게이트가 침묵한다. Tauri 가 창 API 를 늘리면 같이 늘린다.
 */
const GUARDED_METHODS = [
  "center",
  "close",
  "destroy",
  "hide",
  "maximize",
  "minimize",
  "requestUserAttention",
  "setAlwaysOnTop",
  "setDecorations",
  "setFocus",
  "setFullscreen",
  "setPosition",
  "setResizable",
  "setSize",
  "setSkipTaskbar",
  "setTitle",
  "show",
  "startDragging",
  "toggleMaximize",
  "unmaximize",
  "unminimize",
];

/** `setFocus` → `set-focus` */
export function toPermissionName(method) {
  return `core:window:allow-${method.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "paraglide") continue;
      walk(p, out);
    } else if (/\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 창 API 를 들여오는 파일에서 보호 대상 메서드 호출을 뽑는다.
 *
 * @returns {{file: string, method: string, line: number}[]}
 */
export function scanWindowCalls(srcDir = join(ROOT, "src")) {
  const calls = [];
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, "utf8");
    // 🔴 들여오지 않는 파일은 건너뛴다. 안 그러면 CodeMirror 의 `.destroy()` 가
    //    창 권한으로 잡힌다 — 실측으로 확인했다.
    if (!text.includes(WINDOW_IMPORT)) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const method of GUARDED_METHODS) {
        if (new RegExp(`\\.${method}\\s*\\(`).test(lines[i])) {
          calls.push({ file: relative(ROOT, file).replace(/\\/g, "/"), method, line: i + 1 });
        }
      }
    }
  }
  return calls;
}

/** `capabilities/default.json` 이 선언한 권한 목록. */
export function declaredPermissions(
  file = join(ROOT, "src-tauri", "capabilities", "default.json"),
) {
  return JSON.parse(readFileSync(file, "utf8")).permissions ?? [];
}

/**
 * 쓰는데 선언 안 된 권한.
 *
 * 🔴 **카나리아** — 스캐너가 아무것도 못 찾으면 던진다. "없다"와 "안 돌았다"를 가른다.
 * 이 저장소는 게이트가 0초에 통과하는 것으로 이미 당했다.
 */
export function missingPermissions() {
  const calls = scanWindowCalls();
  if (calls.length === 0) {
    throw new Error(
      `창 API 호출을 하나도 못 찾았다 — 스캐너가 안 돈 것이다. ` +
        `'${WINDOW_IMPORT}' 를 들여오는 파일이 정말 없는지 확인하라.`,
    );
  }
  const declared = new Set(declaredPermissions());
  const missing = new Map();
  for (const call of calls) {
    const perm = toPermissionName(call.method);
    if (declared.has(perm)) continue;
    if (!missing.has(perm)) missing.set(perm, []);
    missing.get(perm).push(`${call.file}:${call.line}`);
  }
  return { calls, missing };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const { calls, missing } = missingPermissions();
  console.log(`창 API 호출 ${calls.length}건`);
  for (const c of calls) console.log(`  ${c.method.padEnd(18)} ${c.file}:${c.line}`);
  if (missing.size === 0) {
    console.log("\n선언 누락 없음");
  } else {
    console.log("\n🔴 선언 안 된 권한:");
    for (const [perm, where] of missing) console.log(`  ${perm}  ← ${where.join(" · ")}`);
    process.exitCode = 1;
  }
}
