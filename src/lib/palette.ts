import { hangulToQwerty } from "$lib/imeSwap";
import { get } from "svelte/store";
import { chosungOf, isChosungQuery } from "$lib/hangul";
import {
  fuzzyMatch,
  searchQuickIncremental,
  searchFullTextRanked,
  buildContentSnippet,
  type QuickEntry,
} from "$lib/searchIndex";
import { quickEntries, fullTextIndexReady } from "$lib/stores/search";
import { tagIndex } from "$lib/stores/tags";
import { type TagIndex } from "$lib/tagIndex";
import { docKindCounts, topicCounts } from "$lib/stores/filters";
import { matchCommands, BUILTIN_COMMANDS, type Command } from "$lib/commands";
import { recentNotePaths, RECENT_DISPLAY } from "$lib/stores/recent";
import { noteMtimes } from "$lib/stores/mtimes";
import { linkIndex } from "$lib/stores/vault";
import { recencyAxis } from "$lib/stores/palette";
import { parseFrontmatterDate } from "$lib/recency";
import { scopeOptions, type ScopeOption } from "$lib/folderScope";

/**
 * 팔레트 모드.
 * - "all"      : prefix 없음. 모든 그룹 통합.
 * - "command"  : `>` 명령만.
 * - "tag"      : `#` 태그만.
 * - "facet"    : `:` doc_kind / topic 만.
 * - "files"    : Cmd+P 호환. NOTES 그룹만.
 * - "fulltext" : Cmd+Shift+F 호환. CONTENT 그룹만.
 */
export type PaletteMode = "all" | "command" | "tag" | "facet" | "files" | "fulltext";

/**
 * `Tab` 이 도는 모드. **접두사로만 들어가는 `tag`·`facet` 은 여기 없다** — 그 둘은
 * `#`/`:` 를 치면 바로 가는 곳이라 순환에 넣으면 같은 자리를 두 경로로 들르게 된다.
 */
export const CYCLE_MODES = ["all", "files", "fulltext", "command"] as const;

/**
 * 다음(또는 이전) 모드.
 *
 * ⚠️ 순환 밖(`tag`·`facet`)에서는 **`all` 에 있었던 것처럼** 움직인다. 그냥 두면
 * `Tab` 이 죽은 키가 되는데, 죽은 키는 고장과 구별이 안 된다.
 */
export function cycleMode(current: PaletteMode, dir: 1 | -1): PaletteMode {
  const at = (CYCLE_MODES as readonly PaletteMode[]).indexOf(current);
  const from = at < 0 ? 0 : at;
  const n = CYCLE_MODES.length;
  return CYCLE_MODES[(from + dir + n) % n];
}

export type PaletteEntry =
  | { kind: "note"; path: string; label: string; subtitle?: string }
  | { kind: "content"; path: string; name: string; snippet: string }
  | { kind: "tag"; key: string; display: string; mode: "leaf" | "prefix"; count: number }
  | { kind: "facet"; field: "doc_kind" | "topic"; value: string; count: number }
  /**
   * `strong` — 질의가 라벨의 **어느 단어의 접두사**인가. `isStrongCommandMatch` 참조.
   *
   * ⚠️ 매칭 시점에 정해서 들고 다닌다. `groupResults`가 질의를 안 받기 때문이다 —
   * 거기서 다시 판정하려면 질의를 인자로 흘려야 하고, 그러면 판정이 두 곳이 된다.
   */
  | { kind: "command"; command: Command; strong: boolean }
  | { kind: "recent"; path: string; label: string; subtitle?: string }
  /**
   * **최근 바뀐** 노트 — `recent`(최근 **연** 노트)와 다른 축이다.
   *
   * ⚠️ 둘을 한 그룹에 섞으면 안 된다. "내가 연 것"과 "바깥에서 바뀐 것"은 서로 다른
   * 질문에 답한다. 편집기·git·다른 도구가 쓴 변경은 `recent`에 절대 안 들어온다.
   */
  | { kind: "changed"; path: string; label: string; subtitle?: string; mtimeMs: number };

export interface PaletteResult {
  entry: PaletteEntry;
  score: number;
  /** 평범한 매칭이 0건이라 굴절을 접어 찾았다. 화면이 그렇다고 말해야 한다. */
  via?: "stem";
}

