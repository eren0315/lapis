import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KNOWN_BUNDLE_TARGETS, SHIPPED_TARGETS } from "./bundleTargets.mjs";

/**
 * 번들 타깃이 **사실을 말하는가.**
 *
 * ## 🔴 왜 (2026-09-02 실측)
 *
 * `tauri.conf.json` 이 `"targets": "all"` 이라고 적어 두고 **nsis 하나만** 냈다.
 * 에러도 경고도 없었다:
 *
 * ```
 * Finished 1 bundle at: …\bundle\nsis\Lapis_3.11.0_x64-setup.exe
 * ```
 *
 * | | |
 * |---|---|
 * | 문서 | `"all"` = 지원하는 형식 **전부** |
 * | 실측 | `"all"` → **nsis 만** |
 * | 실측 | `--bundles msi` → **잘 나온다** (WiX 는 깔려 있고 정상 동작) |
 *
 * ⚠️ **왜 갈리는지는 모른다.** Tauri v2 의 동작 변화인지 버그인지 문서가 답하지 않는다.
 * 그래서 `"all"` 을 믿지 않고 **적어 둔 것만** 만들게 한다.
 *
 * ⚠️ 그 사이 MSI 는 **2.4.1 이후 13번의 릴리스 동안 안 나왔고 아무도 몰랐다.** 필요하면
 * `npm run tauri build -- --bundles msi` 로 언제든 나온다 — 기본에서 뺀 이유다.
 *
 * ## ⚠️ 한 설정이 두 머신을 덮는다
 *
 * Windows 에서 `app`·`dmg` 를 같이 적어도 **안 깨진다**(2026-09-02 실측) — 해당 없는
 * 타깃은 건너뛰고 nsis 가 나온다. 그래서 플랫폼별로 파일을 가르지 않는다.
 */

const CONF = "src-tauri/tauri.conf.json";

// ⚠️ 목록을 여기 다시 적지 않는다. 주인은 `bundleTargets.mjs` 이고, 게이트 스크립트도
//    같은 것을 읽는다 — 사본이 둘이 되는 순간 이 테스트가 지키려던 것이 무너진다.
const KNOWN = new Set(KNOWN_BUNDLE_TARGETS);
const SHIPPED: Record<string, string[]> = SHIPPED_TARGETS;

function targets(): unknown {
  return JSON.parse(readFileSync(CONF, "utf8")).bundle?.targets;
}

describe("번들 타깃", () => {
  /**
   * 🔴 이게 이 파일의 요점이다. `"all"` 은 **적어 둔 것과 다른 것을 만든다.**
   */
  it('"all" 을 쓰지 않는다 — 무엇이 나올지 말해주지 않는다', () => {
    expect(
      targets(),
      '`"all"` 은 실측에서 nsis 하나만 냈다. 만들 것을 배열로 적어라',
    ).not.toBe("all");
  });

  it("배열이고 비어 있지 않다", () => {
    const t = targets();
    expect(Array.isArray(t), "targets 는 배열이어야 한다").toBe(true);
    expect((t as string[]).length).toBeGreaterThan(0);
  });

  /** ⚠️ 모르는 값은 tauri 가 **조용히 무시**한다. 오타가 번들을 통째로 없앤다. */
  it("아는 타깃만 적혀 있다", () => {
    for (const t of targets() as string[]) {
      expect(KNOWN, `모르는 번들 타깃: ${t}`).toContain(t);
    }
  });

  /**
   * 🔴 **한쪽 머신만 덮는 설정을 못 박는다.** 전역 규칙이 말하는 그 함정이다 —
   * 한쪽에만 맞는 설정은 다른 쪽에서 에러 없이 무시돼 조용히 반쪽이 된다.
   */
  it("두 머신 다 덮는다 — Windows 와 macOS", () => {
    const t = new Set(targets() as string[]);
    for (const [os, needed] of Object.entries(SHIPPED)) {
      for (const one of needed) {
        expect(t, `${os} 에서 만들 것이 없다: ${one}`).toContain(one);
      }
    }
  });
});
