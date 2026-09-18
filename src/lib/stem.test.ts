import { describe, it, expect } from "vitest";
import { stemWord, stemPhrase } from "./stem";

/**
 * 🔴 계약은 "올바른 원형"이 아니라 **양쪽이 같은 형태로 접힌다**는 것이다.
 *
 * 질의와 대상을 같은 규칙으로 접으므로 `parse` 와 `parsing` 이 둘 다 `pars` 가 되면
 * 목적을 이룬다. `not` 처럼 다른 낱말과 겹치는 것은 **0건일 때만** 보는 경로라 받는다.
 */
describe("stemWord — 굴절만 접는다", () => {
  it("🔴 실측이 요구한 것 — write 와 writing 이 같아진다", () => {
    expect(stemWord("writing")).toBe("writ");
    expect(stemWord("write")).toBe("writ");
  });

  it("-ing · -ed 가 같은 자리로 접힌다", () => {
    expect(stemWord("parsing")).toBe("pars");
    expect(stemWord("parsed")).toBe("pars");
    expect(stemWord("parse")).toBe("pars");
  });

  it("자음 중복을 되돌린다", () => {
    expect(stemWord("running")).toBe("run");
    expect(stemWord("dropped")).toBe("drop");
  });

  it("e 를 붙이지 않는다 — indexing 은 index 다", () => {
    expect(stemWord("indexing")).toBe("index");
    expect(stemWord("indexed")).toBe("index");
    expect(stemWord("index")).toBe("index");
  });

  it("복수와 -y 가 단수와 같아진다", () => {
    expect(stemWord("notes")).toBe(stemWord("note"));
    expect(stemWord("matches")).toBe("match");
    expect(stemWord("queries")).toBe("queri");
    expect(stemWord("query")).toBe("queri");
  });

  it("⚠️ 짧은 낱말은 안 건드린다 — 접으면 남는 게 없다", () => {
    expect(stemWord("ing")).toBe("ing");
    expect(stemWord("is")).toBe("is");
    expect(stemWord("run")).toBe("run");
    expect(stemWord("es")).toBe("es");
  });

  it("-ss 는 복수가 아니다", () => {
    expect(stemWord("class")).toBe("class");
    expect(stemWord("pass")).toBe("pass");
  });

  it("🔴 한글은 손대지 않는다", () => {
    expect(stemWord("노트")).toBe("노트");
    expect(stemWord("검색된")).toBe("검색된");
    expect(stemWord("계획서들")).toBe("계획서들");
  });

  it("숫자는 그대로다", () => {
    expect(stemWord("20260829")).toBe("20260829");
    expect(stemWord("v3")).toBe("v3");
  });
});

describe("stemPhrase — 낱말로 갈라 접고 구분자 없이 잇는다", () => {
  it("🔴 실측 사례 — 질의가 대상의 접두사가 된다", () => {
    const target = stemPhrase("blog-writing-skill-20260829");
    // ⚠️ `skill` 은 그대로다 — `ll` 은 중복 제거에서 뺐다(`skill` · `full` 은 원래 그렇다)
    expect(target).toBe("blogwritskill20260829");
    // 사용자가 실제로 친 것
    expect(target.startsWith(stemPhrase("blogwrite"))).toBe(true);
    expect(target.startsWith(stemPhrase("blogwriteing"))).toBe(true);
  });

  it("공백·밑줄·점도 구분자다", () => {
    expect(stemPhrase("note_parsing test.rules")).toBe("notparstestrul");
  });

  it("소문자로 낸다 — 매칭 캐시 경로가 소문자를 전제한다", () => {
    expect(stemPhrase("Blog-Writing")).toBe("blogwrit");
  });

  it("한글이 섞여도 라틴 부분만 접는다", () => {
    expect(stemPhrase("검색-queries-정리")).toBe("검색queri정리");
  });

  it("⚠️ 접을 것이 없으면 구분자만 지운 형태다", () => {
    expect(stemPhrase("open-items")).toBe("openitem");
  });
});