export interface ParsedInput {
  mode: PaletteMode;
  query: string;
}

/** raw 입력 + 호환 모드 → 실제 사용할 mode와 query. */
export function parseInput(raw: string, hint: PaletteMode = "all"): ParsedInput {
  // hint가 "files"/"fulltext"면 prefix 무시하고 그 모드 유지 (Cmd+P/Cmd+Shift+F 호환)
  if (hint === "files" || hint === "fulltext") {
    return { mode: hint, query: raw.trim() };
  }
  /**
   * ⚠️ 명령 모드도 힌트를 존중해야 한다. 3.0 의 `Tab` 순환이 접두사 없이 이 모드로
   * 보내기 때문이다 — 여기서 빠지면 `Tab` 을 눌러도 **아무 일도 안 일어난다.**
   * 사용자가 `>` 를 또 쳤을 때 그 글자가 질의에 남지 않도록 한 번 벗긴다.
   */
  if (hint === "command") {
    const q = raw.trim();
    return { mode: "command", query: (q.startsWith(">") ? q.slice(1) : q).trim() };
  }
  if (raw.startsWith(">")) return { mode: "command", query: raw.slice(1).trim() };
  if (raw.startsWith("#")) return { mode: "tag", query: raw.slice(1).trim() };
  if (raw.startsWith(":")) return { mode: "facet", query: raw.slice(1).trim() };
  return { mode: "all", query: raw.trim() };
}

/**
 * kind별 raw 점수를 정규화. 각 검색 엔진의 점수 분포가 매우 다르므로 비교 가능한 단위로.
 * - file fuzzyMatch    : 100-1000
 * - command fuzzyMatch : 100-1000 (약간 우대)
 * - tag fuzzyMatch     : 100-1000 (약간 감점)
 * - facet              : 정확 매칭만 → 고정 700
 * - content MiniSearch : 1-20 정도 → ×60 으로 0-1200
 */
export function normalizedScore(kind: PaletteEntry["kind"], raw: number): number {
  switch (kind) {
    case "note":
      return raw;
    case "command":
      return raw * 1.2;
    case "tag":
      return raw * 0.85;
    case "facet":
      return 700;
    case "content":
      return raw * 60;
    case "recent":
      // Recent는 항상 빈 입력 흐름에서만 등장 — 그룹 안에서의 정렬만 유지하면 됨
      return raw;
    case "changed":
      // 같은 이유. 그룹 안 순서는 mtime 내림차순으로 이미 정해져 들어온다.
      return raw;
  }
}

/**
 * `fulltext` 모드에서 함께 낼 구조 팔 항목 수. `all` 모드(20)보다 **작게 잡는다** —
 * 여기서 사용자는 풀텍스트를 요청했고, 구조 팔은 "이쪽도 있다"는 대안 제시다.
 * 20개가 content 밑에 붙으면 대안이 아니라 두 번째 목록이 된다.
 */
const FULLTEXT_STRUCTURAL_LIMIT = 8;

