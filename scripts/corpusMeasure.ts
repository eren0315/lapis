/**
 * 코퍼스 기능 수요 표 — **두 머신에서 같은 명령으로 같은 표를 낸다.**
 *
 *     npm run corpus:measure -- <vault 경로>
 *
 * ## 🔴 왜 스크립트로 남기나
 *
 * 4차 조사는 *"스크립트는 남기지 않았다 — 한 번 쓰는 것이고 재는 방법이 바뀔 수 있다"*
 * 고 적었다. **전제가 바뀌었다.** 이제 Windows 와 macOS 두 vault 를 재야 한다.
 *
 * 근거는 실제로 밟은 것이다. `.mmd` 때 Windows vault 만 재고 *"0개라 보험이지 성과가
 * 아니다"* 라고 썼는데 macOS 쪽에서는 많이 쓰고 있었다.
 * **측정은 그 코퍼스에 대해서만 참이다.**
 *
 * ## 🔴 코드 펜스를 제외하고 센다
 *
 * 계획 문서가 문법을 설명하며 쓴 글자가 grep 에 잡힌다. 이 저장소가 **세 번** 그걸
 * 수요로 셌다 — 앵커 11건 · 임베드 11건이 전부 예시였고, 이번 라운드에도 각주 6건이
 * 전부 코드블록 안 정규식 문자클래스(`[^]]`)였다.
 *
 * ⚠️ 마스킹은 `$lib/vaultAudit` 의 `maskCodeAndMeta` 를 **그대로 쓴다.** 두 번째 구현을
 * 만들면 이 저장소가 여섯 번 당한 "규칙이 두 곳에 갈림"이 또 생긴다.
 *
 * 🔴 `maskNonProse` 가 **아니다.** 저쪽은 이미 걸린 링크까지 덮는다 — "안 걸린 언급"을
 * 찾는 데는 맞지만 여기서는 **세려는 것을 지운다.** 처음에 그걸 써서 위키링크가 0건으로
 * 나왔고, 그 0 을 그대로 믿을 뻔했다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { maskCodeAndMeta } from "$lib/vaultAudit";

/**
 * 세지 않을 디렉터리.
 *
 * 🔴 `.lapis/link-rewrite-backup` 이 핵심이다 — 링크 갱신 백업이 노트 **사본**을 들고
 * 있어서, 안 거르면 같은 내용을 두 번 센다. 실측으로 확인했다.
 */
const SKIP_DIRS = new Set([".git", ".lapis", "node_modules", ".obsidian", ".trash"]);

const NOTE_EXT = /\.(md|mmd)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // 심링크가 끊겼거나 권한이 막혔다 — 아래에서 "못 읽음"으로 센다
    }
    if (st.isDirectory()) walk(p, out);
    else if (NOTE_EXT.test(name)) out.push(p);
  }
  return out;
}

interface Feature {
  label: string;
  /** 산문(마스킹 뒤)에서 세는 정규식. */
  re: RegExp;
}

const FEATURES: Feature[] = [
  { label: "각주 정의 [^x]:", re: /^\[\^[^\]]+\]:/gm },
  { label: "각주 참조 [^x]", re: /\[\^[^\]]+\](?!:)/g },
  { label: "블록 수식 $$", re: /\$\$[\s\S]+?\$\$/g },
  { label: "인라인 수식 $x$", re: /(?<!\$)\$[^$\n]+\$(?!\$)/g },
  { label: "하이라이트 ==x==", re: /==[^=\s][^=]*==/g },
  { label: "주석 %%x%%", re: /%%[\s\S]+?%%/g },
  { label: "콜아웃 > [!TYPE]", re: /^>\s*\[![a-z]+\]/gim },
  { label: "트랜스클루전 ![[x]]", re: /!\[\[[^\]]+\]\]/g },
  { label: "이미지 ![](x)", re: /!\[[^\]]*\]\([^)]+\)/g },
  { label: "위키링크 [[x]]", re: /(?<!!)\[\[[^\]]+\]\]/g },
  { label: "표 행 |…|", re: /^\s*\|.+\|\s*$/gm },
];

function main(): void {
  const vault = process.argv[2];
  if (!vault) {
    console.error("사용법: npm run corpus:measure -- <vault 경로>");
    process.exit(2);
  }
  const root = path.resolve(vault);
  try {
    if (!statSync(root).isDirectory()) throw new Error("디렉터리가 아니다");
  } catch {
    console.error(`vault 를 못 읽는다: ${root}`);
    process.exit(2);
  }

  const files = walk(root);
  // 🔴 카나리아 — 0개면 걸러낸 것이 아니라 못 읽은 것이다.
  if (files.length === 0) {
    console.error(`노트를 하나도 못 찾았다 — 경로가 맞는지 확인하라: ${root}`);
    process.exit(1);
  }

  const noteCount = new Map<string, number>();
  const hitCount = new Map<string, number>();
  let unreadable = 0;
  let totalLines = 0;
  const lengths: number[] = [];

  for (const f of files) {
    let raw: string;
    try {
      raw = readFileSync(f, "utf8");
    } catch {
      unreadable++; // ⚠️ 조용히 건너뛰지 않는다. 분모가 틀리면 모든 비율이 틀린다.
      continue;
    }
    const lines = raw.split("\n").length;
    lengths.push(lines);
    totalLines += lines;

    const prose = maskCodeAndMeta(raw);
    for (const { label, re } of FEATURES) {
      re.lastIndex = 0;
      const n = [...prose.matchAll(re)].length;
      if (n > 0) {
        noteCount.set(label, (noteCount.get(label) ?? 0) + 1);
        hitCount.set(label, (hitCount.get(label) ?? 0) + n);
      }
    }
  }

  const read = files.length - unreadable;
  lengths.sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  const p90 = lengths.length ? lengths[Math.floor(lengths.length * 0.9)] : 0;

  console.log(`vault      ${root}`);
  console.log(`노트        ${files.length}개 (읽음 ${read}${unreadable ? ` · 못 읽음 ${unreadable}` : ""})`);
  console.log(`길이        중앙값 ${median}줄 · 90p ${p90}줄 · 합계 ${totalLines}줄`);
  console.log("");
  console.log("기능          노트(비율)        건수");
  console.log("─".repeat(52));
  for (const { label } of FEATURES) {
    const notes = noteCount.get(label) ?? 0;
    const hits = hitCount.get(label) ?? 0;
    const pct = read ? Math.round((notes / read) * 100) : 0;
    console.log(`${label.padEnd(20)} ${String(notes).padStart(4)} (${String(pct).padStart(3)}%)   ${String(hits).padStart(5)}`);
  }
  console.log("");
  console.log("⚠️ 코드 펜스 · 인라인 코드 · frontmatter 는 제외하고 셌다.");
  console.log("⚠️ 이 숫자는 이 vault 에 대해서만 참이다. 다른 머신에서 다시 재라.");
}

main();
