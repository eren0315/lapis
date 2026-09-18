/**
 * 번들 타깃의 **주인** — 무엇을 만들기로 했고, 이 머신에서 무엇이 나와야 하는가.
 *
 * ## 🔴 왜 있나 (2026-09-02 실측)
 *
 * `tauri.conf.json` 이 `"targets": "all"` 이라고 적어 두고 **nsis 하나만** 냈다.
 * 에러도 경고도 없었고, 그래서 MSI 가 **2.4.1 이후 13번의 릴리스 동안** 안 나온 것을
 * 아무도 몰랐다.
 *
 * | | |
 * |---|---|
 * | 문서 | `"all"` = 지원하는 형식 전부 |
 * | 실측 | `"all"` → nsis 만 |
 * | 실측 | `--bundles msi` → 잘 나온다(WiX 정상) |
 *
 * ⚠️ **왜 갈리는지는 모른다.** 그래서 `"all"` 을 안 쓰고 적어 둔 것만 만들게 한다.
 *
 * ⚠️ 이 파일은 **import 를 넣지 않는다.** `commandIds.mjs` 와 같은 이유다 — 게이트
 * 스크립트와 테스트가 둘 다 읽어야 하고, 둘 중 하나라도 못 읽게 되면 사본이 자란다.
 */

/** tauri 가 아는 번들 타깃. 모르는 값은 **조용히 무시**되므로 오타를 잡는다. */
export const KNOWN_BUNDLE_TARGETS = ["deb", "rpm", "appimage", "nsis", "msi", "app", "dmg"];

/**
 * 이 프로젝트가 배포하는 머신과, 그 머신에서 **반드시 나와야 하는** 타깃.
 *
 * ⚠️ Linux 는 배포 타깃이 아니다(`CLAUDE.md` 의 플랫폼 전제).
 * ⚠️ MSI 는 여기 없다 — 13번의 릴리스 동안 안 나왔고 아무도 안 찾았다.
 *    필요하면 `npm run tauri build -- --bundles msi` 로 그때 만든다.
 */
export const SHIPPED_TARGETS = {
  win32: ["nsis"],
  darwin: ["app", "dmg"],
};

/**
 * 이 플랫폼에서 나와야 하는 타깃 — 설정과 배포 대상의 **교집합**.
 *
 * ⚠️ 교집합인 것이 요점이다. Windows 에서 `dmg` 가 안 나오는 것은 정상이고,
 * `nsis` 가 안 나오는 것은 사고다. 그 둘을 가르지 않으면 검사가 늘 울거나 늘 조용하다.
 */
export function expectedBundles(targets, platform) {
  if (!Array.isArray(targets)) return null; // `"all"` — 무엇이 나올지 말해주지 않는다
  const shipped = SHIPPED_TARGETS[platform];
  if (!shipped) return []; // 배포 대상이 아닌 머신 — 검사할 것이 없다
  return shipped.filter((t) => targets.includes(t));
}
