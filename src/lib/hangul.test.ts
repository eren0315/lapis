import { describe, it, expect } from "vitest";
import { chosungOf, isChosungQuery } from "./hangul";
import { deriveKeys, searchQuick, type QuickEntry } from "./searchIndex";

describe("chosungOf", () => {
  it("한글 음절 → 초성", () => {
    expect(chosungOf("검색")).toBe("ㄱㅅ");
    expect(chosungOf("한글")).toBe("ㅎㄱ");
    expect(chosungOf("프로젝트")).toBe("ㅍㄹㅈㅌ");
  });
  it("쌍자음 초성", () => {
    expect(chosungOf("까치")).toBe("ㄲㅊ");
    expect(chosungOf("빵빵")).toBe("ㅃㅃ");
  });
  it("받침이 초성 인덱스에 영향 없음", () => {
    expect(chosungOf("값")).toBe("ㄱ"); // 종성 ㅄ 무관
    expect(chosungOf("닭고기")).toBe("ㄷㄱㄱ");
  });
  it("비한글은 소문자로 보존(위치 유지)", () => {
    expect(chosungOf("검색API")).toBe("ㄱㅅapi");
    expect(chosungOf("hello")).toBe("hello");
    expect(chosungOf("v1.2 검색")).toBe("v1.2 ㄱㅅ");
  });
});

describe("isChosungQuery", () => {
  it("자음만이면 true", () => {
    expect(isChosungQuery("ㄱㅂㅈ")).toBe(true);
    expect(isChosungQuery("ㅎ")).toBe(true);
    expect(isChosungQuery("ㄲㅊ")).toBe(true); // 쌍자음
    expect(isChosungQuery("ㄱ ㅂ")).toBe(true); // 공백 무시
  });
  it("음절·모음·라틴·빈문자는 false", () => {
    expect(isChosungQuery("검색")).toBe(false); // 완성 음절
    expect(isChosungQuery("ㄱ밥")).toBe(false); // 자음+음절 혼합
    expect(isChosungQuery("ㅏㅓ")).toBe(false); // 모음
    expect(isChosungQuery("hello")).toBe(false);
    expect(isChosungQuery("")).toBe(false);
    expect(isChosungQuery("   ")).toBe(false);
  });
});

describe("searchQuick — 초성 모드", () => {
  function entry(label: string, ...extraKeys: string[]): QuickEntry {
    const matchKeys = [label, ...extraKeys];
    return {
      path: `/v/${label}.md`,
      primaryLabel: label,
      matchKeys,
      ...deriveKeys(matchKeys),
      parentPath: "v",
    };
  }

  const entries = [entry("김밥"), entry("기본서"), entry("프로젝트"), entry("hello")];

  it('"ㄱㅂ"는 김밥·기본서를 잡고 프로젝트는 제외', () => {
    const hits = searchQuick("ㄱㅂ", entries);
    const labels = hits.map((h) => h.entry.primaryLabel);
    expect(labels).toContain("김밥");
    expect(labels).toContain("기본서");
    expect(labels).not.toContain("프로젝트");
    expect(labels).not.toContain("hello");
  });

  it("초성 정확 일치(김밥=ㄱㅂ)가 부분 일치(기본서=ㄱㅂㅅ)보다 상위", () => {
    const hits = searchQuick("ㄱㅂ", entries);
    expect(hits[0].entry.primaryLabel).toBe("김밥"); // q===t(1000) > prefix(800)
  });

  it("matchedKey는 초성이 아니라 원본 라벨", () => {
    const hits = searchQuick("ㄱㅂ", entries);
    expect(hits[0].matchedKey).toBe("김밥");
  });

  it("일반 쿼리(완성 음절)는 초성 매칭으로 빠지지 않음", () => {
    // "ㄱㅂ"가 아닌 "김"은 일반 fuzzy → 김밥만 매칭, 기본서는 초성으로 안 잡힘
    const hits = searchQuick("김", entries);
    const labels = hits.map((h) => h.entry.primaryLabel);
    expect(labels).toContain("김밥");
    expect(labels).not.toContain("기본서");
  });

  it("alias도 초성 매칭 대상", () => {
    const withAlias = [entry("문서", "회의록")]; // alias 회의록 → ㅎㅇㄹ
    const hits = searchQuick("ㅎㅇㄹ", withAlias);
    expect(hits.map((h) => h.entry.primaryLabel)).toContain("문서");
    expect(hits[0].matchedKey).toBe("회의록"); // 매칭된 원본 키
  });

  it('실제 보고 케이스: "ㄷㅋㅁㄷ" → "다크모드_..." 파일 (앞부분 초성 매칭)', () => {
    // 파일명이 "다크모드"로 시작 → 초성 ㄷㅋㅁㄷ가 접두 → startsWith 매칭돼야 함.
    const real = [entry("다크모드_색상이미지_개요_root"), entry("문서목록")];
    const hits = searchQuick("ㄷㅋㅁㄷ", real);
    expect(hits.map((h) => h.entry.primaryLabel)).toContain("다크모드_색상이미지_개요_root");
    expect(hits[0].entry.primaryLabel).toBe("다크모드_색상이미지_개요_root"); // 접두 매칭이 상위
  });
});
