import { resolveTarget, targetName, type LinkIndex } from "$lib/linkIndex";
import type { LinkInfo } from "$lib/tauri/notes";
import { statusLifecycle } from "$lib/docStatus";
import { blankCodeBlocks } from "$lib/codeLines";
import type { OpenTaskGroup } from "$lib/openTasks";

/**
 * vault 진단 — **백링크 없는 노트 · 태그 중복 후보 · 모호한 이름.**
 *
 * ⚠️ **화면 용어와 코드 용어가 다르다.** UI 는 "vault 진단" · "백링크 없음"이고 코드는
 * `hygiene` · `orphan` 이다. 바꾸지 않은 이유는 `lapis links --orphans` 가 **API** 라서다 —
 * 플래그를 바꾸면 남의 스크립트가 깨진다. 코드 쪽 이름을 UI 를 따라 바꾸면 CLI 만 옛 말을
 * 쓰게 되어 셋이 갈린다. 지금 대응은 이렇다:
 *
 * | 화면 | 코드 · CLI |
 * |---|---|
 * | vault 진단 | `hygiene` |
 * | 백링크 없음 | `orphan` · `--orphans` |
 * | 한눈에 보기 | `tableView` |
 *
 * `brokenLinks.ts`와 같은 부류다: 인덱스에 이미 있는 것만 읽고, 아무것도 쓰지 않으며,
 * 앱과 CLI가 **같은 함수**를 쓴다.
 *
 * ## ⚠️ 판단하지 않는다
 *
 * "합쳐라" · "지워라"가 아니라 **"이것들이 이렇게 생겼다 + 숫자"** 까지만 낸다. 되돌릴 수
 * 없는 실행은 `tag rename`이 맡고, 그건 미리보기 → 백업 → 롤백을 거친다.
 *
 * 감사 도구가 오탐을 섞어 권하기 시작하면 **목록 자체를 안 믿게 된다.** 그래서 판정을
 * 좁게 잡았다 — 뺀 것들(편집거리 오타 탐지 · 단수복수 · 계층 없는 태그)의 근거는
 * 계획 문서에 있다.
 *
 * ## ⚠️ 인덱스 빌드 경로에 넣지 않는다
 *
 * `brokenLinks`와 같은 이유다. 요청 시에만 계산한다 — 기동 경로에 순회를 얹으면
 * `buildIndexChunked`가 존재하는 이유를 갉아먹는다.
 */

/** 결정적 문자열 비교 — **UTF-16 코드 단위**. 로케일에 따라 순서가 갈리지 않게. */
const asc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ─── 고아 노트 ────────────────────────────────────────────────────────────────

export interface OrphanNote {
  path: string;
  /** 표시 이름 — `title` 우선, 없으면 파일 이름. */
  name: string;
  /**
   * 이 노트가 **내보내는** 링크 수(본문 ∪ 프론트매터, 중복 제거).
   *
   * ⚠️ 진입점 오탐을 새 개념 없이 가르는 수단이다. 허브(vault의 HOME 같은 것)는 들어오는
   * 링크가 없어도 **정상**이고, 그건 나가는 링크가 많다는 것으로 드러난다. 프론트매터
   * 표식이나 제외 설정을 새로 만들지 않는 대신 사람이 두 숫자를 보고 판단한다.
   */
  outgoing: number;
}

/**
 * 들어오는 링크가 없는 노트.
 *
 * **본문 위키링크와 프론트매터 교차참조를 둘 다 본다.** 한쪽만 보면 `related` ·
 * `amends` · `superseded_by`로만 걸린 노트를 고아로 오판한다.
 *
 * 백링크가 이 앱의 주된 이동 수단이므로, 들어오는 링크가 없는 노트는 사실상 닿을 수 없다.
 * 끊긴 링크 감사의 정확한 거울상이다.
 *
 * ## 정렬 — 나가는 링크가 적은 것부터
 *
 * ⚠️ 예전엔 경로 오름차순이었다. 그러면 이 vault 의 `HOME.md`(나가는 링크 **19개**)가
 * 목록 **맨 위**에 온다 — 진입점이라 아무도 안 가리키는 게 당연한 노트다. 매번 첫 줄이
 * "고쳐야 할 것 아님"이면 목록 전체를 덜 보게 된다.
 *
 * 나가는 링크가 적은 것이 **진짜 외딴 노트**다(양쪽 다 0이면 아무 데도 안 이어져 있다).
 * 그것을 위로 올린다.
 *
 * ⚠️ 동점은 여전히 **경로순**이다. 결정성이 없으면 같은 vault 가 매번 다른 답을 낸다.
 */
export function findOrphans(index: LinkIndex): OrphanNote[] {
  const out: OrphanNote[] = [];
  for (const info of index.byPath.values()) {
    const path = info.source_path;
    const viaBody = index.backlinks.get(path)?.size ?? 0;
    const viaFrontmatter = index.relations.incoming.get(path)?.length ?? 0;
    if (viaBody > 0 || viaFrontmatter > 0) continue;
    out.push({ path, name: info.title ?? info.source_name, outgoing: countOutgoing(index, info) });
  }
  out.sort((a, b) => a.outgoing - b.outgoing || asc(a.path, b.path));
  return out;
}

