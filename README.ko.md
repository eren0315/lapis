# Lapis

> 로컬 마크다운을 **백링크 · 태그 · 풀텍스트 검색**으로 항해하는 개인용 지식 워크벤치 — macOS · Windows

[English](README.md) · **한국어**

[![CI](https://github.com/eren0315/lapis/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eren0315/lapis/actions/workflows/ci.yml)
![version](https://img.shields.io/github/v/tag/eren0315/lapis?label=version&color=1f6feb)
![platform](https://img.shields.io/badge/platform-macOS_11%2B_%7C_Windows_10%2B-black)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-blue)

Lapis는 이미 쌓인 마크다운 더미를 **읽고 찾는** 데 최적화된 데스크톱 앱입니다. 새 노트를 쓰는 도구가 아니라, 수천~수만 개 문서 사이의 연결을 따라가는 도구입니다.

파일은 로컬 파일시스템에만 있습니다. 계정도, 클라우드 동기화도, 텔레메트리도 없습니다. 앱이 하는 일은 `.md` 파일을 읽고, 인덱스를 만들고, 필요하면 원자적으로 쓰는 것뿐입니다.

> ⚠️ **제가 개인적으로 쓰려고 만든 도구입니다.** 제 사용 패턴(주로 읽기·탐색)에 맞춰 만들었고, QA도 베타 테스터도 없습니다. **버그가 있을 수 있고**, 제가 쓰지 않는 경로는 검증이 얕습니다. 자유롭게 쓰셔도 되지만(MIT), **중요한 노트는 백업하거나 git으로 버전관리하시길 권합니다.**

**설계상 다른 점 세 가지**

- **읽기가 기본** — 처음 보이는 화면이 렌더링된 프리뷰이고, 편집기는 `⌘E`로 필요할 때만 꺼냅니다.
- **한글 검색을 전제로 만듦** — BM25 랭킹에 한글 bigram 색인을 얹어, 조사·어미가 붙어도 걸립니다.
- **에이전트가 쓸 수 있는 인덱스** — 앱이 만든 검색 인덱스를 MCP 서버로 노출해 Claude Code가 같은 vault를 질의합니다.

---

## 주요 기능

### 읽기 중심 워크플로

- **단일 뷰 사이드바** — 좌측 레일이 파일 · 태그 · 필터 · 즐겨찾기 중 하나를 고릅니다. 활성 아이콘을 다시 누르면 접힙니다(`⌘B` 도 그대로).
- **`⌘E` 단일 토글** — 프리뷰(markdown-it) ↔ 편집기(CodeMirror 6). 모드가 두 개가 아니라 한 개의 토글입니다.
- **본문 폭 조절** — Aa 팝오버에서 40~88em. 긴 문서를 읽기 좋은 단 폭으로 좁힙니다.
- **읽던 위치 이월** — 편집기와 프리뷰를 오가도 보고 있던 섹션에 그대로 머무릅니다.
- **아웃라인**(`⌘⇧O`) — 헤딩 목록으로 문서 안을 점프.
- **컨텍스트 패널**(`⌥B`) — 속성 · 목차 · 관계 · 자산을 세그먼트 탭으로 본문 옆에 붙여 둡니다.
- **색** — 다크 한 벌에 액센트 프리셋 26종. 더 바꾸려면 설정의 사용자 정의 CSS 로 토큰을 덮습니다.
- **밀도 · 애니메이션** — 설정 → 모양에서 각각 3단(여유/기본/조밀, 시스템/최소/전체). 밀도는 간격만 바꾸고 글자 크기는 건드리지 않습니다.

### 문서 사이의 연결

- **위키링크** — `[[노트 이름]]`으로 점프. 코드펜스와 인라인 코드 안의 `[[...]]`는 링크로 보지 않습니다(예: `[[String: Any]]`은 코드 표현입니다).
- **헤딩까지 가리키기** — `[[노트#헤딩]]`은 그 노트를 열고 그 헤딩으로 스크롤합니다. `[[#헤딩]]`은 지금 문서 안에서 움직입니다. 헤딩이 없으면 노트만 열고 제자리에 둡니다.
- **콜아웃** — `> [!NOTE]` · `[!TIP]` · `[!IMPORTANT]` · `[!WARNING]` · `[!CAUTION]`. GitHub와 **같은 다섯 종만** 받습니다 — 그래야 같은 문서가 GitHub에서도 같아 보입니다. 모르는 종류는 평범한 인용문으로 남고, 지원하지 않는 도구에서도 인용문으로 곱게 무너집니다.
- **다른 노트 당겨오기** — `![[노트]]` 는 그 노트 전체를, `![[노트#헤딩]]` 은 그 절만 본문 안에 펼칩니다. 당겨온 자리는 테두리로 표시되고, 못 가져오면 **왜 못 가져왔는지가 그 자리에 남습니다**(빈 자리로 두지 않습니다). 서로를 당겨오는 순환과 3겹을 넘는 사슬은 끊습니다.
  - 이름에 `#`이 들어간 노트(`C#.md`)가 있으면 그쪽이 우선입니다 — 먼저 통째로 찾아보고, 없을 때만 앵커로 봅니다.
- **백링크 패널** — 이 문서를 가리키는 문서 목록. 역참조가 탐색의 1차 수단입니다.
- **frontmatter cross-ref** — `related` · `amends` · `superseded_by`를 **관계 타입을 보존해** 따로 인덱싱합니다. "이 문서를 정정한 문서"와 "그냥 관련 문서"가 섞이지 않습니다.
- **링크 자동 갱신** — 파일 이름을 바꾸면 그를 가리키던 참조를 따라가 고칩니다. 실행 전 **dry-run 미리보기**와 **백업**을 거칩니다.

### 검색 — 네 층

| 층 | 단축키 | 엔진 | 쓰는 때 |
|---|---|---|---|
| 파일명 fuzzy | `⌘P` | 자체 fuzzy | 파일 이름을 대충 아는 경우 |
| 풀텍스트 | `⌘⇧F` | MiniSearch (BM25 + 한글 bigram) | 내용으로 찾을 때 |
| 문서 내 | `⌘F` | regex · 대소문자 · 단어 단위 | 열어 둔 문서 안에서 |
| vault 전체, 리터럴/정규식 | `⌘⇧G` | Rust `regex`, 병렬 walk | 기억한 표현과 실제 표현이 다를 때 |

마지막 층이 있는 이유는 BM25와 grep이 **반대 방향으로 실패**하기 때문입니다. 이 vault에서 실측한
결과, `_memories`에서 grep은 4문항 전부 0건이었고(기록은 "창", 질의는 "윈도우"), BM25는 같은
트리에서 상위를 익사당했습니다. 한 팔이 못 닿는 곳에 다른 팔은 파묻히니 둘 다 둡니다. 결과를
클릭하면 같은 패턴으로 문서 내 검색이 켜져, 노트 맨 위가 아니라 **찾은 자리**에서 시작합니다.

풀텍스트 인덱스는 **Web Worker**에서 만들고 **shard 단위로 디스크에 캐시**합니다. 앱을 다시 켤 때 처음부터 다시 읽지 않습니다.

### 노트 안의 저장된 질의

코드 펜스를 적어 두면 그 자리에서 돌고 결과가 그려진다:

````
```lapis-query
doc_kind: plan, adr
topic: overview
tag: subject
text: 윈도우
limit: 20
```
````

고르는 일은 **표 화면이 쓰는 그 매처**를 그대로 부른다. 같은 질의가 표와 노트에서 다른 답을
낼 수 없다. 결과 줄은 평범한 위키링크라, 누르면 다른 링크와 똑같이 동작한다 — 이름이 겹칠 때의
판정까지 같다.

**몇 건인지 먼저** 말하고, 목록을 잘랐으면 잘랐다고 다시 말한다. 잘린 목록이 전부처럼 보이는
것은 목록이 없느니만 못하다. 못 읽는 질의는 빈 칸이 아니라 **그 자리에 오류로** 보여준다 —
빈 칸은 "그런 노트가 없다"로 읽힌다.

태그는 **정확 일치 또는 nested 접두사**로 걸린다 — `subject` 로 물으면 `subject/ui` 도 걸린다.
그 규칙은 앱의 필터·질의 엔진과 **같은 모듈**에 있어서, 같은 태그 질문이 표면마다 다른 답을
낼 수 없다. 노트에 결과를 되쓰지는 않는다.

### 태그

- **frontmatter `tags:`만** 인덱싱합니다. 본문 인라인 해시태그는 의도적으로 무시합니다 — 코드 안의 `#define`이나 URL fragment(`#section`)와 구분할 방법이 없기 때문입니다.
- **nested kebab-case** — `tech/svelte5`, `issue/atomic-write`처럼 `/`로 계층을 만들면 사이드바가 prefix 트리로 렌더합니다.
- 태그를 눌러 해당 문서만 좁혀 보기.
- **vault 전체에서 태그 이름 바꾸기·병합**을 커맨드 팔레트에서. 하위 태그도 따라옵니다 —
  `tech`를 `stack`으로 바꾸면 `tech/svelte5`는 `stack/svelte5`가 됩니다. 먼저 dry-run으로 범위를
  보여주고, 대상 노트를 백업한 뒤 쓰며, 쓰기가 실패하면 되돌립니다 — 노트 rename과 같은 기계장치입니다.

### 탭과 창

- `⌘T` 새 탭 · `⌘P` 활성 탭 교체 · `⌘W` 닫기 · `⌘1`~`⌘9` 선택
- `⌘,` / `⌘.` (또는 `⌘←` / `⌘→`) 방문 이력 뒤로 · 앞으로
- **`⌘⇧T` 새 창 — 창마다 다른 vault를 엽니다.** 개인 노트와 프로젝트 문서를 나란히 두고 봅니다.

### 내보내기 · 바깥으로 옮기기

- **Mermaid** 코드블록 렌더(테마에 맞춰 색이 바뀝니다) + **PNG 내보내기**
- **자립형 HTML 내보내기** — 스타일이 파일 안에 들어간 단일 `.html`. 어디서 열어도 같게 보입니다.
- **리치 텍스트 복사** — 위키·메일·메신저의 서식 입력란에 붙여넣으면 서식이 유지됩니다.
- **Finder에서 보기** — 현재 노트를 Finder에서 바로 엽니다.
- **vault git 버전관리** — vault가 git 저장소면 앱에서 변경을 다룹니다.

---

## 설치

**빌드된 바이너리는 배포하지 않습니다.** 소스에서 빌드하세요 — 요구사항과 명령은 아래 [개발](#개발)에 있습니다.

```bash
git clone https://github.com/eren0315/lapis.git
cd lapis
npm install
npm run tauri build
```

산출물은 `src-tauri/target/release/bundle/`에 생깁니다.

- **macOS** — `Lapis.app`을 `/Applications`로 옮기면 됩니다.
- **Windows** — `bundle/nsis/`의 인스톨러를 실행하세요. (MSI는 기본으로 만들지 않습니다 — 필요하면 `npm run tauri build -- --bundles msi`.)

> 개인용 도구라 배포·지원을 전제로 만들지 않았습니다. 일상 개발은 macOS 11+ / Apple Silicon에서 하고,
> Windows 10+ (x64)는 CI가 Rust 검사·테스트를 양쪽에서 돌려 동작을 유지합니다. 다만 Windows는 손으로
> 쓰는 시간이 훨씬 적으니 거친 부분이 있을 수 있습니다.

버전별 변경 내역은 [`CHANGELOG.ko.md`](CHANGELOG.ko.md)에 있습니다 — GitHub Releases를 쓰지 않으므로 여기가 릴리즈 노트를 대신합니다. 원본은 영어판 [`CHANGELOG.md`](CHANGELOG.md)입니다.

## 시작하기

1. 첫 화면의 **Vault 열기…** 로 `.md`가 들어 있는 폴더를 고릅니다. 빈 폴더도 됩니다. 한 번 연 vault 는 그 화면의 **최근** 목록에 남습니다.
2. 첫 인덱싱이 돌아갑니다. 링크·태그·풀텍스트를 한 번에 만들며, 1,000개 규모에서 수 초입니다. **트리 표시를 막지 않으므로** 인덱싱 중에도 문서를 열 수 있습니다.
3. `⌘P`로 파일 이름을, `⌘⇧F`로 내용을 찾습니다.
4. 아무 노트에 `[[다른 노트]]`를 적어 두고, 그 다른 노트의 **Backlinks**에서 역참조가 잡히는지 봅니다.
5. 나머지는 `⌘K` — 모든 명령이 Command Palette에 있습니다.

## 단축키

| 단축키 | 동작 |
|---|---|
| `⌘K` | 커맨드 팔레트 — 마지막으로 쓰던 모드로 열리고, `⇥` 로 전체 · 파일 · 본문 · 명령을 돕니다 |
| `⌘P` | Quick File Open (파일명 fuzzy) — 활성 탭을 교체 |
| `⌘⇧F` / `⌘⇧P` | 풀텍스트 검색 |
| `⌘⇧G` | vault 전체를 리터럴/정규식으로 검색 |
| `⌘F` | 현재 노트 안에서 찾기 |
| `⌘E` | 읽기 ↔ 편집 토글 |
| `⌘⇧E` | 파일 트리 필터로 포커스 |
| `⌘N` | 새 노트 |
| `⌘S` | 즉시 저장 (편집 중에는 2초마다 자동 저장) |
| `F2` | 현재 노트 이름 변경 |
| `⌘⌫` | 현재 노트를 휴지통으로 |
| `⌘T` | 새 탭 |
| `⌘⇧T` | 새 창 (창마다 다른 vault) |
| `⌘W` | 탭 닫기 |
| `⌘1`~`⌘9` | 해당 탭으로 |
| `⌘,` / `⌘.` | 방문 이력 뒤로 / 앞으로 |
| `⌘←` / `⌘→` | 방문 이력 뒤로 / 앞으로 |
| `⌘B` | 사이드바 접기/펴기 |
| `⌥B` | 컨텍스트 패널 접기/펴기 |
| `⌘⇧O` | 아웃라인 |
| `⌘⇧C` | 현재 노트 경로 복사 |

> `F2`는 Mac 매직 키보드에서 기본이 화면 밝기입니다. `Fn+F2`를 쓰거나, 키보드 설정에서 "F1, F2 등을 표준 기능 키로 사용"을 켜세요. 아니면 `⌘K` → "Rename".

---

## 언어

앱 인터페이스는 **한국어 · English**를 지원합니다. 기본값은 **OS 언어를 따르고**, 지원하지 않는 언어면 영어로 표시합니다. 설정 → **언어**에서 시스템 / 한국어 / English 중 고를 수 있습니다.

빈 vault에서 만드는 Welcome 샘플 노트도 그때의 언어로 생성됩니다. 이미 만들어진 파일은 언어를 바꿔도 그대로 둡니다.

## 커맨드라인 — `lapis`

앱이 떠 있지 않아도 같은 인덱스를 터미널에서 쓸 수 있습니다.

```bash
cli/lapis search "멀티 윈도우" --min-rel 0.3
cli/lapis links --broken
cli/lapis status
```

Windows(PowerShell·cmd)에서는 `.cmd` 짝을 부릅니다:

```powershell
cli\lapis.cmd search "멀티 윈도우" --min-rel 0.3
```

아무 명령에나 `--json`을 붙이면 MCP 도구가 돌려주는 것과 **같은 모양**이 나옵니다 —
스크립트와 에이전트가 형식을 두 번 배우지 않아도 됩니다. 계약·종료 코드, 그리고 아직
만들지 **않은** 것들의 층별 계획은 [`cli/README.md`](cli/README.md)에 있습니다.

## Claude Code 연동 — 지식 질의 MCP

Lapis가 만든 검색 인덱스를 MCP 서버로 노출합니다. 도구는 **하나**(`lapis_query`)입니다.

```json
{
  "mcpServers": {
    "lapis": { "command": "/절대/경로/lapis/mcp/lapis-mcp" }
  }
}
```

Windows에서는 `.cmd` 짝을 가리킵니다 — 확장자 없는 쪽은 셸 스크립트라 Windows가 실행하지 못하고,
클라이언트에는 "서버가 안 뜬다"로만 보입니다.

```json
{ "mcpServers": { "lapis": { "command": "C:\\경로\\lapis\\mcp\\lapis-mcp.cmd" } } }
```

구조 질의(`doc_kind` · `topic` · `tag` · `backlinks_of`)와 BM25 풀텍스트를 한 번에 냅니다. LLM도 API 키도 없습니다 — 같은 인자를 주면 같은 결과가 나옵니다.

> ⚠️ **기본값은 차단입니다.** 앱에서 **설정 → MCP 질의 → 허용**으로 바꿔야 질의가 통합니다.
> 이 스위치는 **질의 허용 여부만** 정합니다. `lapis-mcp`는 stdio 서버라 프로세스는 Claude
> 클라이언트가 띄웁니다 — 기동까지 막으려면 위 `mcpServers`에서 `lapis` 항목을 제거하세요.

**정직한 한계** (19,000+ 문서 vault에서 실측):

- **grep을 대체하지 않습니다.** 재현율은 grep이 더 높습니다(AND 검색 100% vs R@10 89.4%). 이 도구의 값은 **랭킹**입니다.
- **참조 추적(`backlinks_of`)만 압도적입니다.** grep이 3회 호출·15.9KB·오탐 3건을 쓴 질문을 1회·1.6KB·오탐 0건으로 답합니다.
- **인덱스 생산자는 앱입니다.** MCP는 캐시를 읽기만 합니다. vault가 캐시보다 새로우면 응답에 `stale`을 실어 보내지만 **막지는 않습니다** — 하드 실패 자체가 판단이고, 이 서버는 판단하지 않습니다.

계약 · 오류 종류 · 계측 수치는 [`mcp/README.md`](mcp/README.md)에 있습니다.

---

## 설계 원칙

| 원칙 | 구현 |
|---|---|
| **로컬 온리** | 네트워크 코드가 없습니다. 계정·동기화·텔레메트리 없음. |
| **부분 쓰기 금지** | 저장은 `temp file → POSIX rename`. 같은 디렉터리에 쓰고 원자적으로 갈아끼웁니다. 실패하면 temp를 정리합니다. |
| **경로 탈출 차단** | vault root를 canonicalize한 뒤 `starts_with`로 검사하고, 확장자는 화이트리스트로 제한합니다. |
| **인덱스는 한 곳에서만 만든다** | 스캐너를 두 벌 두면 반드시 어긋납니다. wikilink·md link·frontmatter 추출은 전부 Rust에만 있고, MCP는 그 산출물을 읽습니다. |
| **외부 의존 최소** | Rust 쪽은 `std::fs`/`std::path` 중심입니다. |

## 기술 스택

| 구분 | 스택 |
|---|---|
| 앱 | Tauri 2 (macOS Apple Silicon · Windows x64) |
| Frontend | SvelteKit 2 + Svelte 5 (룬) + TypeScript 5 + Vite 6 |
| Backend | Rust (`std::fs`/`std::path` 중심, 외부 crate 최소) |
| 에디터 | CodeMirror 6 |
| 마크다운 | markdown-it 14 + js-yaml + 자체 wikilink 룰 + highlight.js |
| 검색 | MiniSearch (BM25 + 한글 bigram, Web Worker + shard 디스크 캐시) |
| 다이어그램 | Mermaid |
| MCP | Node (SDK 무의존, 호출 시점 esbuild 번들) |
| 테스트 | Vitest |

> 검색은 초기에 tantivy + lindera였습니다. v1.3.0에서 **제거**하고 MiniSearch로 옮겼습니다.

## 프로젝트 구조

```text
lapis/
├── src/                     # SvelteKit 프론트엔드
│   ├── lib/
│   │   ├── stores/          # 도메인별 writable store (vault, editor, tags, …)
│   │   ├── tauri/           # Rust 명령의 typed 래퍼
│   │   ├── keymap.ts        # 전역 단축키 매칭 (실행은 호출자가)
│   │   ├── searchIndex.ts   # fuzzy + MiniSearch 풀텍스트
│   │   ├── linkIndex.ts     # wikilink/md link resolver + 백링크
│   │   └── *.svelte         # Sidebar · Editor · SearchModal · CommandPalette …
│   ├── app.css              # 디자인 토큰 (테마의 단일 진실원)
│   └── routes/+page.svelte  # 워크스페이스
├── src-tauri/               # Rust 백엔드 (Tauri host)
│   └── src/
│       ├── vault.rs         # list/read/write_note · scan_links · read_vault_bundle
│       ├── search_cache.rs  # 풀텍스트 인덱스 디스크 캐시 (meta + shard)
│       └── paths.rs         # 앱 데이터 경로 (dev / 릴리즈 분리)
├── mcp/                     # 지식 질의 MCP 서버 + 검색 품질 계측 하네스
└── static/
```

## 개발

**요구사항** — Node LTS와 Rust stable(Tauri 2 요구 버전), 그리고 플랫폼별 툴체인:

- **macOS** — Xcode Command Line Tools.
- **Windows** — Visual Studio Build Tools의 **C++를 사용한 데스크톱 개발** 워크로드(MSVC 링커. Rust의
  `x86_64-pc-windows-msvc` 타깃은 이게 없으면 링크 자체가 안 됩니다)와 WebView2 런타임(Windows 11 기본 탑재).

> ⚠️ **Windows에서 `cargo`는 Git Bash가 아니라 PowerShell에서 돌리세요.** Git이 자체 `link.exe`(coreutils
> `link`)를 `PATH`에 올려 MSVC 링커를 가립니다. 증상은 `error: linking with `link.exe` failed`에
> `Try 'link --help'` 힌트가 붙어 나오는데, 실제 원인과 전혀 다른 곳을 가리킵니다.

```bash
npm install
npm run tauri dev
```

검증:

```bash
npm run check                  # Frontend 타입 체크 (svelte-check)
npm run check:mcp              # MCP 타입 체크 (루트 check는 src/ 만 봅니다)
npm run test                   # Vitest
cd src-tauri && cargo check    # Rust 타입 체크
```

빌드:

```bash
npm run tauri build                                    # 호스트 플랫폼 (macOS app + dmg / Windows nsis)
npm run tauri build -- --target universal-apple-darwin # macOS universal binary
npm run tauri build -- --bundles nsis                  # Windows 인스톨러만
```

> ⚠️ **dev 빌드와 설치본은 앱 데이터 디렉터리가 분리돼 있습니다**(`com.lapis.dev-dev` vs `com.lapis.dev`). 예전엔 공유해서 두 빌드가 서로의 검색 캐시를 덮어쓰며 재인덱싱을 반복했습니다. → `src-tauri/src/paths.rs`

## 트러블슈팅

**앱이 열리지 않습니다 / "확인할 수 없는 개발자" (macOS)**
직접 빌드한 앱은 서명이 없어 Gatekeeper가 막습니다. `xattr -dr com.apple.quarantine /Applications/Lapis.app` 후 다시 여세요.

**"Windows의 PC 보호" 경고 (Windows)**
빌드에 서명이 없어 SmartScreen이 먼저 경고합니다. **추가 정보 → 실행**을 누르면 됩니다.
이 빌드들 뒤에는 코드 서명 인증서가 없으며, 빌드·실행에 서명이 필요하지도 않습니다.

**검색 결과가 안 나옵니다**
첫 인덱싱이 아직 도는 중일 수 있습니다. 태그·백링크가 비어 보이는 것도 같은 이유입니다. 큰 vault는 잠시 기다리세요.

**태그를 본문에 `#태그`로 적었는데 안 잡힙니다**
의도된 동작입니다. frontmatter `tags:`만 인덱싱합니다.

**MCP 서버가 클라이언트에 뜨지 않습니다**
클라이언트는 서버를 최소 환경으로 띄우기 때문에 homebrew node를 못 찾을 수 있습니다. 래퍼가 후보 경로를 훑지만, 특이한 위치에 있으면 `LAPIS_NODE`로 절대 경로를 주세요. 자세한 내용은 [`mcp/README.md`](mcp/README.md).

**MCP 응답에 `stale`이 붙어 나옵니다**
vault가 캐시보다 새롭다는 뜻입니다. 앱이 떠 있으면 watcher가 갱신하지만 **커밋까지 10~20초** 걸립니다. 몇 건이면 보통 결과에 영향이 없고, 수백 건이면 앱이 꺼져 있었다는 신호입니다.

## 기여

개인 편의를 위해 만든 도구라 로드맵은 제 사용 패턴을 따라갑니다. 제가 쓰지 않는 기능은 우선순위가 낮고, 요청을 받아도 못 넣을 수 있습니다.

그래도 버그 리포트는 **환영합니다** — 제가 안 밟아본 경로에서 깨지는 걸 알 방법이 그것뿐입니다. [Issues](https://github.com/eren0315/lapis/issues)에 재현 절차와 OS·버전(macOS / Windows)을 남겨 주세요. PR을 보내실 거면 먼저 이슈로 방향을 맞춰 주세요.

## 라이선스

MIT
