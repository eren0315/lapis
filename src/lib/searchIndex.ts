import type { NoteContent, LinkInfo } from "$lib/tauri/notes";
import { readNote } from "$lib/tauri/notes";
import { snippetForQuery } from "$lib/snippet";
import { chosungOf, isChosungQuery } from "$lib/hangul";
import { stemPhrase } from "$lib/stem";
import FullTextWorker from "./fullTextWorker?worker";
import { logError, logWarn } from "$lib/stores/usage";

/* =========================================================
 * Quick Switcher (파일명 / alias / title fuzzy 매칭)
 * MiniSearch 없이 직접 구현 — 가벼움, 빠름
 * ========================================================= */

export interface QuickEntry {
  path: string;
  primaryLabel: string;   // 표시용 (title || name)
  matchKeys: string[];    // 매칭 대상 (name, aliases, title 모두) — 표시·반환용 원본
  matchKeysLower: string[]; // matchKeys 소문자 선계산 (매 검색마다 toLowerCase 반복 회피)
  chosungKeys: string[];  // matchKeys와 1:1 초성 형태 (초성 쿼리 매칭용, 선계산; 이미 소문자)
  /** matchKeys와 1:1. 구분자를 지운 소문자 형태. 원본과 같으면 `""` — 건너뛴다. */
  strippedKeysLower: string[];
  /** matchKeys와 1:1. 굴절을 접고 구분자를 지운 형태(0건 뒷문 전용). */
  stemmedKeysLower: string[];
  parentPath: string;     // 부모 디렉토리 (UI 보조 표시용)
}

export interface QuickHit {
  entry: QuickEntry;
  matchedKey: string;
  score: number;
  /**
   * 평범한 매칭이 **0건이라** 뒷문으로 찾았을 때만 붙는다.
   *
   * 🔴 화면은 이걸 반드시 보여줘야 한다. 조용히 다른 것을 찾아 주면 사용자는 왜 그게
   * 나왔는지 모르고, 그러면 다음부터 결과 자체를 안 믿는다.
   */
  via?: "stem";
}

/** 파일명이 쓰는 낱말 구분자. */
const SEPARATOR_RE = /[-_.\s/]+/g;

/**
 * 파생 키의 **단일 주인.** 앱과 테스트가 같은 것을 쓴다 — 갈라지면 테스트가 앱이
 * 안 하는 일을 검증하게 된다(이 저장소가 여섯 번 당한 부류다).
 */
export function deriveKeys(matchKeys: string[]): Pick<
  QuickEntry,
  "matchKeysLower" | "chosungKeys" | "strippedKeysLower" | "stemmedKeysLower"
> {
  const lower = matchKeys.map((k) => k.toLowerCase());
  return {
    matchKeysLower: lower,
    chosungKeys: matchKeys.map(chosungOf),
    // 원본과 같으면 빈 문자열 — 같은 것을 두 번 재지 않는다
    strippedKeysLower: lower.map((k) => {
      const s = k.replace(SEPARATOR_RE, "");
      return s === k ? "" : s;
    }),
    stemmedKeysLower: lower.map(stemPhrase),
  };
}

export function buildQuickEntries(infos: LinkInfo[]): QuickEntry[] {
  return infos.map((info) => {
    const keys = new Set<string>();
    keys.add(info.source_name);
    if (info.title) keys.add(info.title);
    for (const a of info.aliases) keys.add(a);
    const segs = info.source_path.split("/").filter(Boolean);
    const parent = segs.slice(-3, -1).join("/"); // 부모 두 단계만
    const matchKeys = [...keys];
    return {
      path: info.source_path,
      primaryLabel: info.title ?? info.source_name,
      matchKeys,
      // 키 입력마다 재계산하지 않는다. 파생 규칙의 주인은 `deriveKeys` 하나다.
      ...deriveKeys(matchKeys),
      parentPath: parent,
    };
  });
}