function matchTags(query: string, index: TagIndex | null, limit = 20): PaletteResult[] {
  if (!index) return [];
  const q = query.trim();
  const out: PaletteResult[] = [];

  // leaf 태그
  for (const key of index.sortedTags) {
    const display = index.display.get(key) ?? key;
    const count = index.counts.get(key) ?? 0;
    if (!q) {
      out.push({
        entry: { kind: "tag", key, display, mode: "leaf", count },
        score: normalizedScore("tag", 0),
      });
    } else {
      const s = fuzzyMatch(q, key);
      if (s !== null) {
        out.push({
          entry: { kind: "tag", key, display, mode: "leaf", count },
          score: normalizedScore("tag", s),
        });
      }
    }
  }

  // prefix 태그 — 같은 키가 leaf로 이미 들어갔으면 skip
  const seen = new Set(out.map((r) => (r.entry as { key: string }).key));
  for (const key of index.rootPrefixes) {
    if (seen.has(key)) continue;
    const display = index.display.get(key) ?? key;
    const count = index.prefixCounts.get(key) ?? 0;
    if (!q) {
      out.push({
        entry: { kind: "tag", key, display, mode: "prefix", count },
        score: normalizedScore("tag", 0),
      });
    } else {
      const s = fuzzyMatch(q, key);
      if (s !== null) {
        out.push({
          entry: { kind: "tag", key, display, mode: "prefix", count },
          score: normalizedScore("tag", s),
        });
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function matchFacets(query: string, limit = 20): PaletteResult[] {
  const q = query.trim().toLowerCase();
  const out: PaletteResult[] = [];

  const docKinds = get(docKindCounts);
  const topics = get(topicCounts);

  function consider(field: "doc_kind" | "topic", value: string, count: number) {
    if (!q) {
      out.push({
        entry: { kind: "facet", field, value, count },
        score: normalizedScore("facet", 0),
      });
      return;
    }
    if (value.toLowerCase().includes(q)) {
      out.push({
        entry: { kind: "facet", field, value, count },
        score: normalizedScore("facet", 0),
      });
    }
  }

  for (const [value, count] of docKinds) consider("doc_kind", value, count);
  for (const [value, count] of topics) consider("topic", value, count);

  // 정확 매칭이 부분 매칭보다 위로 — 시작·완전 매칭에 보너스
  out.sort((a, b) => {
    const va = (a.entry as { value: string }).value.toLowerCase();
    const vb = (b.entry as { value: string }).value.toLowerCase();
    const ea = va === q ? 2 : va.startsWith(q) ? 1 : 0;
    const eb = vb === q ? 2 : vb.startsWith(q) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    return (b.entry as { count: number }).count - (a.entry as { count: number }).count;
  });
  return out.slice(0, limit);
}

function matchFiles(query: string, entries: QuickEntry[], limit = 20): PaletteResult[] {
  const hits = searchQuickIncremental(query, entries, limit);
  return hits.map((h) => ({
    entry: {
      kind: "note",
      path: h.entry.path,
      label: h.entry.primaryLabel,
      subtitle:
        h.matchedKey !== h.entry.primaryLabel
          ? `alias: ${h.matchedKey}${h.entry.parentPath ? " · " + h.entry.parentPath : ""}`
          : h.entry.parentPath || undefined,
    },
    score: normalizedScore("note", h.score),
    via: h.via,
  }));
}

async function matchContent(query: string, limit = 20): Promise<PaletteResult[]> {
  if (!query.trim()) return [];
  if (!get(fullTextIndexReady)) return []; // worker 인덱스가 아직 빌드 중 — CommandPalette UI에 안내
  // 랭킹만(저비용). snippet은 표시 대상에만 fillContentSnippets로 지연 생성 — dedupe·컷으로
  // 탈락하는 hit에 readNote(디스크 IO) 낭비 방지.
  const hits = await searchFullTextRanked(query, limit);
  return hits.map((h) => ({
    entry: { kind: "content", path: h.path, name: h.name, snippet: "" },
    score: normalizedScore("content", h.score),
  }));
}

/** content 결과에 스니펫을 채운다(readNote × content 건수). 최종 표시 집합에만 호출. */
async function fillContentSnippets(results: PaletteResult[], query: string): Promise<void> {
  await Promise.all(
    results.map(async (r) => {
      if (r.entry.kind === "content") {
        r.entry.snippet = await buildContentSnippet(r.entry.path, query);
      }
    }),
  );
}

/**
 * 질의가 명령 라벨을 **강하게** 맞췄나 — 라벨 전체나 라벨 안 어느 단어의 접두사일 때.
 *
 * ## 왜 접두사인가
 *
 * 이 판정의 목적은 **명령을 목록 위로 올릴지** 정하는 것이다. 조건이 헐거우면 노트를
 * 찾는 흔한 흐름에 명령이 계속 끼어들어, 고치려던 것보다 나빠진다.
 *
 * 퍼지 매칭(`fuzzyMatch`)은 `vlt` → `vault`처럼 흩어진 글자도 잡는다. 그건 목록 아래에서
 * 찾아주기엔 좋지만 **맨 위로 올릴 근거로는 약하다.** 접두사는 사용자가 이름을 알고
 * 치기 시작했다는 뜻이라 훨씬 강한 신호다.
 *
 * ⚠️ 소문자화만 한다. `norm()`은 태그용(NFC 정규화)이라 여기 쓰지 않는다.
 */
export function isStrongCommandMatch(query: string, label: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (prefixesAWord(q, label.toLowerCase())) return true;

  /**
   * 🔴 **초성도 승격 대상이다.**
   *
   * 찾히기만 하고 맨 아래 그룹에 있으면 반쪽이다 — `GROUP_ORDER` 에서 `commands` 는
   * 본문 검색 결과보다 **뒤**다. 초성으로 친 사람도 명령을 먼저 봐야 한다.
   */
  if (!isChosungQuery(q)) return false;
  const folded = chosungOf(label);
  if (prefixesAWord(q, folded)) return true;
  // ⚠️ 낱말을 가로지르는 초성 — `ㅅㄴㅌ` 이 `새 노트` 를 가리킨다.
  return folded.replace(/\s+/g, "").startsWith(q);
}

/** 질의가 라벨 전체 또는 **어느 낱말의 접두**인가. */
function prefixesAWord(q: string, l: string): boolean {
  if (l.startsWith(q)) return true;
  // 구분자는 공백과 흔한 구두점 — 라벨이 `vault 진단 (…)` 꼴이다.
  for (const word of l.split(/[\s(){}[\]·,./|—-]+/)) {
    if (word && word.startsWith(q)) return true;
  }
  return false;
}

function commandsAsResults(query: string, limit = 20): PaletteResult[] {
  const hits = matchCommands(query, limit);
  return hits.map((h) => ({
    entry: {
      kind: "command" as const,
      command: h.command,
      strong: isStrongCommandMatch(query, h.command.label),
    },
    score: normalizedScore("command", h.score),
  }));
}

/**
 * Recent 노트 결과. 현재 vault에 존재하지 않는 path는 자동 필터.
 * 점수는 단순 역순 인덱스 — 최근일수록 큰 값. 그룹 안에서 정렬을 유지한다.
 */
function recentAsResults(limit: number = RECENT_DISPLAY): PaletteResult[] {
  const paths = get(recentNotePaths);
  if (paths.length === 0) return [];
  const entries = get(quickEntries);
  const byPath = new Map(entries.map((e) => [e.path, e]));

  const out: PaletteResult[] = [];
  for (const path of paths) {
    if (out.length >= limit) break;
    const qe = byPath.get(path);
    if (!qe) continue; // vault에 없는 path는 표시 안 함
    out.push({
      entry: {
        kind: "recent",
        path: qe.path,
        label: qe.primaryLabel,
        subtitle: qe.parentPath || undefined,
      },
      score: normalizedScore("recent", paths.length - paths.indexOf(path)),
    });
  }
  return out;
}

/**
 * 최근 **바뀐** 노트 — mtime 내림차순.
 *
 * ⚠️ `recentAsResults`(최근 **연** 노트)와 다른 축이다. 밖에서 쓴 변경(편집기 · git ·
 * 다른 도구)은 열람 이력에 절대 안 남으므로, 그 목록만으로는 "무엇이 바뀌었나"를 알
 * 방법이 없다. README가 전제하듯 **vault를 쓰는 건 Lapis가 아니라 바깥 도구들**이다.
 *
 * ⚠️ 동률 타이브레이크는 경로 오름차순이다. 큰 vault에서 같은 초에 여러 파일이 쓰이는
 * 일은 흔하고(git checkout이면 **전부** 같다), 그때 순서가 흔들리면 목록이 매번 다르게
 * 보인다. 그 규율은 `$lib/recency`와 같다.
 */
function changedAsResults(limit: number = RECENT_DISPLAY): PaletteResult[] {
  const axis = get(recencyAxis);
  const times = get(noteMtimes);
  const entries = get(quickEntries);

  /**
   * ⚠️ `date` 축은 **frontmatter 를 적은 노트만** 대상이다. mtime 은 모든 파일에 있지만
   * `date` 는 없을 수 있고, 없는 노트를 0으로 두면 목록 맨 뒤에 몰려 뜻이 없어진다 —
   * **뺀다.**
   *
   * `parseFrontmatterDate` 는 CLI·MCP 가 `--by date` 에 쓰는 **같은 함수**다. 여기서
   * 따로 파싱하면 같은 노트가 표면마다 다른 날짜를 갖는다.
   */
  const timeOf = (path: string): number | undefined => {
    if (axis === "mtime") return times.get(path);
    const raw = get(linkIndex)?.byPath.get(path)?.props?.date?.[0];
    const parsed = raw ? parseFrontmatterDate(raw) : null;
    return parsed ?? undefined;
  };

  if (axis === "mtime" && times.size === 0) return [];

  const rows: { qe: QuickEntry; mtimeMs: number }[] = [];
  for (const qe of entries) {
    const t = timeOf(qe.path);
    if (t !== undefined) rows.push({ qe, mtimeMs: t });
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.qe.path < b.qe.path ? -1 : 1));

  return rows.slice(0, limit).map((r, i) => ({
    entry: {
      kind: "changed" as const,
      path: r.qe.path,
      label: r.qe.primaryLabel,
      subtitle: r.qe.parentPath || undefined,
      mtimeMs: r.mtimeMs,
    },
    score: normalizedScore("changed", limit - i),
  }));
}

/**
 * 빌트인 명령 전체 (빈 입력 시 QUICK ACTIONS 그룹용) — 비활성 명령은 제외.
 *
 * ⚠️ `strong: false` 고정이다. 질의가 비어 있으면 승격할 근거가 없고, 여기서 참을 주면
 * **빈 팔레트를 열자마자 명령 전부가 맨 위로 올라온다** — Recent를 보려고 여는 흐름이
 * 통째로 망가진다.
 */
function quickActionsAsResults(): PaletteResult[] {
  return BUILTIN_COMMANDS.filter((c) => !c.disabled?.()).map((command, i) => ({
    entry: { kind: "command" as const, command, strong: false },
    score: normalizedScore("command", BUILTIN_COMMANDS.length - i),
  }));
}

/**
 * 통합 검색. mode에 따라 어떤 그룹을 채울지 결정.
 * - 같은 path를 가진 note와 content 결과는 점수 높은 쪽만 유지 (dedupe).
 *
 * **async**: `matchContent`가 storeFields=["name"]만 캐시한 인덱스 사용 → snippet 생성을
 * 위해 매 hit마다 `readNote`를 호출하므로 async 체인. files/tags/facets/commands는 sync.
 */
export async function unifiedSearch(
  input: string,
  hint: PaletteMode = "all",
): Promise<PaletteResult[]> {
  const { mode, query } = parseInput(input, hint);

  if (mode === "command") return commandsAsResults(query);
  if (mode === "tag") return matchTags(query, get(tagIndex));
  if (mode === "facet") return matchFacets(query);
  if (mode === "files") {
    // 호환 모드: 빈 입력에선 Recent 노출, 입력 있으면 file fuzzy
    return query ? matchFiles(query, get(quickEntries)) : recentAsResults();
  }
  if (mode === "fulltext") {
    if (!query) return recentAsResults();
    // ⌘⇧F에서도 구조 팔(태그·facet)을 함께 낸다. 종전엔 `all` 모드에만 있었다.
    //
    // ⚠️ **원래 노렸던 효과는 못 낸다 — 실측(2026-08-19)으로 확인했다.** 짧은 한국어 질의
    // (`title-short` R@1 37.5%)를 구조 팔로 유도하려던 것인데, **구조 팔의 어휘가 영문이다**:
    // 고유 태그 4,643개 중 한글 4개(0.1%) · `topic` 299개 중 5개(1.7%) · `doc_kind` 0개.
    // 한국어 2어절 질의는 여기 **닿을 수가 없다**(`캐시 정합성`·`멀티 윈도우` 실측 0건).
    // 파일명·태그를 영문 kebab-case로 강제하는 규약의 필연적 귀결이다.
    //
    // 그래서 이 분기가 실제로 돕는 것은 **영문 질의**다(`z` → 태그 8 · facet 5).
    // 짧은 한국어 질의는 여전히 미해결이고, 그 답은 여기가 아니다.
    const contentP = matchContent(query);
    const tags = matchTags(query, get(tagIndex), FULLTEXT_STRUCTURAL_LIMIT);
    const facets = matchFacets(query, FULLTEXT_STRUCTURAL_LIMIT);
    const content = await contentP;
    await fillContentSnippets(content, query); // 전부 표시되므로 모두 생성
    // 순서는 UI가 그룹으로 정한다(content가 위). 여기선 붙이기만 한다.
    return [...content, ...tags, ...facets];
  }

  // all 모드 — 빈 query면 Recent + 최근 변경 + Quick Actions
  //
  // ⚠️ '최근 연 것'과 '최근 바뀐 것'을 **따로** 낸다. 섞으면 어느 축인지 알 수 없고,
  // 밖에서 바뀐 노트는 열람 이력에 없어서 앞의 목록엔 절대 안 나온다.
  if (!query) {
    return [...recentAsResults(), ...changedAsResults(), ...quickActionsAsResults()];
  }

  // content는 IPC(readNote × N) 동반이라 다른 sync 빌더와 병렬로 진행
  const files = matchFiles(query, get(quickEntries));
  const contentP = matchContent(query);
  const tags = matchTags(query, get(tagIndex));
  const facets = matchFacets(query);
  const cmds = commandsAsResults(query);
  const content = await contentP;

  // path 중복 제거: file과 content가 같은 노트를 가리키면 더 높은 score만 유지
  const byPath = new Map<string, PaletteResult>();
  for (const r of files) {
    const p = (r.entry as { path: string }).path;
    const prev = byPath.get(p);
    if (!prev || r.score > prev.score) byPath.set(p, r);
  }
  for (const r of content) {
    const p = (r.entry as { path: string }).path;
    const prev = byPath.get(p);
    if (!prev || r.score > prev.score) byPath.set(p, r);
  }

  const merged = [...byPath.values(), ...tags, ...facets, ...cmds];
  merged.sort((a, b) => b.score - a.score);
  const final = merged.slice(0, 30);
  // 최종 컷에 든 content에만 스니펫 생성 — dedupe(파일과 같은 path)·30컷으로 탈락한 hit은 IO 안 함.
  await fillContentSnippets(final, query);
  return final;
}


/** `unifiedSearchWithFallback` 의 답. */
export interface UnifiedSearchOutcome {
  results: PaletteResult[];
  /**
   * IME 를 되돌려 **다시 찾은** 질의. 없으면 처음 질의로 찾은 것이다.
   *
   * 🔴 화면은 이걸 반드시 보여줘야 한다. 조용히 다른 것을 찾아 주면 사용자는 왜 그게
   * 나왔는지 모르고, 그러면 다음부터 결과 자체를 안 믿는다.
   */
  imeSwappedTo?: string;
  /**
   * 평범한 매칭이 0건이라 **굴절을 접어** 찾았다(`write` ↔ `writing`).
   *
   * 🔴 IME 되돌리기와 같은 이유로 화면이 반드시 보여준다. 다만 이쪽은 질의를 바꾸지
   * 않으므로 보여줄 문자열이 없다 — 접었다는 사실만 말한다.
   */
  stemMatched?: true;
}

/**
 * 찾고, **0건이면 한 번만** 자판을 되돌려 다시 찾는다.
 *
 * ## 🔴 왜 (2026-08-30 실사용 로그)
 *
 * "결과가 0건이던 질의" 아홉 중 **일곱**이 한글 IME 를 켠 채 친 영문이었다
 * (`ㄴㄷ셔ㅔㅠㅁㄴㄷ` → `setupbase`). 찾던 노트는 vault 에 있었는데 못 찾았다.
 *
 * ⚠️ **0건일 때만** 돈다. 되는 질의의 순위는 절대 안 건드린다 — 검색 품질을 바꾸는
 * 변경이 아니라 **막다른 골목에서만** 여는 뒷문이다.
 *
 * ⚠️ 한 번만 시도한다. 되돌린 질의가 또 0건이면 거기서 끝이다.
 */
export async function unifiedSearchWithFallback(
  input: string,
  hint: PaletteMode = "all",
): Promise<UnifiedSearchOutcome> {
  const results = await unifiedSearch(input, hint);
  // 🔴 어간 뒷문은 `searchQuick` 안에서 이미 0건을 조건으로 돌았다. 여기서는 **그렇게
  //    찾았다는 사실을 밖으로 내보내는** 일만 한다 — 조용히 주면 사용자는 왜 그게
  //    나왔는지 모르고, 그러면 다음부터 결과 자체를 안 믿는다.
  if (results.length > 0) {
    return results.some((r) => r.via === "stem") ? { results, stemMatched: true } : { results };
  }

  const { query } = parseInput(input, hint);
  if (!query.trim()) return { results };

  const swapped = hangulToQwerty(query);
  if (!swapped) return { results };

  const retry = await unifiedSearch(swapped, hint);
  if (retry.length === 0) return { results };
  return { results: retry, imeSwappedTo: swapped };
}

/** 그룹별로 결과 분할 — UI 렌더링용. 빈 그룹은 제외하지 않음(헤더 결정은 UI에서). */
export interface ResultGroups {
  /** 라벨 접두사가 맞은 명령 — 목록 맨 위. */
  topCommands: PaletteResult[];
  recents: PaletteResult[];
  changed: PaletteResult[];
  notes: PaletteResult[];
  content: PaletteResult[];
  tags: PaletteResult[];
  facets: PaletteResult[];
  commands: PaletteResult[];
}

export function groupResults(results: PaletteResult[]): ResultGroups {
  const groups: ResultGroups = {
    topCommands: [],
    recents: [],
    changed: [],
    notes: [],
    content: [],
    tags: [],
    facets: [],
    commands: [],
  };
  for (const r of results) {
    switch (r.entry.kind) {
      case "changed":
        groups.changed.push(r);
        break;
      case "recent":
        groups.recents.push(r);
        break;
      case "note":
        groups.notes.push(r);
        break;
      case "content":
        groups.content.push(r);
        break;
      case "tag":
        groups.tags.push(r);
        break;
      case "facet":
        groups.facets.push(r);
        break;
      case "command":
        (r.entry.strong ? groups.topCommands : groups.commands).push(r);
        break;
    }
  }
  return groups;
}

/** `ResultGroups`의 그룹 이름. 화면에 그리는 순서이기도 하다. */
/**
 * 화면에 그리는 그룹 순서. **점수가 아니라 이 배열이 자리를 정한다.**
 *
 * ⚠️ 예전에 `commands`가 항상 마지막이었다. `normalizedScore`가 명령에 `× 1.2` 우대를
 * 주고 있었는데도 **효과가 없었다** — 그룹 순서가 점수를 덮어쓰기 때문이다. 우대 코드는
 * 멀쩡히 있어서 `palette.ts`만 읽으면 명령이 우대받는 것처럼 보인다.
 *
 * `topCommands`(라벨 접두사가 맞은 명령)만 맨 위로 온다. 그룹 전체를 점수순으로 재정렬하지
 * **않는** 이유: 자리가 매번 바뀌면 근육 기억이 죽고, 팔레트에서 잘못 고르면 노트가
 * 바뀌거나 창이 열린다.
 */
export const GROUP_ORDER = [
  "topCommands",
  "recents",
  "changed",
  "notes",
  "content",
  "tags",
  "facets",
  "commands",
] as const;
export type GroupName = (typeof GROUP_ORDER)[number];

/**
 * 모드별로 **어떤 그룹을 화면에 낼지**. 컴포넌트가 아니라 여기 두는 이유는 테스트 때문이다 —
 * vitest가 `environment: "node"`이고 svelte 플러그인이 없어 컴포넌트를 못 띄운다.
 * 규칙이 컴포넌트 안에 있으면 **모드 분기에 테스트가 영영 안 붙는다**.
 *
 * - `files`(⌘P) — 파일 이름만. content 제외.
 * - `fulltext`(⌘⇧F) — 본문 + **구조 팔**. 노트 이름 매칭은 ⌘P의 몫이라 제외.
 * - `tag`/`facet`/`command` — prefix로 진입한 단일 목적 모드.
 * - `all`(⌘K) — 전부.
 *
 * `recents`·`commands`는 종전 규칙 그대로다.
 */
export function isGroupVisible(mode: PaletteMode, group: GroupName): boolean {
  switch (group) {
    case "recents":
      return true;
    case "changed":
      // 빈 입력 흐름에서만 채워진다 — 모드로 가릴 이유가 없다.
      return true;
    case "notes":
      return mode !== "fulltext";
    case "content":
      return mode !== "files";
    case "tags":
      return mode === "all" || mode === "tag" || mode === "fulltext";
    case "facets":
      return mode === "all" || mode === "facet" || mode === "fulltext";
    case "topCommands":
    case "commands":
      return mode === "all" || mode === "command";
  }
}

/**
 * 질의 **내** 상대 점수 `[0, 1]` — top-1 이 1.0.
 *
 * MCP `ResultRow.rel` 과 같은 뜻으로 맞춰 둔다. raw 점수는 질의마다 스케일이 달라
 * ("63점 vs 1,494점") 행 간 비교밖에 안 되는데, 화면에 그 숫자를 그대로 내면 읽는
 * 사람이 질의를 가로질러 비교하게 된다.
 *
 * ⚠️ `top` 이 0 이면 NaN 이 화면에 나온다. 숫자가 아닌 것은 숫자보다 나쁘다.
 */
export function relScore(score: number, top: number): number {
  if (!(top > 0)) return 0;
  return Math.max(0, score / top);
}

/** 폴더 칩 하나. `path` 가 빈 문자열이면 vault 루트다. */
export interface FolderChip {
  path: string;
  count: number;
}

/**
 * 본문 결과가 **어느 폴더에 몰려 있나**.
 *
 * ⚠️ `kind: "content"` 만 센다. 최근·바뀐 그룹도 경로를 들고 전문 모드에서 함께
 * 보이지만 그것들은 **질의가 찾아낸 것이 아니다** — 섞으면 칩이 질의와 무관해지고,
 * 무관한 필터는 결과를 지우면서 이유를 안 알려준다.
 *
 * 동점을 경로순으로 가르는 것도 중요하다. 안 그러면 같은 질의가 매번 다른 순서를 낸다.
 */
export function folderChips(results: readonly PaletteResult[], limit = 6): FolderChip[] {
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.entry.kind !== "content") continue;
    const at = r.entry.path.lastIndexOf("/");
    const dir = at < 0 ? "" : r.entry.path.slice(0, at);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/**
 * 이 항목이 가리키는 노트 경로. 경로가 없는 종류(명령·태그·facet)는 `null`.
 *
 * ⚠️ **경로가 없는 항목을 스코프가 지우면 안 된다.** 폴더를 좁혔다고 `>` 명령이 사라지면
 * 스코프를 켠 사용자는 명령 팔레트를 못 쓴다.
 */
export function entryPath(entry: PaletteEntry): string | null {
  switch (entry.kind) {
    case "note":
    case "content":
    case "recent":
    case "changed":
      return entry.path;
    default:
      return null;
  }
}

/**
 * 팔레트 스코프 안인가.
 *
 * ⚠️ **문자열 접두사**다 — `inScope`(앱 필터) · `under`(MCP) · `exclude` 와 같은 규칙이다.
 * 예전 폴더 칩은 **정확 일치**로 걸렀는데, 그러면 `knowledge/lapis` 로 좁혔을 때
 * `knowledge/lapis/plans/a.md` 가 빠진다 — 결과는 나오고 에러는 없다.
 */
export function inPaletteScope(entry: PaletteEntry, scope: string | null): boolean {
  if (!scope) return true;
  const p = entryPath(entry);
  if (p === null) return true;
  return p.startsWith(scope);
}

/**
 * 지금 결과에서 고를 만한 스코프 후보.
 *
 * ⚠️ `folderChips` 와 다르다. 저쪽은 **본문 결과만** 센다(질의가 찾아낸 것만). 스코프는
 * **지금 보이는 것**을 기준으로 골라야 화면에 있는 폴더가 후보에 있다.
 */
export function scopeCandidates(
  results: readonly PaletteResult[],
  limit = 6,
): ScopeOption[] {
  const paths: string[] = [];
  for (const r of results) {
    const p = entryPath(r.entry);
    if (p !== null) paths.push(p);
  }
  return scopeOptions(paths).slice(0, limit);
}
