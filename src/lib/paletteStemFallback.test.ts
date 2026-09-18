import { describe, it, expect, beforeEach } from "vitest";
import { quickEntries } from "$lib/stores/search";
import { unifiedSearchWithFallback, type PaletteEntry } from "./palette";
import { deriveKeys, type QuickEntry } from "./searchIndex";

/**
 * 어간 뒷문 — **0건일 때만** 도는가, 그리고 **말하는가.**
 *
 * ## 🔴 왜 (2026-09-19 실사용 로그)
 *
 * "결과가 0건이던 질의"에 `blogwrite` 계열이 7회 있었고 찾던 노트는 vault 에 있었다
 * (`blog-writing-skill-20260829.md`). 순수 subsequence 는 `write` 의 `e` 하나 때문에
 * `null` 을 낸다.
 *
 * ⚠️ 이 기능의 위험은 IME 되돌리기와 같다 — **되는 질의를 건드리는 것**, 그리고
 * **조용히 다른 것을 주는 것**. 둘 다 여기서 못 박는다.
 */

const entry = (name: string): QuickEntry => ({
  path: `/v/${name}.md`,
  primaryLabel: name,
  matchKeys: [name],
  ...deriveKeys([name]),
  parentPath: "/v",
});

beforeEach(() => {
  quickEntries.set([
    entry("blog-writing-skill-20260829"),
    entry("open-items"),
    entry("기본설정"),
  ]);
});

describe("unifiedSearchWithFallback — 어간", () => {
  /** `PaletteEntry` 는 유니온이다 — 노트 결과의 경로만 뽑는다. */
  const notePaths = (results: { entry: PaletteEntry }[]): string[] =>
    results.flatMap((r) => (r.entry.kind === "note" ? [r.entry.path] : []));

  it("🔴 실측 질의가 노트를 찾는다", async () => {
    const { results } = await unifiedSearchWithFallback("blogwrite", "files");
    expect(notePaths(results)).toContain("/v/blog-writing-skill-20260829.md");
  });

  it("🔴 어간으로 찾았다고 말한다 — 조용히 주면 안 된다", async () => {
    const { stemMatched } = await unifiedSearchWithFallback("blogwrite", "files");
    expect(stemMatched).toBe(true);
  });

  it("⚠️ 되는 질의에는 안 붙는다", async () => {
    const { results, stemMatched } = await unifiedSearchWithFallback("blog", "files");
    expect(results.length).toBeGreaterThan(0);
    expect(stemMatched).toBeUndefined();
  });

  it("어간으로도 0건이면 표시도 없다", async () => {
    const { results, stemMatched } = await unifiedSearchWithFallback("zzzqqq", "files");
    expect(results).toEqual([]);
    expect(stemMatched).toBeUndefined();
  });
});