/**
 * 이 노트가 실제로 닿는 다른 노트의 수.
 *
 * ⚠️ 링크 **개수**가 아니라 **대상 노트 수**다. 같은 노트를 세 번 가리킨 문서가 세 곳과
 * 이어진 것처럼 보이면 허브 판별이 왜곡된다. 자기 자신도 세지 않는다.
 *
 * ⚠️ 해소되지 않는 링크는 세지 않는다 — 그건 끊긴 링크이고 `findBrokenLinks`의 몫이다.
 */
function countOutgoing(index: LinkIndex, info: LinkInfo): number {
  const reached = new Set<string>();
  for (const raw of info.targets) {
    const name = targetName(raw);
    if (!name) continue;
    const p = resolveTarget(name, index, info.source_path);
    if (p && p !== info.source_path) reached.add(p);
  }
  for (const r of index.relations.outgoing.get(info.source_path) ?? []) {
    if (r.path !== info.source_path) reached.add(r.path);
  }
  return reached.size;
}

// ─── 태그 위생 ────────────────────────────────────────────────────────────────

export type TagIssueKind = "same-leaf" | "case-only" | "near-universal";

export interface TagIssue {
  kind: TagIssueKind;
  /** 관련된 태그들과 각각의 노트 수. 경로처럼 **이름 오름차순**으로 고정한다. */
  tags: { tag: string; count: number }[];
}

/**
 * 태그를 몇 개의 노트가 쓰는지. 한 노트가 같은 태그를 두 번 적어도 한 번만 센다.
 */
