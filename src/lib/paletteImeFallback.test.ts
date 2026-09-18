import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { quickEntries } from "$lib/stores/search";
import { unifiedSearchWithFallback } from "./palette";
import { deriveKeys, type QuickEntry } from "./searchIndex";

/**
 * 한글 IME 되돌리기 — **0건일 때만** 도는가.
 *
 * ## 🔴 왜 (2026-08-30 실사용 로그)
 *
 * "결과가 0건이던 질의" 아홉 중 **일곱**이 한글 IME 를 켠 채 친 영문이었다:
 * `ㄴㄷ셔ㅔㅠㅁㄴㄷ` → `setupbase`. 그리고 **찾던 노트는 vault 에 있었다**
 * (`vibecoding-setup-baseline-20260830.md`). 키를 칠 때마다 0건을 받고 못 찾았다.
 *
 * ⚠️ 이 기능의 위험은 **되는 질의를 건드리는 것**이다. 그래서 0건이라는 조건과
 * "바꿨다고 말한다"는 계약을 여기서 못 박는다.
 */

const entry = (name: string): QuickEntry => ({
  path: `/v/${name}.md`,
  primaryLabel: name,
  matchKeys: [name],
  // 파생 규칙의 주인은 `deriveKeys` 하나다 — 손으로 다시 만들지 않는다.
  ...deriveKeys([name]),
  parentPath: "/v",
});

beforeEach(() => {
  quickEntries.set([
    entry("vibecoding-setup-baseline-20260830"),
    entry("windows-setup-pointer"),
    entry("한글-노트"),
  ]);
});

describe("IME 되돌리기", () => {
  /** 로그에 실제로 남았던 그 질의. */
  it("한글로 찍힌 영문이 0건이면 되돌려 찾고, 무엇으로 찾았는지 말한다", async () => {
    const r = await unifiedSearchWithFallback("ㄴㄷ셔ㅔㅠㅁㄴㄷ", "files");
    expect(r.imeSwappedTo).toBe("setupbase");
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.some((x) => (x.entry as { path: string }).path.includes("setup-baseline"))).toBe(
      true,
    );
  });

  it("치는 도중의 짧은 것도 잡는다 — 로그의 일곱이 전부 중간 상태였다", async () => {
    const r = await unifiedSearchWithFallback("ㄴㄷ셔ㅔ", "files");
    expect(r.imeSwappedTo).toBe("setup");
    expect(r.results.length).toBeGreaterThan(0);
  });

  // ── 🔴 안 도는 자리 ──────────────────────────────────────────────────────

  it("결과가 있으면 절대 안 건드린다", async () => {
    const r = await unifiedSearchWithFallback("setup", "files");
    expect(r.imeSwappedTo).toBeUndefined();
    expect(r.results.length).toBeGreaterThan(0);
  });

  /** ⚠️ 진짜 한글 노트를 찾는 질의를 자판으로 되돌려 버리면 안 된다. */
  it("한글로 찾아서 결과가 있으면 그대로 둔다", async () => {
    const r = await unifiedSearchWithFallback("한글", "files");
    expect(r.imeSwappedTo).toBeUndefined();
    expect(r.results.length).toBeGreaterThan(0);
  });

  it("되돌려도 0건이면 처음 결과(0건)를 그대로 낸다 — 두 번 시도하지 않는다", async () => {
    const r = await unifiedSearchWithFallback("ㅋㅋㅋㅋㅋ", "files");
    expect(r.imeSwappedTo).toBeUndefined();
    expect(r.results).toEqual([]);
  });

  it("한글이 없으면 되돌릴 것도 없다", async () => {
    const r = await unifiedSearchWithFallback("zzzznotfound", "files");
    expect(r.imeSwappedTo).toBeUndefined();
    expect(r.results).toEqual([]);
  });

  it("빈 질의는 건드리지 않는다", async () => {
    const r = await unifiedSearchWithFallback("", "files");
    expect(r.imeSwappedTo).toBeUndefined();
  });

  /** 가드가 실제로 뭔가를 보고 있는지 — 스토어가 비면 위 단정들이 다 공허하다. */
  it("픽스처가 실제로 실려 있다", () => {
    expect(get(quickEntries).length).toBe(3);
  });
});