/**
 * fuzzy 코어 — **q, t 모두 이미 소문자**라고 가정(정규화 캐시 경로용). subsequence 매칭 +
 * 시작·연속 가중치. 라이브러리 없이 ~20줄.
 */
export function fuzzyMatchLower(q: string, t: string): number | null {
  if (!q) return 0;
  if (q === t) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length); // 시작 매칭 강한 가산
  if (t.includes(q)) return 500 - (t.length - q.length);   // 부분 문자열

  // subsequence 매칭
  let qi = 0;
  let prevIdx = -1;
  let score = 100;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (prevIdx === ti - 1) score += 5; // 연속
      if (ti === 0) score += 20;          // 첫 글자
      score += 1;
      prevIdx = ti;
      qi++;
    }
  }
  if (qi < q.length) return null; // 모두 매칭 안 됨
  return score - (t.length - q.length); // 짧을수록 우대
}

/** 편의 래퍼 — q/t를 소문자화 후 매칭. (tag/facet 등 비-Quick 경로용; 동작은 기존과 동일.) */
export function fuzzyMatch(query: string, target: string): number | null {
  return fuzzyMatchLower(query.toLowerCase(), target.toLowerCase());
}

/**
 * 단일 엔트리 스코어링 — searchQuick / searchQuickIncremental 공유.
 * `qLower`는 호출부에서 1회 소문자화한 쿼리. chosung 모드면 chosungKeys(이미 소문자),
 * 아니면 matchKeysLower를 사용. matchedKey는 표시용 원본 matchKeys[i].
 */
function scoreEntry(entry: QuickEntry, qLower: string, chosungMode: boolean): QuickHit | null {
  const keys = chosungMode ? entry.chosungKeys : entry.matchKeysLower;
  let best: QuickHit | null = null;
  for (let i = 0; i < keys.length; i++) {
    let score = fuzzyMatchLower(qLower, keys[i]);
    // ⚠️ 구분자를 지운 형태도 본다. 사람은 `blogwrite` 라고 치지 `blog-write` 라고 치지
    //    않으므로, 하이픈이 끊어 놓은 연속 매칭이 여기서 살아난다(실측 144 → 784).
    //    초성 모드는 대상이 아니다 — 초성 키에는 구분자가 없다.
    if (!chosungMode) {
      const stripped = entry.strippedKeysLower[i];
      if (stripped) {
        const alt = fuzzyMatchLower(qLower, stripped);
        if (alt !== null && (score === null || alt > score)) score = alt;
      }
    }
    if (score === null) continue;
    if (!best || score > best.score) {
      // 🔴 보여주는 것은 **원본 키**다. 접은 형태를 화면에 내면 사용자가 자기 파일명을 못 알아본다.
      best = { entry, matchedKey: entry.matchKeys[i], score };
    }
  }
  return best;
}

/**
 * 굴절을 접은 키로만 본다. **평범한 매칭이 0건일 때만** 불린다.
 *
 * 🔴 되는 질의의 순위는 절대 안 건드린다 — 검색 품질을 바꾸는 변경이 아니라 막다른
 * 골목에서만 여는 뒷문이다. IME 되돌리기(`unifiedSearchWithFallback`)와 같은 계약이다.
 */
function scoreEntryStemmed(entry: QuickEntry, qStem: string): QuickHit | null {
  let best: QuickHit | null = null;
  for (let i = 0; i < entry.stemmedKeysLower.length; i++) {
    const score = fuzzyMatchLower(qStem, entry.stemmedKeysLower[i]);
    if (score === null) continue;
    if (!best || score > best.score) {
      best = { entry, matchedKey: entry.matchKeys[i], score, via: "stem" };
    }
  }
  return best;
}

/**
 * 0건 뒷문 — 어간을 접어 한 번 더 찾는다.
 *
 * ⚠️ 초성 질의는 안 탄다. 접기 규칙은 라틴 문자에만 있다.
 * ⚠️ 한 번만 시도한다. 접어도 0건이면 거기서 끝이다.
 */