function tagCounts(infos: readonly LinkInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const info of infos) {
    for (const tag of new Set(info.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** `a/b/c` → `c`. 계층이 없으면 태그 전체가 잎이다. */
const leafOf = (tag: string): string => tag.split("/").pop() ?? tag;

const toEntries = (counts: Map<string, number>, tags: string[]) =>
  tags.sort(asc).map((tag) => ({ tag, count: counts.get(tag) ?? 0 }));

export interface TagAuditOptions {
  /**
   * 이 비율 이상의 노트에 붙은 태그를 "필터로 무용"이라고 본다.
   *
   * ⚠️ 임의값이다. 이 판정만 성격이 다르다 — 중복이 아니라 **다른 종류의 신호**이고,
   * 셋 중 가장 약하다.
   */
  universalRatio?: number;
  /** 이보다 노트가 적으면 `near-universal`을 판정하지 않는다. 새 vault가 전부 걸린다. */
  minNotesForUniversal?: number;
}

/**
 * 태그 중복 후보.
 *
 * 판정 셋 — 실측에서 실제로 나온 것들이다:
 *
 * - **같은 잎, 다른 부모** (`class/silent-failure` ↔ `issue/silent-failure`).
 *   같은 개념을 두 분류축에 걸어둔 것.
 * - **대소문자만 다름.** `norm()`이 NFC만 하고 소문자로 접지 않으므로 실재할 수 있다.
 * - **거의 모든 노트에 붙은 태그.** 중복은 아니지만 필터로 쓸모가 없다.
 */
export function findTagIssues(
  infos: readonly LinkInfo[],
  opts: TagAuditOptions = {},
): TagIssue[] {
  const { universalRatio = 0.9, minNotesForUniversal = 5 } = opts;
  const counts = tagCounts(infos);
  const issues: TagIssue[] = [];

  // ⚠️ **대소문자를 먼저 본다.** `subject/CLI`와 `subject/cli`는 잎도 같아서 아래 판정에도
  // 걸리는데, 그렇게 보고하면 "부모가 다르다"는 틀린 라벨이 붙는다. 처방이 훨씬 분명한
  // 쪽(대소문자를 맞춰라)으로 낸다.
  const byFolded = new Map<string, string[]>();
  for (const tag of counts.keys()) {
    const k = tag.toLowerCase();
    (byFolded.get(k) ?? byFolded.set(k, []).get(k)!).push(tag);
  }
  const caseOnly = new Set<string>();
  for (const [, tags] of byFolded) {
    if (tags.length < 2) continue;
    issues.push({ kind: "case-only", tags: toEntries(counts, [...tags]) });
    for (const t of tags) caseOnly.add(t);
  }

  // 같은 잎, 다른 부모 — 계층이 없는 태그(`solo`)는 자기 자신뿐이라 걸리지 않는다.
  const byLeaf = new Map<string, string[]>();
  for (const tag of counts.keys()) {
    const leaf = leafOf(tag).toLowerCase();
    (byLeaf.get(leaf) ?? byLeaf.set(leaf, []).get(leaf)!).push(tag);
  }
  for (const [, tags] of byLeaf) {
    if (tags.length < 2) continue;
    // 대소문자로 이미 알린 조합은 두 번 알리지 않는다.
    if (tags.every((t) => caseOnly.has(t))) continue;
    issues.push({ kind: "same-leaf", tags: toEntries(counts, [...tags]) });
  }

  // 거의 모든 노트에 붙은 태그.
  if (infos.length >= minNotesForUniversal) {
    const threshold = infos.length * universalRatio;
    for (const [tag, count] of counts) {
      if (count >= threshold) issues.push({ kind: "near-universal", tags: [{ tag, count }] });
    }
  }

  // 결정성 — 종류 안에서는 첫 태그 이름순.
  const order: TagIssueKind[] = ["same-leaf", "case-only", "near-universal"];
  issues.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) || asc(a.tags[0].tag, b.tags[0].tag),
  );
  return issues;
}

// ─── frontmatter 위생 ─────────────────────────────────────────────────────────

export type FrontmatterIssueKind =
  | "case-only"
  | "plural"
  | "prefix"
  | "suffix"
  | "sparse";

export interface FrontmatterIssue {
  /** `doc_kind` · `topic` · props 필드 이름. */
  field: string;
  kind: FrontmatterIssueKind;
  /** 갈린 값들과 각각의 노트 수. 값 이름 오름차순. */
  values: { value: string; count: number }[];
  /**
   * `values` 를 자르기 전의 개수. 안 잘렸으면 없다.
   *
   * ⚠️ `sparse` 는 1회 값을 **전부** 담으면 벽이 된다 — 실측에서 `topic` 이 17줄이었다.
   * 열일곱 줄을 다 읽는 사람은 없고, 그러면 그 아래 진짜 갈림(`suffix`)까지 안 보인다.
   * 자르되 **자른 사실을 말한다** — 조용히 자르면 "이게 전부"로 읽힌다.
   */
  total?: number;
}

/** 한 묶음에 보여주는 값의 상한. */
export const ISSUE_VALUES_MAX = 8;

/**
 * props 필드를 **열거형으로 보는** 최소 노트 수.
 *
 * ⚠️ 이보다 적으면 갈렸는지 판단할 표본이 없다. 두 노트가 `A`/`a`를 쓴 것은 오타일 수도,
 * 아직 정하지 않은 것일 수도 있다 — 새 vault가 통째로 걸리는 것을 막는다.
 */
export const MIN_ENUM_NOTES = 5;

/**
 * props 필드가 열거형처럼 쓰이는가 — **값이 반복되는가**로 본다.
 *
 * ⚠️ **목록을 손으로 두지 않는다.** `title`·`description`처럼 노트마다 다른 필드를 이름으로
 * 거르려 하면, 새 필드가 생길 때마다 목록을 고쳐야 하고 안 고치면 조용히 시끄러워진다.
 * 모양으로 판단하면 필드 이름을 몰라도 된다: **쓰임 대비 값 종류가 적으면** 열거형이다.
 */
const ENUM_DISTINCT_RATIO = 0.5;

/** `plan` → `plans`·`planes`. 복수형 후보 둘. */
const pluralsOf = (v: string) => [`${v}s`, `${v}es`];

/**
 * `완료` 가 `완료 — #232` 의 접두사인가.
 *
 * ⚠️ **경계에서 끊겨야 한다.** `plan`이 `planning`의 접두사라고 보고하면 서로 다른 두
 * 낱말을 같다고 우기는 것이다. 다음 글자가 글자·숫자면 낱말이 이어지는 중이다.
 */
function isPrefixOf(short: string, long: string): boolean {
  if (short.length >= long.length || !long.startsWith(short)) return false;
  return !/[\p{L}\p{N}]/u.test(long[short.length]);
}

/**
 * `완료` 가 `구현 완료` 의 접미사인가.
 *
 * ⚠️ **이 방향이 빠져 있었다.** 2026-08-28 실측에서 `audit: props` 가 0건을 냈는데,
 * `status` 에 `완료`(10)와 `구현 완료`(1)가 같이 있었다. 한정어는 **앞에** 붙는 일이
 * 많아서(구현 완료 · 부분 완료) 접두사만 보면 실제 갈림의 절반을 놓친다.
 *
 * ⚠️ `isPrefixOf` 와 같은 경계 규칙이다 — 안 그러면 `완료`/`미완료` 처럼 **서로 다른
 * 낱말**을 갈린 값이라고 보고한다.
 */
function isSuffixOf(short: string, long: string): boolean {
  if (short.length >= long.length || !long.endsWith(short)) return false;
  return !/[\p{L}\p{N}]/u.test(long[long.length - short.length - 1]);
}

/**
 * `sparse` — 축이 **굳지 않았다**는 신호.
 *
 * 문자열로 안 걸리는 갈림이 있다. 실측된 `status` 는 **다섯 낱말이 전부 "끝났다"** 를
 * 뜻하는데, 그 사이에 공통 문자열이 없다(낱말 표는 `$lib/docStatus`).
 *
 * ⚠️ **동의어라고 말하지 않는다.** 그건 기계가 정할 수 없고, 이 기능의 원칙은
 * "판단하지 않는다"다. 대신 셀 수 있는 것만 말한다 — "여덟 종인데 다섯이 1회다".
 *
 * ⚠️ `docStatus` 가 생겼다고 이 판정이 바뀌지 않는다. 저쪽은 **사람이 선언한** 표이지
 * 기계가 추론한 것이 아니다. 감사는 지금도 추론하지 않는다.
 *
 * ⚠️ 건강한 축에 울리면 감사 전체를 안 믿게 된다. 그래서 문턱이 둘이다:
 * 1회 값이 **셋 이상**이고, 그 비율이 **절반 이상**일 때만.
 */
const SPARSE_MIN_SINGLETONS = 3;
const SPARSE_RATIO = 0.5;

/**
 * 감사에서 **이름으로** 빼는 필드.
 *
 * - `tags` — `findTagIssues`가 이미 본다. 두 목록에 같은 것이 나오면 둘 다 덜 믿게 된다
 * - `aliases` — 값이 이름이라 열거형이 아니다. 갈리는 게 정상이다
 * - `doc_kind`·`topic` — **타입 있는 필드로 이미 센다.** props 에도 있어서 두 번 세게 된다
 *
 * ⚠️ 목록이 이 둘로 끝나는 것이 요점이다. 나머지는 **모양으로** 거른다 — 목록이 자라기
 * 시작하면 그건 판정이 틀렸다는 신호지, 목록이 짧다는 신호가 아니다.
 */
const FM_AUDIT_SKIP = new Set([
  "tags",
  "aliases",
  // ⚠️ **타입 있는 필드는 props 에도 들어 있다.** Rust 가 frontmatter 의 모든 키를 담기
  //    때문이다. 아래에서 typed 로 이미 세므로 여기서 또 세면 **개수가 두 배**가 된다.
  //    실제 vault 에서 `todo 6 · todos 4` 로 나왔는데 진짜는 `3 · 2` 였다 — 어느 값이
  //    갈렸는지는 맞았지만 숫자가 거짓말이었다.
  "doc_kind",
  "topic",
]);

/** 필드 → 값 → 노트 수. 한 노트가 같은 값을 두 번 적어도 한 번만 센다. */
function fieldValueCounts(infos: readonly LinkInfo[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const bump = (field: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const m = out.get(field) ?? out.set(field, new Map()).get(field)!;
    m.set(v, (m.get(v) ?? 0) + 1);
  };
  for (const info of infos) {
    if (info.doc_kind) bump("doc_kind", info.doc_kind);
    if (info.topic) bump("topic", info.topic);
    for (const [field, values] of Object.entries(info.props ?? {})) {
      if (FM_AUDIT_SKIP.has(field.toLowerCase())) continue;
      const seen = new Set<string>();
      for (const value of values) {
        const v = value.trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        bump(field, v);
      }
    }
  }
  return out;
}

/**
 * **상호참조 필드**의 이름들 — `related: [feeds, feeds-settings]` 같은 것.
 *
 * ⚠️ 실측에서 이걸 안 빼니 목록의 절반이 `related`였다. `feeds`와 `feeds-excerpt-only`는
 * **서로 다른 문서**지 갈린 값이 아니다. 이름이 비슷한 것은 문서 제목의 자연스러운 성질이다.
 *
 * 목록으로 두지 않고 **인덱스에 묻는다** — 값이 노트로 해소되면 상호참조다. 새 필드가
 * 생겨도 저절로 맞는다.
 *
 * ⚠️ 값이 우연히 노트 이름과 같은 열거형 필드는 통째로 빠진다. 보수적인 쪽 —
 * 덜 보고할지언정 엉뚱한 것을 보고하지 않는다.
 */
function relationFields(index: LinkIndex): Set<string> {
  const out = new Set<string>();
  for (const rels of index.relations.outgoing.values()) {
    for (const r of rels) out.add(r.type);
  }
  return out;
}

/**
 * frontmatter 값이 갈린 곳.
 *
 * ## 왜 감사 계열의 다섯째인가
 *
 * 앞의 넷은 **링크 그래프**를 본다. 이건 **거를 수 있는 축**을 본다 — `doc_kind`로 거르는
 * 질의는 `todo`와 `todos`가 갈려 있으면 절반만 찾는다.
 *
 * ⚠️ **조용하다.** 질의가 에러를 내지 않고 **적게 찾는다.** 실측(89노트 vault)에서 지금
 * `doc_kind`에 `todo`/`todos`가 같이 있고 `status`는 12종으로 갈려 있다.
 *
 * ⚠️ 자유 서술을 오류라 부르지 않는다. `status: 완료 — #232`는 사람에게 유용하다.
 * 보고하는 것은 **"같은 접두사로 시작하는 값이 여럿"** 이라는 사실뿐이다.
 */
export function findFrontmatterIssues(index: LinkIndex): FrontmatterIssue[] {
  const byField = fieldValueCounts([...index.byPath.values()]);
  const issues: FrontmatterIssue[] = [];
  const crossRef = relationFields(index);

  for (const [field, counts] of byField) {
    if (crossRef.has(field)) continue;
    // `doc_kind`·`topic`은 항상 본다 — 질의로 거를 수 있는 축이라 갈리면 바로 답이 틀린다.
    if (field !== "doc_kind" && field !== "topic") {
      const used = [...counts.values()].reduce((n, c) => n + c, 0);
      if (used < MIN_ENUM_NOTES) continue;
      if (counts.size > used * ENUM_DISTINCT_RATIO) continue;
    }
    const values = [...counts.keys()].sort(asc);
    const entries = (vs: string[]) =>
      vs.sort(asc).map((value) => ({ value, count: counts.get(value) ?? 0 }));

    // ⚠️ 대소문자를 **먼저** 본다. `Todo`/`todo`는 복수 판정에도 걸릴 수 있는데,
    //    그렇게 보고하면 처방이 흐려진다. 태그 감사와 같은 순서다.
    const reported = new Set<string>();
    const byFolded = new Map<string, string[]>();
    for (const v of values) {
      const k = v.toLowerCase();
      (byFolded.get(k) ?? byFolded.set(k, []).get(k)!).push(v);
    }
    for (const [, vs] of byFolded) {
      if (vs.length < 2) continue;
      issues.push({ field, kind: "case-only", values: entries([...vs]) });
      for (const v of vs) reported.add(v);
    }

    const folded = new Set(values.map((v) => v.toLowerCase()));
    for (const v of values) {
      if (reported.has(v)) continue;
      const lower = v.toLowerCase();
      for (const p of pluralsOf(lower)) {
        if (!folded.has(p)) continue;
        const other = values.find((x) => x.toLowerCase() === p);
        if (!other || reported.has(other)) continue;
        issues.push({ field, kind: "plural", values: entries([v, other]) });
        reported.add(v);
        reported.add(other);
      }
    }

    for (const short of values) {
      const longer = values.filter((v) => isPrefixOf(short, v));
      if (longer.length === 0) continue;
      issues.push({ field, kind: "prefix", values: entries([short, ...longer]) });
    }

    // ⚠️ 접두사 다음에 본다. 같은 쌍이 양쪽에 걸리는 일은 없다 — 한 값이 다른 값의
    //    접두사이면서 동시에 접미사일 수는 없기 때문이다(길이가 같아야 하는데 그건 배제된다).
    for (const short of values) {
      const longer = values.filter((v) => isSuffixOf(short, v));
      if (longer.length === 0) continue;
      issues.push({ field, kind: "suffix", values: entries([short, ...longer]) });
    }

    // 축이 굳지 않았다 — 위 넷 중 아무것도 안 걸려도 이건 걸릴 수 있다.
    const singletons = values.filter((v) => counts.get(v) === 1);
    if (
      singletons.length >= SPARSE_MIN_SINGLETONS &&
      singletons.length >= values.length * SPARSE_RATIO
    ) {
      const all = entries([...singletons]);
      issues.push({
        field,
        kind: "sparse",
        values: all.slice(0, ISSUE_VALUES_MAX),
        ...(all.length > ISSUE_VALUES_MAX ? { total: all.length } : {}),
      });
    }
  }

  const order: FrontmatterIssueKind[] = ["case-only", "plural", "prefix", "suffix", "sparse"];
  return issues.sort(
    (a, b) =>
      asc(a.field, b.field) ||
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      asc(a.values[0].value, b.values[0].value),
  );
}

// ─── 모호한 이름 ──────────────────────────────────────────────────────────────

export interface AmbiguousName {
  /** 소문자 정규형 — 해소기가 쓰는 키 그대로다. */
  name: string;
  paths: string[];
}

/**
 * 같은 이름으로 해소되는 노트가 둘 이상인 것.
 *
 * ⚠️ 해소 규칙이 고쳐진 뒤에도(#220) **충돌 자체는 남는다.** 문서 안의 링크는 가장 가까운
 * 것으로 가지만, 사람이 `lapis open`에 그 이름을 주면 거부된다 — 맥락이 없어 추측할 수
 * 없기 때문이다. 어느 이름이 그런지 알아야 이름을 바꾸든 경로로 부르든 할 수 있다.
 */
export function findAmbiguousNames(index: LinkIndex): AmbiguousName[] {
  const out: AmbiguousName[] = [];
  for (const [name, paths] of index.resolver) {
    if (paths.length < 2) continue;
    out.push({ name, paths: [...paths].sort(asc) });
  }
  out.sort((a, b) => asc(a.name, b.name));
  return out;
}

// ─── 링크 안 걸린 언급 ────────────────────────────────────────────────────────

/**
 * 이 길이 미만의 이름은 제안하지 않는다.
 *
 * ⚠️ 두 글자 이름(`설계` · `구조`)은 거의 모든 문서에 걸린다. **목록이 시끄러우면 아무도
 * 안 보고**, 그러면 이 기능이 있는 의미가 없다. 조사한 사례에서 알려진 약점이 정확히
 * 이 오탐이었다.
 */
export const MIN_MENTION_LENGTH = 3;

export interface MentionSource {
  path: string;
  name: string;
  /** 1-based. 그 노트에서 **처음** 나온 줄. */
  line: number;
  /** 그 줄. 길면 잘린다. */
  preview: string;
  /** 그 노트 안에서 몇 번 말했나. */
  count: number;
}

export interface UnlinkedMention {
  /** 언급된 이름(해소된 노트의 이름 · 제목 · alias 중 실제로 쓰인 것). */
  name: string;
  /** 그 이름이 가리키는 노트. */
  target: string;
  sources: MentionSource[];
  /** 전 vault 통틀어 몇 번. */
  total: number;
}

/** 미리보기 상한 — 목록이 가로로 터지지 않게. */
const PREVIEW_MAX = 120;

/**
 * 본문에서 **코드·frontmatter·이미 걸린 링크**를 지운 사본을 만든다.
 *
 * ⚠️ 잘라내지 않고 **같은 길이의 공백으로 덮는다.** 길이가 변하면 줄 번호와 오프셋이
 * 어긋나서, 찾은 자리를 사용자에게 보여줄 때 엉뚱한 줄을 가리킨다.
 *
 * ⚠️ **길이 보존이 조용히 깨지는 종류의 계약이라 밖으로 낸다.** 길이가 어긋나도 예외는
 * 안 나고, 결과는 그럴듯한 줄 번호를 단 채 틀린다. 직접 겨냥한 테스트가 있어야 한다.
 */
/**
 * 코드와 메타만 덮는다 — **문법이 실제로 쓰였나**를 셀 때 쓰는 조각.
 *
 * 🔴 `maskNonProse` 와 갈라 둔 이유가 있다. 저쪽은 **이미 걸린 링크까지** 덮는데,
 * 그건 "안 걸린 언급"을 찾는 데 필요한 것이지 문법 수요를 셀 때는 **세려는 것을 지운다.**
 * 실제로 그렇게 재서 위키링크가 0건으로 나왔다.
 *
 * 이쪽만 쓰면 코퍼스 측정이 `$lib/codeLines` 라는 같은 주인을 쓰면서도 링크를 셀 수 있다.
 */
export function maskCodeAndMeta(body: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  let out = body;

  // frontmatter — `title: 캐시 계약`이 자기 언급으로 잡히면 모든 노트가 자기를 언급한 게 된다.
  out = out.replace(/^---\n[\s\S]*?\n---/, blank);
  // 코드 블록(fence · 들여쓰기) — 판정은 `$lib/codeLines` 가 한다.
  //
  // ⚠️ 예전엔 여기 정규식이 있었고 **`~~~` 펜스와 들여쓴 코드블록을 놓쳤다.**
  //    그 안의 낱말이 "안 걸린 언급"으로 보고됐다 — 오탐을 섞으면 목록을 안 믿게 된다.
  out = blankCodeBlocks(out);
  // 인라인 코드
  out = out.replace(/`[^`\n]*`/g, blank);
  return out;
}

export function maskNonProse(body: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  let out = maskCodeAndMeta(body);

  // ⚠️ **본문 첫 h1은 그 노트 자신의 이름이다.** 다른 노트의 제목과 같은 낱말이어도
  //    그건 남을 말한 게 아니라 자기를 말한 것이다.
  //
  //    실측: slate 의 `autonomous-loop` 은 frontmatter title 이 다른데 h1 이 lapis 쪽
  //    title 과 같아서, 자기 제목 줄이 "lapis 문서를 언급했다"로 보고됐다. frontmatter 를
  //    덮는 것과 같은 이유다 — `title:` 과 h1 은 같은 것의 두 표기다.
  out = out.replace(/^# [^\n]*/m, blank);
  // 이미 걸린 링크 — 위키링크와 마크다운 링크의 **표시 텍스트까지** 덮는다.
  out = out.replace(/\[\[[^\]\n]*\]\]/g, blank);
  out = out.replace(/\[[^\]\n]*\]\([^)\n]*\)/g, blank);
  return out;
}

/**
 * 그 노트가 **이미** 대상으로 연결돼 있나 — 본문 링크든 frontmatter 관계든.
 *
 * ## ⚠️ 실측으로 찾은 가장 큰 남은 오탐원
 *
 * 이 규칙을 넣기 전 실제 vault에서 나온 5건 중 **3건이 여기 걸렸다.** 전부 같은 모양이었다:
 *
 * ```md
 * - [[STATE]] — Lapis 진행 상태
 * ```
 *
 * 링크는 파일 이름으로 걸고 **설명은 제목으로** 쓴 줄이다. 링크된 자리는 이미 덮이지만
 * 바로 옆의 제목은 안 덮여서, 이미 가리키고 있는 노트를 '안 가리킨다'고 보고했다.
 *
 * 줄 단위로 볼 수도 있었지만 노트 단위로 본다. 이 감사가 찾는 것은 **없는 간선**이고,
 * 간선이 이미 있으면 어느 줄에서 다시 말하든 그래프는 이어져 있다.
 */
function alreadyLinks(index: LinkIndex, from: string, to: string): boolean {
  if (index.backlinks.get(to)?.has(from)) return true;
  // frontmatter `related:` 등은 backlinks가 아니라 relations가 담당한다(Phase A-2).
  // 선언한 관계도 연결이다 — 여기서 빼면 관계를 적어 둔 노트가 계속 걸린다.
  return (index.relations.incoming.get(to) ?? []).some((r) => r.path === from);
}

/** 정규식 메타문자 이스케이프. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 링크는 안 걸렸는데 다른 노트의 이름을 말한 곳.
 *
 * ## 왜 감사 계열의 네 번째인가
 *
 * 끊긴 링크는 "가리켰는데 없다", 고아는 "아무도 안 가리킨다"다. 이건 **"말했는데 안
 * 가리킨다"** — 같은 그래프를 세 번째 각도에서 보는 것이다.
 *
 * ## ⚠️ 오탐을 막는 것이 이 함수의 전부다
 *
 * 조사한 사례(Obsidian)의 알려진 약점이 오탐이었다 — 제목 정확 일치로 잡으면 큰 vault에서
 * 무관한 제안이 쏟아진다. 목록이 시끄러우면 아무도 안 본다.
 *
 * 거르는 것: **모호한 이름**(#220과 같은 규칙) · 짧은 이름 · 자기 자신 · 이미 링크된 자리 ·
 * **이미 그 노트로 연결된 출처** · 코드 · frontmatter · 단어 경계 밖.
 *
 * ## ⚠️ 한국어 조사는 못 잡는다
 *
 * 단어 경계 규칙이 `캐시 계약을`을 안 잡는다. 알고 넘어가는 한계다 — 놓침은 조용하지만
 * 해롭지 않고, 조사 목록은 손으로 유지하는 사전이다. 근거와 측정은 계획서 참조.
 *
 * ## 성능
 *
 * ⚠️ 이름마다 본문을 훑지 **않는다.** 이름 전부를 하나의 교대 정규식으로 합쳐 본문을 한 번만
 * 지난다. 이름이 N개일 때 N번 훑으면 큰 vault에서 못 쓴다.
 */
export function findUnlinkedMentions(
  index: LinkIndex,
  bodies: ReadonlyMap<string, string>,
): UnlinkedMention[] {
  // 후보 이름 → 대상 경로. 모호한 이름과 짧은 이름은 여기서 이미 뺀다.
  const nameToPath = new Map<string, string>();
  for (const [key, paths] of index.resolver) {
    if (paths.length !== 1) continue; // 모호 — #220과 같은 규칙
    if (key.length < MIN_MENTION_LENGTH) continue;
    nameToPath.set(key, paths[0]);
  }
  if (nameToPath.size === 0) return [];

  // ⚠️ **긴 이름 먼저.** 정규식 교대는 왼쪽 우선이라, `검색`이 앞에 있으면
  //    `검색 캐시 계약`이 영영 안 잡힌다.
  const names = [...nameToPath.keys()].sort((a, b) => b.length - a.length || asc(a, b));
  // ⚠️ **`\b`를 쓰면 한국어가 통째로 안 잡힌다.** JS의 `\b`는 `u` 플래그를 줘도
  //    `\w`(= `[A-Za-z0-9_]`) 기준이라 한글은 단어 문자가 아니다. 그래서 `캐시 계약`
  //    앞뒤 어디에도 경계가 안 생기고 매치가 0이 된다(Rust `regex`는 유니코드 인식이라
  //    다르게 동작한다 — 언어마다 같은 기호의 뜻이 다르다).
  //
  //    글자 부류를 직접 적어 전후를 본다. 이러면:
  //      `한글날` 안의 `한글`   → 뒤가 글자라 안 잡힌다 (의도)
  //      `캐시 계약 을`        → 뒤가 공백이라 잡힌다
  //      `캐시 계약을`         → 뒤가 글자라 안 잡힌다 (알려진 한계 — 조사)
  const W = "\\p{L}\\p{N}_";
  const re = new RegExp(
    `(?<![${W}])(?:${names.map(escapeRe).join("|")})(?![${W}])`,
    "giu",
  );

  /** target → name → source path → 집계 */
  const acc = new Map<string, Map<string, Map<string, MentionSource>>>();

  for (const [path, body] of bodies) {
    const prose = maskNonProse(body);
    // 줄 번호는 오프셋으로 센다 — 마스킹이 길이를 보존하므로 원본과 같다.
    const lineStarts: number[] = [0];
    for (let i = 0; i < body.length; i++) if (body[i] === "\n") lineStarts.push(i + 1);
    const lineOf = (off: number) => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (lineStarts[mid] <= off) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prose)) !== null) {
      const key = m[0].toLowerCase();
      const target = nameToPath.get(key);
      // 대소문자 차이로 키가 안 맞을 수 있다 — 사전에 없으면 건너뛴다.
      if (!target) continue;
      if (target === path) continue; // 자기 이름은 언급이 아니다
      if (alreadyLinks(index, path, target)) continue;

      const byName = acc.get(target) ?? new Map();
      acc.set(target, byName);
      const bySrc = byName.get(key) ?? new Map();
      byName.set(key, bySrc);

      const prev = bySrc.get(path);
      if (prev) {
        prev.count++;
      } else {
        const li = lineOf(m.index);
        const raw = body.slice(lineStarts[li], lineStarts[li + 1] ?? body.length);
        bySrc.set(path, {
          path,
          name: index.byPath.get(path)?.source_name ?? path,
          line: li + 1,
          preview: raw.trim().slice(0, PREVIEW_MAX),
          count: 1,
        });
      }
    }
  }

  const out: UnlinkedMention[] = [];
  for (const [target, byName] of acc) {
    for (const [key, bySrc] of byName) {
      const sources = [...bySrc.values()].sort((a, b) => asc(a.path, b.path));
      out.push({
        // 표시는 인덱스가 아는 실제 이름으로 — 소문자 키를 그대로 보여주면 어색하다.
        name: displayName(index, target, key),
        target,
        sources,
        total: sources.reduce((n, s) => n + s.count, 0),
      });
    }
  }
  return out.sort((a, b) => asc(a.name, b.name) || asc(a.target, b.target));
}

/** 소문자 키에 대응하는 **원래 표기**를 찾는다. 없으면 키 그대로. */
function displayName(index: LinkIndex, target: string, key: string): string {
  const info = index.byPath.get(target);
  if (!info) return key;
  for (const cand of [info.title, ...(info.aliases ?? []), info.source_name]) {
    if (cand && cand.toLowerCase() === key) return cand;
  }
  return key;
}


// ─── 지식 부패 ────────────────────────────────────────────────────────────────

export interface DecayedNote {
  path: string;
  /** 표시 이름 — `title` 우선, 없으면 파일 이름. `OrphanNote` 와 같은 규칙. */
  name: string;
  /**
   * 노트에 **적힌 그대로**의 `status`.
   *
   * ⚠️ 갈래(`done`)로 바꿔 내지 않는다. 사람은 자기가 쓴 낱말로 노트를 찾는다 —
   * 자기가 쓴 낱말 대신 목록에서 `done` 을 보면 자기 노트인지 알아보지 못한다.
   */
  status: string;
  /** 남은 미완 개수. */
  open: number;
}

/**
 * **한 노트가 자기 자신과 어긋난 것** — 프론트매터는 끝났다는데 본문에 `- [ ]` 가 남았다.
 *
 * ## ⚠️ 이것도 판단하지 않는다
 *
 * 위 `sparse` 주석의 *"동의어라고 말하지 않는다 — 기계가 정할 수 없다"* 는 그대로 산다.
 * 저건 **두 노트(또는 두 값) 사이**를 이어붙이는 추론 이야기다. 여기는 한 노트 안이라
 * 이어붙일 게 없다 — 둘 다 그 노트가 스스로 적은 것이고, 세면 나온다.
 *
 * 어떤 낱말이 "끝났다"인지는 **사람이 `docStatus` 에 선언**했다. 이 감사는 그 표를
 * 읽을 뿐 늘리지 않는다.
 *
 * ## 🔴 왜 만들었나 (2026-08-30)
 *
 * `todos/mcp-gate-issues-20260827.md` 가 끝났다는 `status` 를 단 채 미체크 12개를 달고 있었다.
 * 그 안의 낡은 숫자를 믿고 **같은 날 두 번 잘못 쟀다.** 닫힌 문서에 열린 표시가 남으면
 * 다음 사람이 다 된 일을 다시 한다.
 *
 * ⚠️ 그 한 건을 고쳤으므로 **지금 이 vault 에서는 0건이다.** 성과가 아니라 보험이다.
 *
 * ## ⚠️ 안 잡는 것
 *
 * - **`status` 가 없는 노트** — 실측에서 미완이 있는 노트 넷이 전부 이 경우다.
 *   `manual-test-checklist.md` 는 68건이 **설계대로** 영원히 미체크다.
 * - **모르는 `status`** — `statusLifecycle` 이 `null` 을 내면 넘어간다. 추측하지 않는다.
 * - 날짜로 본 낡음 — 임계값을 정하는 순간 그게 판단이다.
 *
 * ## ⚠️ 본문을 읽는다
 *
 * `groups` 는 부르는 쪽이 이미 만든 것을 받는다(`collectOpenTasks`). 여기서 다시 읽으면
 * `tasks` 감사와 나란히 부를 때 vault 를 두 번 훑는다.
 */
export function findDecayedNotes(
  index: LinkIndex,
  groups: readonly OpenTaskGroup[],
): DecayedNote[] {
  const out: DecayedNote[] = [];
  for (const g of groups) {
    if (g.open.length === 0) continue;
    const info = index.byPath.get(g.path);
    if (!info) continue;
    const written = info.props?.status?.[0];
    if (!written || statusLifecycle(written) !== "done") continue;
    out.push({
      path: g.path,
      name: info.title ?? info.source_name,
      status: written,
      open: g.open.length,
    });
  }
  // 많이 남은 것부터. 동점은 경로 순 — 같은 입력에 같은 답이 나와야 한다.
  return out.sort((a, b) => b.open - a.open || asc(a.path, b.path));
}
