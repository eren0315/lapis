import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs 에 타입 선언이 없다. 이 게이트의 주인은 그쪽이다.
import {
  toPermissionName,
  scanWindowCalls,
  declaredPermissions,
  missingPermissions,
} from "./tauriWindowPermissions.mjs";

/**
 * 창 API 를 쓰는데 권한을 선언 안 하면 **런타임에 조용히 거부된다.**
 * 실제로 `set_focus` 가 그래서 `lapis open` 이 연 노트를 덮어썼다.
 *
 * ⚠️ 이 게이트는 **한 방향만** 본다 — 쓰는데 선언 안 된 것. 선언했는데 안 쓰는 것은
 * 안 본다(`start-dragging` 은 HTML 속성으로 쓰여 정적 스캔에 안 잡힌다).
 */
describe("Tauri 창 권한", () => {
  it("메서드 이름을 권한 이름으로 바꾼다", () => {
    expect(toPermissionName("setFocus")).toBe("core:window:allow-set-focus");
    expect(toPermissionName("show")).toBe("core:window:allow-show");
    expect(toPermissionName("unminimize")).toBe("core:window:allow-unminimize");
    expect(toPermissionName("toggleMaximize")).toBe("core:window:allow-toggle-maximize");
  });

  it("창 API 를 들여오는 파일에서만 호출을 뽑는다", () => {
    const calls = scanWindowCalls();
    // 🔴 카나리아 — 0건이면 스캐너가 안 돈 것이다
    expect(calls.length).toBeGreaterThan(0);

    // CodeMirror 의 `.destroy()` 는 창 API 가 아니다. 파일을 안 좁히면 여기 잡힌다.
    const files = new Set(calls.map((c: { file: string }) => c.file));
    expect(files).not.toContain("src/lib/Editor.svelte");
    expect(files).not.toContain("src/lib/CustomCssEditor.svelte");
  });

  it("실제로 부르는 창 메서드를 전부 잡는다", () => {
    const methods = new Set(scanWindowCalls().map((c: { method: string }) => c.method));
    // 이 넷은 코드에 확실히 있다 — 하나라도 빠지면 스캐너가 반쪽이다
    for (const m of ["setFocus", "show", "unminimize", "setDecorations"]) {
      expect(methods).toContain(m);
    }
  });

  it("선언 목록을 읽는다", () => {
    const declared = declaredPermissions();
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toContain("core:default");
  });

  it("🔴 쓰는데 선언 안 된 권한이 없다", () => {
    const { missing } = missingPermissions();
    const lines = [...missing.entries()].map(
      ([perm, where]: [string, string[]]) => `${perm}  ← ${where.join(" · ")}`,
    );
    expect(lines).toEqual([]);
  });
});