function stemFallback(query: string, entries: QuickEntry[], chosungMode: boolean): QuickHit[] {
  if (chosungMode) return [];
  const qStem = stemPhrase(query);
  if (!qStem) return [];
  const hits: QuickHit[] = [];
  for (const entry of entries) {
    const best = scoreEntryStemmed(entry, qStem);
    if (best) hits.push(best);
  }
  return hits;
}

/**
 * 전체 스캔(순수). 테스트 레퍼런스이자 incremental의 fallback 의미. "ㄱㅂㅈ"처럼 자음만이면
 * 초성 검색(키의 초성 형태에 매칭), 일반 쿼리는 fuzzy.
 */
export function searchQuick(query: string, entries: QuickEntry[], limit = 30): QuickHit[] {
  if (!query.trim()) {
    return entries
      .slice(0, limit)
      .map((entry) => ({ entry, matchedKey: entry.primaryLabel, score: 0 }));
  }
  const chosungMode = isChosungQuery(query);
  const qLower = query.toLowerCase();
  const hits: QuickHit[] = [];
  for (const entry of entries) {
    const best = scoreEntry(entry, qLower, chosungMode);
    if (best) hits.push(best);
  }
  if (hits.length === 0) hits.push(...stemFallback(qLower, entries, chosungMode));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

// === 점진 필터링 (incremental) ===
// 새 쿼리가 직전 쿼리를 prefix로 확장하고(같은 모드·같은 entries 참조) 있으면, 직전에 매칭된
// 후보군만 재스캔한다. subsequence 매칭은 `Q1`이 `Q2`의 prefix일 때 matches(Q2) ⊆ matches(Q1)이
// 성립하므로(엔트리 단위로도 성립) 결과가 동일하다. 모드 전환·삭제/편집·reindex(entries 교체) 시
// 전체 스캔으로 fallback. **후보군은 limit로 자르지 않고 전부** 보관해야 정확하다(하위 랭크가
// 다음 쿼리에서 상위로 올 수 있음).

let lastQuery = "";
let lastChosungMode: boolean | null = null;
let lastEntries: QuickEntry[] | null = null;
let lastCandidates: QuickEntry[] = [];

/** incremental 캐시 리셋(테스트·명시적 무효화용). */
export function resetQuickSearchCache(): void {
  lastQuery = "";
  lastChosungMode = null;
  lastEntries = null;
  lastCandidates = [];
}

/**
 * searchQuick의 점진 버전 — 매 호출 결과는 동일하나, prefix 확장 입력에서는 직전 후보군만
 * 스캔해 큰 vault에서 매 검색 전수 순회를 피한다. 호출부(palette `matchFiles`)에서 사용.
 */
export function searchQuickIncremental(query: string, entries: QuickEntry[], limit = 30): QuickHit[] {
  if (!query.trim()) {
    lastQuery = "";
    lastChosungMode = null;
    lastEntries = entries;
    lastCandidates = [];
    return entries
      .slice(0, limit)
      .map((entry) => ({ entry, matchedKey: entry.primaryLabel, score: 0 }));
  }
  const chosungMode = isChosungQuery(query);
  const qLower = query.toLowerCase();
  const canIncrement =
    lastEntries === entries &&
    lastChosungMode === chosungMode &&
    lastQuery !== "" &&
    query.startsWith(lastQuery);
  const pool = canIncrement ? lastCandidates : entries;

  const candidates: QuickEntry[] = [];
  const hits: QuickHit[] = [];
  for (const entry of pool) {
    const best = scoreEntry(entry, qLower, chosungMode);
    if (best) {
      candidates.push(entry); // limit 무관 전체 후보 보관(다음 prefix 확장의 정확성)
      hits.push(best);
    }
  }
  lastQuery = query;
  lastChosungMode = chosungMode;
  lastEntries = entries;
  // ⚠️ 뒷문 결과는 후보군에 안 넣는다. subsequence 의 포함 관계가 성립하는 것은 평범한
  //    매칭뿐이고, 접은 히트를 섞으면 다음 prefix 확장의 전제가 깨진다.
  lastCandidates = candidates;

  // 🔴 뒷문은 좁혀진 후보군이 아니라 **entries 전체**를 본다. 평범한 매칭이 0건이면
  //    후보군도 0이라, 거기서 찾으면 순수 구현과 답이 달라진다.
  if (hits.length === 0) hits.push(...stemFallback(qLower, entries, chosungMode));

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/* =========================================================
 * 풀텍스트 검색 — Web Worker proxy
 * MiniSearch 인스턴스는 worker thread에 보관. main thread freeze 0.
 * ========================================================= */

/**
 * ⚠️ **`$lib/fullTextOptions`가 단일 출처다.** 여기엔 같은 모양의 복사본이 따로 있었다.
 *
 * 둘이 우연히 같았기 때문에 아무 일도 안 일어났지만, 실제로 한쪽에만 필드를 더하니
 * **앱은 이 정의로 문서를 만들고 인덱스는 저 정의로 설정되는** 상태가 됐다. 각 파일은
 * 스스로 일관되므로 타입 검사도 안 걸린다 — 검색 결과만 조용히 틀린다.
 *
 * `MiniSearch`를 설정하는 쪽(`FULLTEXT_OPTIONS`)이 진실이라, 그쪽을 다시 내보낸다.
 */
import type { FullTextDoc } from "$lib/fullTextOptions";
export type { FullTextDoc };

export interface WorkerHit {
  path: string;
  score: number;
  name: string;
}

/**
 * worker `indexes` 배열의 최대 길이 — vault별 실제 shard 수는 `decideShardCount`로 동적 결정.
 * shardId 범위는 항상 `[0, MAX_SHARDS)` 안에 들어와야 worker가 정상 동작.
 */
export { MAX_SHARDS } from "$lib/fullTextOptions";

/**
 * shard 모델은 `fullTextOptions`가 단일 진실이다 — `MAX_SHARDS`와 **같은 이유**로 거기
 * 산다. 이 모듈은 Web Worker를 만들어서 Node에서 import 되지 않는데, CLI의 헤드리스
 * 인덱싱(`cli/indexBuild.ts`)이 앱과 **같은 shard 배정**을 써야 하기 때문이다.
 *
 * 여기 재수출을 남기는 건 기존 import 경로(`$lib/searchIndex`)를 깨지 않으려는 것뿐이다.
 */
export { decideShardCount, computeShardId } from "$lib/fullTextOptions";


type WorkerInMsg =
  | { type: "loadShard"; id: number; shardId: number; jsonBytes: ArrayBuffer }
  | {
      type: "addToShard";
      id: number;
      shardId: number;
      docs: FullTextDoc[];
      reset: boolean;
    }
  | { type: "toJSONShard"; id: number; shardId: number }
  | { type: "updateDoc"; id: number; shardId: number; doc: FullTextDoc }
  | { type: "removeDoc"; id: number; shardId: number; docId: string }
  | { type: "search"; id: number; query: string; limit: number }
  | { type: "resetAll"; id: number };

type WorkerOutMsg =
  | { type: "ready"; id: number }
  | { type: "results"; id: number; hits: WorkerHit[] }
  | { type: "json"; id: number; jsonBytes: ArrayBuffer | null }
  | { type: "error"; id: number; error: string };

let workerSingleton: Worker | null = null;
let nextMsgId = 0;
const pending = new Map<number, (data: WorkerOutMsg) => void>();

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  const w = new FullTextWorker();
  w.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
    const handler = pending.get(e.data.id);
    if (handler) {
      pending.delete(e.data.id);
      handler(e.data);
    }
  };
  w.onerror = (e) => {
    logError("searchIndex", "[fulltext-worker] error event", e);
  };
  workerSingleton = w;
  return w;
}

