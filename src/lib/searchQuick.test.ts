import { describe, it, expect, beforeEach } from "vitest";
import {
  searchQuick,
  searchQuickIncremental,
  resetQuickSearchCache,
  deriveKeys,
  type QuickEntry,
} from "./searchIndex";

function entry(label: string, ...extraKeys: string[]): QuickEntry {
  const matchKeys = [label, ...extraKeys];
  return {
    path: `/v/${label}.md`,
    primaryLabel: label,
    matchKeys,
    // ⚠️ 파생 규칙은 앱과 **같은 것**을 쓴다. 손으로 다시 만들면 테스트가 앱이 안 하는
    //    일을 검증하게 된다.
    ...deriveKeys(matchKeys),
    parentPath: "v",
  };
}

const ENTRIES = [
  entry("다크모드_색상이미지_개요_root"),
  entry("다크모드_구현계획"),
  entry("라이트모드_정리"),
  entry("Dark Theme Notes"),
  entry("기본설정"),
];

/** incremental 결과와 순수 searchQuick 결과의 (path, score) 동등성. */
function sameAsFresh(query: string): void {
  resetQuickSearchCache();
  const fresh = searchQuick(query, ENTRIES);
  const inc = searchQuickIncremental(query, ENTRIES);
  expect(inc.map((h) => [h.entry.path, h.score])).toEqual(
    fresh.map((h) => [h.entry.path, h.score]),
  );
}

describe("searchQuickIncremental — 정확성(순수 searchQuick과 동등)", () => {
  beforeEach(() => resetQuickSearchCache());

  it("단발 쿼리는 searchQuick과 동일", () => {
    sameAsFresh("다크");
    sameAsFresh("모드");
    sameAsFresh("dark");
  });

  it("prefix 확장 시퀀스: 누적 호출 결과 == 마지막 쿼리 단발 결과", () => {
    // 점진: "다" → "다크" → "다크모" 순으로 좁혀가며 호출
    searchQuickIncremental("다", ENTRIES);
    searchQuickIncremental("다크", ENTRIES);
    const incremental = searchQuickIncremental("다크모", ENTRIES);
    resetQuickSearchCache();
    const fresh = searchQuick("다크모", ENTRIES);
    expect(incremental.map((h) => h.entry.path)).toEqual(fresh.map((h) => h.entry.path));
  });

  it("하위 랭크가 다음 쿼리에서 상위로 와도 누락 없음(후보군 전체 보관)", () => {
    // "다크모드_구현계획"은 "다"에서 다른 항목보다 하위일 수 있으나 "다크모드_구"에서 살아남아야.
    searchQuickIncremental("다", ENTRIES);
    const inc = searchQuickIncremental("다크모드_구", ENTRIES);
    expect(inc.map((h) => h.entry.primaryLabel)).toContain("다크모드_구현계획");
  });

  it("삭제(비-prefix 변경)는 전체 재스캔으로 정확", () => {
    searchQuickIncremental("다크모드", ENTRIES);
    // "라이트"로 바뀜 — 직전 후보군엔 없지만 전체엔 있음
    const inc = searchQuickIncremental("라이트", ENTRIES);
    expect(inc.map((h) => h.entry.primaryLabel)).toContain("라이트모드_정리");
  });

  it("entries 교체(reindex) 시 캐시 무효화", () => {
    searchQuickIncremental("기본", ENTRIES);
    const fresh2 = [entry("기본정책"), entry("기본값")];
    const inc = searchQuickIncremental("기본", fresh2);
    const labels = inc.map((h) => h.entry.primaryLabel).sort();
    expect(labels).toEqual(["기본값", "기본정책"]);
  });
});

describe("searchQuickIncremental — 초성 모드 전환", () => {
  beforeEach(() => resetQuickSearchCache());

  it("초성 쿼리도 incremental 동작 + 모드 일치 시 prefix 확장", () => {
    // "ㄷㅋ"(초성) → "ㄷㅋㅁㄷ"(초성) — 둘 다 chosung 모드
    searchQuickIncremental("ㄷㅋ", ENTRIES);
    const inc = searchQuickIncremental("ㄷㅋㅁㄷ", ENTRIES);
    resetQuickSearchCache();
    const fresh = searchQuick("ㄷㅋㅁㄷ", ENTRIES);
    expect(inc.map((h) => h.entry.path)).toEqual(fresh.map((h) => h.entry.path));
    expect(inc.map((h) => h.entry.primaryLabel)).toContain("다크모드_색상이미지_개요_root");
  });

  it("모드 전환(초성→일반)은 prefix여도 전체 재스캔", () => {
    // "ㄷ"(초성) 다음 "다크"(일반) — startsWith 아님 + 모드 다름 → 전체 스캔
    searchQuickIncremental("ㄷ", ENTRIES);
    const inc = searchQuickIncremental("다크", ENTRIES);
    resetQuickSearchCache();
    const fresh = searchQuick("다크", ENTRIES);
    expect(inc.map((h) => h.entry.path)).toEqual(fresh.map((h) => h.entry.path));
  });
});

