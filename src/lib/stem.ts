/**
 * 영어 굴절을 접는 **선언된 접미사 표.** 파일명 fuzzy 검색의 0건 뒷문이 쓴다.
 *
 * ## 🔴 계약은 "올바른 원형"이 아니다
 *
 * **질의와 대상을 같은 규칙으로 접어 같은 형태가 되게** 하는 것이 전부다. `parse` 와
 * `parsing` 이 둘 다 `pars` 가 되면 목적을 이룬다 — `pars` 가 사전에 없는 것은 상관없다.
 *
 * ⚠️ 처음엔 대상만 접으려 했는데 그러면 `parse` 가 `parsing` 을 못 찾는다. 한쪽만 접는
 * 설계는 **접는 방향이 맞는 낱말에서만** 동작한다.
 *
 * ## 왜 Porter 가 아닌가
 *
 * Porter 전체는 200줄 가까이 되고 이 저장소가 쓰는 것은 굴절 몇 개뿐이다. 규칙을 표로
 * 선언하면 **주인이 하나**고 테스트가 전수한다. 대신 거칠어서 `note` 와 `not` 이 같은
 * 자리로 접힌다 — **0건일 때만** 보는 경로라 받는다.
 *
 * ## ⚠️ 편집거리가 아니다
 *
 * v3.11.0 이 IME 되돌리기를 넣으며 *"고정 표라 편집거리 추정이 아니다"* 라고 선을 그었다.
 * 여기도 같다 — 선언된 규칙이지 "비슷한 것"을 재는 것이 아니다.
 *
 * ## ⚠️ 라틴 문자만
 *
 * 한글은 손대지 않는다. 조사·어미를 접으려면 사전이 필요하고, 그건 이 저장소가
 * [[unlinked-mentions-measurement]] 에서 **+1건이라 값이 아니라고 이미 기각한** 것이다.
 */

/** 접기 대상 최소 길이. 이보다 짧으면 접어도 남는 게 없다. */
const MIN_LENGTH = 4;

/** 접은 뒤 남아야 하는 최소 길이. */
const MIN_STEM = 3;

const HAS_LATIN = /[a-z]/;

/** 자음 중복 — `runn` · `dropp`. `ll` · `ss` · `ff` · `zz` 는 원래 그런 낱말이 많아 뺀다. */
const DOUBLED = /([bcdfgmnprt])\1$/;

/**
 * 낱말 하나를 접는다. 라틴 문자가 없거나 짧으면 그대로 돌려준다.
 *
 * 순서가 의미를 갖는다 — `-ies` 를 `-s` 보다 먼저 봐야 `queries` 가 `querie` 가 안 된다.
 */
export function stemWord(word: string): string {
  const w = word.toLowerCase();
  if (!HAS_LATIN.test(w) || w.length < MIN_LENGTH) return w;

  let s = w;
  if (s.endsWith("ies") && s.length >= MIN_STEM + 2) {
    s = s.slice(0, -3) + "i";
  } else if (s.endsWith("ing") && s.length >= MIN_STEM + 2) {
    s = s.slice(0, -3);
  } else if (s.endsWith("ed") && s.length >= MIN_STEM + 1) {
    s = s.slice(0, -2);
  } else if (s.endsWith("s") && !s.endsWith("ss") && s.length >= MIN_STEM + 1) {
    s = s.slice(0, -1);
  }

  // `runn` → `run`. 접미사를 뗀 뒤에만 의미가 있다.
  if (s.length > MIN_STEM && DOUBLED.test(s)) s = s.slice(0, -1);

  // `write` 와 `writ`, `parse` 와 `pars` 를 같은 자리로.
  if (s.length > MIN_STEM && s.endsWith("e")) s = s.slice(0, -1);

  // `query` 와 `queries` 를 같은 자리로.
  if (s.length > MIN_STEM && s.endsWith("y")) s = s.slice(0, -1) + "i";

  return s;
}

/** 낱말 구분자 — 파일명이 쓰는 것들. */
const SEPARATORS = /[-_.\s/]+/;

/**
 * 구절을 낱말로 갈라 각각 접고 **구분자 없이** 잇는다.
 *
 * 구분자를 지우는 이유는 질의가 구분자를 안 치기 때문이다 — 사람은 `blogwrite` 라고
 * 치지 `blog-write` 라고 치지 않는다.
 */
export function stemPhrase(phrase: string): string {
  return phrase
    .split(SEPARATORS)
    .filter(Boolean)
    .map(stemWord)
    .join("");
}