function dispatch<T extends WorkerOutMsg>(
  msg: WorkerInMsg,
  transfer?: Transferable[],
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, (data) => {
      if (data.type === "error") {
        reject(new Error(data.error));
      } else {
        resolve(data as T);
      }
    });
    getWorker().postMessage(msg, transfer ?? []);
  });
}

/**
 * 특정 shard에 cache JSON 로드 (cache hit lazy 시점).
 *
 * **transferable ArrayBuffer** — string structured clone(WebKit에서 30MB가 ~32s)
 * 대신 zero-copy. JSON string → TextEncoder UTF-8 bytes → ArrayBuffer → postMessage
 * 두 번째 인자에 transfer list. main thread 비용 ms 단위.
 */
export async function workerLoadShard(shardId: number, json: string): Promise<void> {
  const id = ++nextMsgId;
  const bytes = new TextEncoder().encode(json);
  await dispatch<{ type: "ready"; id: number }>(
    { type: "loadShard", id, shardId, jsonBytes: bytes.buffer },
    [bytes.buffer],
  );
}

/**
 * 특정 shard에 docs 한 배치를 추가 (cache miss 풀 빌드).
 *
 * `reset=true`면 shard 인덱스를 새로 만들고 추가(첫 배치), false면 기존에 append.
 * **caller(`rebuildIndexes`)가 shard를 작은 배치로 나눠 호출**하는 이유: 한 shard 전체
 * (수천 doc × body)를 한 번에 postMessage하면 WKWebView가 main thread에서 structured
 * clone에 수 초를 써 UI(인덱스 빌드 스피너 포함)가 freeze된다. 배치마다 await(worker
 * 왕복)로 main thread가 양보돼 스피너가 계속 돈다.
 */