/**
 * 🔴 실사용 로그가 요구한 것 (2026-09-19)
 *
 * `blogwrite` 로 7회 검색해 전부 0건이었는데 `blog-writing-skill-20260829.md` 는 있었다.
 * 막은 것은 하이픈이 아니라 `writing` 에 없는 `e` 다 — 순수 subsequence 는 한 글자가
 * 어긋나면 `null` 을 낸다.
 */
describe("구분자 제거 — 항상 (순위)", () => {
  const E = [entry("blog-writing-skill-20260829"), entry("기본설정")];

  it("구분자를 건너뛴 연속 매칭이 훨씬 높은 점수를 받는다", () => {
    const hit = searchQuick("blogwrit", E)[0];
    expect(hit.entry.path).toBe("/v/blog-writing-skill-20260829.md");
    // 원본만 보면 144점(subsequence). 구분자를 지우면 접두사 매칭이라 700점대다.
    expect(hit.score).toBeGreaterThan(700);
  });

  it("⚠️ 보여주는 것은 원본 키다 — 구분자 지운 형태를 화면에 내면 안 된다", () => {
    expect(searchQuick("blogwrit", E)[0].matchedKey).toBe("blog-writing-skill-20260829");
  });

  it("어간을 안 타므로 via 가 없다", () => {
    expect(searchQuick("blogwrit", E)[0].via).toBeUndefined();
  });
});

describe("어간 뒷문 — 0건일 때만", () => {
  const E = [entry("blog-writing-skill-20260829"), entry("open-items"), entry("기본설정")];

  it("🔴 실측 질의가 노트를 찾는다", () => {
    const hits = searchQuick("blogwrite", E);
    expect(hits.map((h) => h.entry.path)).toContain("/v/blog-writing-skill-20260829.md");
  });

  it("🔴 어간으로 찾았음을 표시한다 — 조용히 다른 것을 주면 안 된다", () => {
    expect(searchQuick("blogwrite", E)[0].via).toBe("stem");
  });

  it("타이핑 끝에 친 것도 찾는다", () => {
    expect(searchQuick("blogwriteing", E)[0].entry.path).toBe(
      "/v/blog-writing-skill-20260829.md",
    );
  });

  it("⚠️ 되는 질의는 절대 안 건드린다 — via 없음, 점수 그대로", () => {
    const before = searchQuick("blog", E);
    expect(before[0].via).toBeUndefined();
    expect(before[0].entry.path).toBe("/v/blog-writing-skill-20260829.md");
  });

  it("단수·복수가 서로를 찾는다", () => {
    expect(searchQuick("openitem", E)[0].entry.path).toBe("/v/open-items.md");
  });

  it("어간으로도 0건이면 거기서 끝이다", () => {
    expect(searchQuick("zzzqqq", E)).toEqual([]);
  });

  it("⚠️ 초성 질의는 어간을 안 탄다 — 라틴 규칙이다", () => {
    expect(searchQuick("ㅋㅋㅋ", E)).toEqual([]);
  });
});

describe("incremental 이 어간 뒷문에서도 순수 구현과 같다", () => {
  const E = [entry("blog-writing-skill-20260829"), entry("open-items"), entry("기본설정")];

  it("0건으로 좁혀진 뒤에도 같은 답을 낸다", () => {
    resetQuickSearchCache();
    // 사용자가 실제로 친 순서 — blogwrit(됨) → blogwrite(0건 → 어간)
    searchQuickIncremental("blogwrit", E);
    const inc = searchQuickIncremental("blogwrite", E);
    resetQuickSearchCache();
    const fresh = searchQuick("blogwrite", E);
    expect(inc.map((h) => [h.entry.path, h.score, h.via])).toEqual(
      fresh.map((h) => [h.entry.path, h.score, h.via]),
    );
    expect(inc.length).toBeGreaterThan(0);
  });
});