export async function workerAddToShard(
  shardId: number,
  docs: FullTextDoc[],
  reset: boolean,
): Promise<void> {
  const id = ++nextMsgId;
  await dispatch<{ type: "ready"; id: number }>({
    type: "addToShard",
    id,
    shardId,
    docs,
    reset,
  });
}


/** worker 안 인덱스로 검색. snippet 없이 path+score+name만 반환. */
export async function workerSearch(query: string, limit: number): Promise<WorkerHit[]> {
  const id = ++nextMsgId;
  const r = await dispatch<{ type: "results"; id: number; hits: WorkerHit[] }>({
    type: "search",
    id,
    query,
    limit,
  });
  return r.hits;
}

/**
 * 특정 shard의 MiniSearch 인덱스 JSON 직렬화 — disk 캐시 저장 직전.
 *
 * worker 안에서 JSON.stringify 후 UTF-8 bytes → ArrayBuffer transferable로 main 전송.
 * main에서 TextDecoder로 string 복원. clone 0.
 */
export async function workerToJSONShard(shardId: number): Promise<string | null> {
  const id = ++nextMsgId;
  const r = await dispatch<{ type: "json"; id: number; jsonBytes: ArrayBuffer | null }>({
    type: "toJSONShard",
    id,
    shardId,
  });
  if (!r.jsonBytes) return null;
  return new TextDecoder().decode(new Uint8Array(r.jsonBytes));
}

/**
 * 단일 노트 증분 갱신 — 해당 shard에 add/replace. 외부 파일 변경 watcher 경로에서 호출.
 * vault 전체 재빌드(read_vault_bundle) 없이 바뀐 노트만 풀텍스트에 반영.
 */
export async function workerUpdateDoc(
  shardId: number,
  doc: FullTextDoc,
): Promise<void> {
  const id = ++nextMsgId;
  await dispatch<{ type: "ready"; id: number }>({
    type: "updateDoc",
    id,
    shardId,
    doc,
  });
}

/** 단일 노트 증분 삭제 — 해당 shard에서 discard. 없으면 무시. */
export async function workerRemoveDoc(
  shardId: number,
  docId: string,
): Promise<void> {
  const id = ++nextMsgId;
  await dispatch<{ type: "ready"; id: number }>({
    type: "removeDoc",
    id,
    shardId,
    docId,
  });
}

/** worker 안 모든 shard 인덱스 release. clearIndexes에서 호출. */
export async function workerReset(): Promise<void> {
  const id = ++nextMsgId;
  await dispatch<{ type: "ready"; id: number }>({ type: "resetAll", id });
}

/**
 * 풀텍스트 랭킹만 — worker가 path/score/name 반환. **IO·snippet 없음**(저비용).
 *
 * 스니펫은 `buildContentSnippet`로 **표시 대상 hit에만** 지연 생성한다 — dedupe·결과 컷으로
 * 탈락하는 hit에 대해 `readNote`(디스크 IO + IPC)를 낭비하지 않기 위함.
 * 호출자(`palette.ts:matchContent`)도 async 체인. 인덱스 인자는 안 받음(worker singleton).
 */
export async function searchFullTextRanked(
  query: string,
  limit = 30,
): Promise<WorkerHit[]> {
  const q = query.trim();
  if (!q) return [];
  return workerSearch(q, limit);
}

const SNIPPET_RADIUS = 60;

/**
 * 단일 노트의 검색 스니펫 생성 — `readNote` 1회 + 매치 주변 추출. 실패 시 빈 문자열.
 * 최종 표시 결과에만 호출(불필요한 디스크 IO 회피).
 */
export async function buildContentSnippet(path: string, query: string): Promise<string> {
  try {
    return snippetForQuery(await readNote(path), query, SNIPPET_RADIUS);
  } catch (e) {
    logWarn("searchIndex", `[search] readNote failed for ${path}`, e);
    return "";
  }
}

/**
 * 명령 라벨용 매칭 — **초성 질의를 안다.**
 *
 * ## 🔴 왜 따로 있나
 *
 * `⌘P` 로 파일을 찾을 때는 초성이 먹는다 — 이 파일의 인덱스가 항목마다 `chosungKeys` 를
 * 미리 계산해 두기 때문이다. 그런데 명령은 그 인덱스에 없어서 라벨 원문에 바로
 * `fuzzyMatch` 를 걸었고, 라벨에 낱자(ㅅ·ㅌ)가 들어 있을 리 없으니 **언제나 `null`** 이었다.
 * 같은 팔레트 안에서 한쪽만 초성이 되는 비대칭이었다.
 *
 * ## ⚠️ 미리 계산해 두지 않는다
 *
 * 명령 라벨은 **getter** 다(로케일이 바뀌면 따라와야 해서). 모듈 최상위에서 접어 두면
 * 언어를 바꿔도 옛 초성이 남는다. 스무 개 남짓한 짧은 문자열이라 입력마다 접어도 싸다.
 *
 * ⚠️ **초성 질의일 때만** 접는다. 보통 질의를 접으면 `탭` 같은 글자가 `ㅌ` 이 되어
 * 엉뚱한 것에 걸린다.
 */
export function fuzzyMatchLabel(query: string, label: string): number | null {
  const q = query.trim();
  if (!q) return 0;
  if (!isChosungQuery(q)) return fuzzyMatch(q, label);

  const folded = chosungOf(label);
  const direct = fuzzyMatchLower(q, folded);
  if (direct !== null) return direct;

  // ⚠️ 낱말을 가로지르는 초성 — `ㅅㄴㅌ` 이 `새 노트` 를 가리킨다. 접힌 형태는
  //    `ㅅ ㄴㅌ` 이라 공백 때문에 위에서 안 걸릴 수 있다.
  const joined = folded.replace(/\s+/g, "");
  return fuzzyMatchLower(q, joined);
}
