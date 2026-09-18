# Lapis

> A personal knowledge workbench for navigating local Markdown through **backlinks, tags, and full-text search** — macOS and Windows

**English** · [한국어](README.ko.md)

[![CI](https://github.com/eren0315/lapis/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eren0315/lapis/actions/workflows/ci.yml)
![version](https://img.shields.io/github/v/tag/eren0315/lapis?label=version&color=1f6feb)
![platform](https://img.shields.io/badge/platform-macOS_11%2B_%7C_Windows_10%2B-black)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-blue)

Lapis is a desktop app tuned for **reading and finding** things in a Markdown pile you already have. It is not a tool for writing new notes — it is a tool for following the connections between thousands to tens of thousands of documents.

Your files live only on your local filesystem. No accounts, no cloud sync, no telemetry. All the app does is read `.md` files, build indexes, and — when asked — write atomically.

> ⚠️ **I built this for my own use.** It is shaped around how I work (mostly reading and browsing), and it has no QA and no beta testers. **There will be bugs**, and paths I don't personally exercise are only shallowly verified. You're welcome to use it (MIT), but **please back up notes that matter, or keep them under git.**

**Three things that make it different**

- **Reading is the default** — the first thing you see is a rendered preview; the editor comes out only when you ask for it with `⌘E`.
- **Built for Korean search from the start** — BM25 ranking over a Korean bigram index, so terms match even with particles and inflectional endings attached.
- **An index an agent can use** — the search index the app builds is exposed through an MCP server, so Claude Code can query the same vault.

---

## Features

### Reading-first workflow

- **One view at a time** — the left rail picks files, tags, filters, or favorites. Clicking the active icon collapses the sidebar (`⌘B` still works).
- **One toggle, `⌘E`** — preview (markdown-it) ↔ editor (CodeMirror 6). Not two modes; one toggle.
- **Adjustable measure** — 40–88em via the Aa popover, narrowing long documents to a comfortable column width.
- **Your reading position carries over** — move between editor and preview and you stay in the section you were reading.
- **Outline** (`⌘⇧O`) — jump within a document through its heading list.
- **Context panel** (`⌘⌥B`) — properties, outline, relations, and assets as segmented tabs beside the body.
- **Color** — one dark palette with 26 accent presets. Beyond that, override the tokens with custom CSS in settings.
- **Density and animation** — three steps each under Settings → Appearance (cozy/default/compact, system/minimal/full). Density changes spacing only; text size stays put.

### Connections between documents

- **Wikilinks** — jump with `[[Note name]]`. `[[...]]` inside fenced code blocks and inline code is **not** treated as a link (e.g. `[[String: Any]]` is code, not a link).
- **Point at a heading** — `[[Note#Heading]]` opens the note and scrolls to that heading. `[[#Heading]]` moves within the current document. If the heading is not there, the note opens and stays put.
- **Callouts** — `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. The same five GitHub supports, and only those, so a document looks the same in both places. An unknown type stays an ordinary blockquote, and on tools without callouts the whole thing degrades to one.
- **Pull another note in** — `![[Note]]` expands the whole note inline; `![[Note#Heading]]` expands just that section. Pulled-in content is marked with a border, and when it cannot be pulled in, **the reason stays in its place** rather than leaving a gap. Cycles and chains deeper than three are cut.
  - A note whose *name* contains `#` (`C#.md`) wins: the whole target is looked up first, and only a miss is read as an anchor.
- **Backlinks panel** — every document pointing at this one. Reverse references are the primary way to navigate.
- **Frontmatter cross-refs** — `related`, `amends`, and `superseded_by` are indexed separately, **preserving the relation type**. "The document that corrected this one" doesn't get mixed in with "merely related".
- **Automatic link updates** — rename a file and references to it are followed and fixed, after a **dry-run preview** and a **backup**.

### Search — four layers

| Layer | Shortcut | Engine | When to use |
|---|---|---|---|
| Filename fuzzy | `⌘P` | in-house fuzzy | you roughly know the filename |
| Full-text | `⌘⇧F` | MiniSearch (BM25 + Korean bigram) | you're searching by content |
| Within document | `⌘F` | regex · case · whole word | inside the note you have open |
| Whole vault, literal/regex | `⌘⇧G` | Rust `regex`, walked in parallel | the wording differs from what you remember |

The last one exists because BM25 and grep **fail in opposite directions**. Measured on this vault:
in `_memories`, grep returned nothing for 4 of 4 questions (the notes say "창", the query said
"윈도우"), while BM25 drowned the good hits in that same tree. One arm cannot reach what the other
is buried under, so both are here. Clicking a result opens in-document search with the same pattern,
so you land on the match rather than at the top of the note.

The full-text index is built in a **Web Worker** and **cached to disk per shard**, so restarting the app doesn't re-read everything from scratch.

### Saved queries inside a note

A fenced block runs where it sits and shows what matches:

````
```lapis-query
doc_kind: plan, adr
topic: overview
tag: subject
text: windows
limit: 20
```
````

It reuses the same matcher the table view uses, so a query cannot mean one thing in a table
and another inside a note. Results are ordinary wikilinks, so clicking one behaves exactly like
any other link — including how an ambiguous name is resolved.

The block always says **how many** matched, and says so again when the list was cut short; a
truncated list that looks complete is worse than no list. A query it cannot read is shown as an
error in place rather than as an empty result — an empty result would read as "no such notes".

Tags match by exact name or nested prefix — `subject` finds `subject/ui` too — and the
rule lives in one module shared with the app's own filtering and the query engine, so the same
tag question cannot get different answers on different surfaces. Nothing is written back into
the note.

### Tags

- **Only frontmatter `tags:`** is indexed. Inline hashtags in the body are deliberately ignored — there's no reliable way to tell them apart from `#define` in code or a URL fragment like `#section`.
- **Nested kebab-case** — build a hierarchy with `/`, as in `tech/svelte5` or `issue/atomic-write`, and the sidebar renders it as a prefix tree.
- Click a tag to narrow the view to its documents.
- **Rename or merge a tag across the vault** from the Command Palette. Child tags follow: renaming
  `tech` to `stack` turns `tech/svelte5` into `stack/svelte5`. It runs as a dry-run first, backs the
  affected notes up, and rolls back if a write fails — the same machinery a note rename uses.

### Tabs and windows

- `⌘T` new tab · `⌘P` replaces the active tab · `⌘W` close · `⌘1`–`⌘9` select
- `⌘,` / `⌘.` (or `⌘⌃←` / `⌘⌃→`) walk back and forward through visit history
- **`⌘⇧T` opens a new window — each window can hold a different vault.** Useful for keeping personal notes and project docs side by side.
- **Side-by-side in one window** — right-click a note in the tree and open it beside what you are reading.
  The side pane is **read-only** (no tabs, no editor, no in-document search); its links move the main pane,
  and it closes itself if the main pane arrives at the same note.

### Getting content out

- **Mermaid** code blocks render (colors adapt to the theme) and export to **PNG**
- **Self-contained HTML export** — a single `.html` with styles inlined, so it looks the same wherever you open it
- **Copy as rich text** — paste into a wiki, an email, or a messenger and formatting survives
- **Reveal in Finder** — open the current note's location directly
- **Vault git version control** — if your vault is a git repository, the app works with its changes

---

## Installation

**No prebuilt binaries are published.** Build from source — requirements and commands are under [Development](#development) below.

```bash
git clone https://github.com/eren0315/lapis.git
cd lapis
npm install
npm run tauri build
```

The output lands in `src-tauri/target/release/bundle/`.

- **macOS** — move `Lapis.app` into `/Applications`.
- **Windows** — run the installer under `bundle/nsis/`. (An MSI is not built by default; `npm run tauri build -- --bundles msi` produces one on demand.)

> This is a personal tool, not built with distribution or support in mind. Day-to-day development happens on
> macOS 11+ / Apple Silicon; Windows 10+ (x64) is kept working by CI, which runs the Rust checks and tests on
> both. Windows sees far less hands-on use, so expect rougher edges there.

Per-version changes live in [`CHANGELOG.md`](CHANGELOG.md) — this repository does not use GitHub Releases, so that file stands in for release notes. A Korean translation is at [`CHANGELOG.ko.md`](CHANGELOG.ko.md).

## Getting started

1. Use **Open Vault…** on the start screen to pick a folder containing `.md` files. An empty folder is fine. Vaults you have opened stay in the **Recent** list on that screen.
2. The first index build runs. It creates links, tags, and full-text in one pass — a few seconds at around 1,000 notes. It **does not block the file tree**, so you can open documents while it works.
3. `⌘P` finds files by name, `⌘⇧F` by content.
4. Write `[[Another note]]` in any note, then check that note's **Backlinks** to see the reverse reference appear.
5. For everything else, `⌘K` — every command lives in the Command Palette.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Command palette — opens in the mode you used last; `⇥` cycles All · Files · Content · Commands |
| `⌘P` | Quick File Open (filename fuzzy) — replaces the active tab |
| `⌘⇧F` / `⌘⇧P` | Full-text search |
| `⌘⇧G` | Search the whole vault by literal text or regex |
| `⌘F` | Find within the current note |
| `⌘E` | Toggle read ↔ edit |
| `⌘⇧E` | Focus the file tree filter |
| `⌘N` | New note |
| `⌘S` | Save now (autosaves every 2s while editing) |
| `F2` | Rename the current note |
| `⌘⌫` | Move the current note to Trash |
| `⌘T` | New tab |
| `⌘⇧T` | New window (a different vault per window) |
| `⌘W` | Close tab |
| `⌘1`–`⌘9` | Switch to that tab |
| `⌘,` / `⌘.` | Visit history back / forward |
| `⌘⌃←` / `⌘⌃→` | Visit history back / forward |
| `⌘B` | Collapse/expand the sidebar |
| `⌘⌥B` | Collapse/expand the context panel |
| `⌘⇧B` | Overview (notes as a table) |
| `⌘⇧O` | Outline |
| `⌘⇧C` | Copy the current note's path |

> On Mac Magic Keyboards `F2` is screen brightness by default. Use `Fn+F2`, or turn on "Use F1, F2, etc. keys as standard function keys" in Keyboard settings. Otherwise `⌘K` → "Rename".

---

## Language

The interface is available in **English and Korean**. By default it **follows your OS language**, falling back to English when that language is not supported. Pick System / 한국어 / English under Settings → **Language**.

The Welcome sample note created in an empty vault is written in whatever language is active at the time. Files that already exist are left alone when you switch languages.

## Command line — `lapis`

The same index is reachable from a terminal without the app running.

```bash
cli/lapis search "multi window" --min-rel 0.3
cli/lapis links --broken
cli/lapis status
```

On Windows (PowerShell/cmd), call the `.cmd` twin:

```powershell
cli\lapis.cmd search "multi window" --min-rel 0.3
```

`--json` on any command prints the same shape the MCP tool returns, so scripts and agents do not
have to learn a second format. The contract, exit codes and the layered plan for what is **not**
built yet live in [`cli/README.md`](cli/README.md).

## Claude Code integration — knowledge query MCP

The search index Lapis builds is exposed through an MCP server. There is exactly **one** tool (`lapis_query`).

```json
{
  "mcpServers": {
    "lapis": { "command": "/absolute/path/to/lapis/mcp/lapis-mcp" }
  }
}
```

On Windows, point at the `.cmd` twin — the extensionless one is a shell script Windows cannot run,
and the client only sees "the server won't start".

```json
{ "mcpServers": { "lapis": { "command": "C:\\path\\to\\lapis\\mcp\\lapis-mcp.cmd" } } }
```

It answers structural queries (`doc_kind`, `topic`, `tag`, `backlinks_of`) and BM25 full-text in a single call. No LLM, no API key — the same arguments produce the same result.

> ⚠️ **Queries are blocked by default.** Turn them on in the app under **Settings → MCP query → Allow**.
> That switch only governs **whether queries are answered**. `lapis-mcp` is a stdio server, so the
> process itself is spawned by the Claude client — to stop it from starting at all, remove the
> `lapis` entry from `mcpServers` above.

**Honest limitations** (measured on a vault of 19,000+ documents):

- **It does not replace grep.** grep has higher recall (100% on AND search vs R@10 89.4%). What this tool adds is **ranking**.
- **Reference tracing (`backlinks_of`) is the one decisive win.** A question that cost grep 3 calls, 15.9 KB, and 3 false positives is answered in 1 call, 1.6 KB, 0 false positives.
- **The app is the index producer.** The MCP server only reads the cache. If the vault is newer than the cache the response carries a `stale` field, but it **does not block** — a hard failure is itself a judgment, and this server doesn't make judgments.

The contract, error kinds, and measurements are in [`mcp/README.md`](mcp/README.md).

---

## Design principles

| Principle | Implementation |
|---|---|
| **Local only** | There is no networking code. No accounts, no sync, no telemetry. |
| **Never a partial write** | Saving is `temp file → POSIX rename` — written in the same directory, then swapped in atomically. On failure the temp file is cleaned up. |
| **No path escape** | The vault root is canonicalized and checked with `starts_with`; extensions are restricted by whitelist. |
| **One index producer only** | Two scanners always drift apart. Wikilink, Markdown-link, and frontmatter extraction live only in Rust, and the MCP server reads what they produce. |
| **Minimal dependencies** | The Rust side stays close to `std::fs` and `std::path`. |

## Tech stack

| Area | Stack |
|---|---|
| App | Tauri 2 (macOS on Apple Silicon · Windows x64) |
| Frontend | SvelteKit 2 + Svelte 5 (runes) + TypeScript 5 + Vite 6 |
| Backend | Rust (`std::fs`/`std::path`-centric, minimal external crates) |
| Editor | CodeMirror 6 |
| Markdown | markdown-it 14 + js-yaml + a custom wikilink rule + highlight.js |
| Search | MiniSearch (BM25 + Korean bigram, Web Worker + shard disk cache) |
| Diagrams | Mermaid |
| MCP | Node (no SDK dependency, bundled with esbuild at call time) |
| Tests | Vitest |

> Search originally ran on tantivy + lindera. That stack was **removed** in v1.3.0 in favor of MiniSearch.

## Project layout

```text
lapis/
├── src/                     # SvelteKit frontend
│   ├── lib/
│   │   ├── stores/          # writable stores per domain (vault, editor, tags, …)
│   │   ├── tauri/           # typed wrappers for Rust commands
│   │   ├── keymap.ts        # global shortcut matching (callers perform the effect)
│   │   ├── searchIndex.ts   # fuzzy + MiniSearch full-text
│   │   ├── linkIndex.ts     # wikilink/md-link resolver + backlinks
│   │   └── *.svelte         # Sidebar · Editor · SearchModal · CommandPalette …
│   ├── app.css              # design tokens (single source of truth for theming)
│   └── routes/+page.svelte  # the workspace
├── src-tauri/               # Rust backend (Tauri host)
│   └── src/
│       ├── vault.rs         # list/read/write_note · scan_links · read_vault_bundle
│       ├── search_cache.rs  # full-text index disk cache (meta + shards)
│       └── paths.rs         # app data paths (dev / release split)
├── mcp/                     # knowledge query MCP server + search quality harness
└── static/
```

## Development

**Requirements** — Node LTS and Rust stable (the version Tauri 2 requires), plus the platform toolchain:

- **macOS** — Xcode Command Line Tools.
- **Windows** — Visual Studio Build Tools with the **Desktop development with C++** workload (the MSVC linker;
  Rust's `x86_64-pc-windows-msvc` target cannot link without it), and the WebView2 runtime (preinstalled on
  Windows 11).

> ⚠️ **On Windows, run `cargo` from PowerShell, not Git Bash.** Git ships its own `link.exe` (the coreutils
> `link`) on `PATH`, which shadows the MSVC linker. The failure surfaces as `error: linking with `link.exe`
> failed` with a `Try 'link --help'` hint, which points nowhere near the real cause.

```bash
npm install
npm run tauri dev
```

Checks:

These match `.github/workflows/ci.yml` one for one. A state that passes only one side is not a passing state.

```bash
npm run check       # frontend type check (svelte-check)
npm run check:mcp   # MCP type check — the root check only covers src/
npm run check:cli   # CLI type check — same reason
npm test            # Vitest (src/ + mcp/ + cli/)
npm run build       # Vite build
```

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings   # warnings are errors
cargo check --all-targets --locked
cargo test --locked
```

### Previewing hard-to-reach screens

Some surfaces need real vault state before they show anything — the vault diagnostics modal, and the
find-and-replace panel inside `⌘⇧G`. To look at them without building that state by hand:

```bash
npm run dev
```

Then open `/dev/preview`. It runs **without Tauri** — every value is a fixture — and lets you
switch surface and theme. Useful for checking colour, spacing and alignment, which the DOM tests
cannot see (happy-dom has no layout engine).

> The fixtures deliberately fill every tab and trigger every warning at once. A screen with one
> section populated hides whether the others render at all.

The same dev server also runs **the whole app** at `/`, against an in-memory fixture vault that
opens by itself. The status bar shows a `FIXTURE` badge so a preview is never mistaken for the real
thing. Unknown backend commands throw rather than returning `undefined`, so gaps in the fake are
visible instead of silently passing.

> ⚠️ **It answers one question: does this draw correctly.** Atomic writes, path-escape checks, the
> watcher, the disk cache and git are not simulated — what works here is no evidence it works in the
> app. None of it ships: the fake is behind `import.meta.env.DEV` and reached through a dynamic
> `import()`, and a test scans the production build to prove it is absent.

#### Measuring styles when the tab is not on screen

If you drive that preview from a tool rather than looking at it, watch for one trap: while the tab
is hidden (`document.hidden`), **the computed style of an element that already exists stops being
updated**. Adding a class, or even setting `el.style.background` directly, leaves
`getComputedStyle` returning the old value — no error, just a wrong number. Reading it and
believing it sends you off to fix CSS that was never broken.

Freshly inserted nodes *are* computed correctly, so clone what you want to measure:

```js
const a = el.cloneNode(true), b = el.cloneNode(true);
b.classList.add("active");
el.parentElement.append(a, b);
// getComputedStyle(a) vs getComputedStyle(b) — the real difference
a.remove(); b.remove();
```

`requestAnimationFrame` does not fire at all in that state either (measured: zero callbacks in
1.5s). That is a property of the platform, not of the preview — it is why `yieldToPaint()` races
rAF against a timer instead of awaiting it. Screenshots need the pane actually on screen, so
anything that needs eyes — layout, alignment, spacing — still belongs in a real window.

The same frozen clock has one more consequence worth knowing before you conclude anything is
broken: **Svelte transitions never finish**, so a closed modal is faded out but never removed.
`document.getAnimations()` shows every animation `running` with `currentTime: 0`. Asking whether the
node is still in the DOM will tell you the modal "did not close", the close button "does nothing",
and two modals are "open at once" — all three false. Measure the state instead (computed `opacity`,
`aria-*`, whatever the store drives), not whether the element is gone.

Finally, after editing a file, **reload the page** before trusting what you measure. Accumulated
hot-module updates leave stale handlers behind: a table whose header clicks quietly stop sorting is
the preview, not the code.

Builds:

```bash
npm run tauri build                                    # host platform (macOS app + dmg / Windows nsis)
npm run tauri build -- --target universal-apple-darwin # macOS universal binary
npm run tauri build -- --bundles nsis                  # Windows installer only
```

### Replacing the app icon

`src-tauri/icons/` is generated. Regenerate the whole set from a square 1024px source:

```bash
npm run tauri icon path/to/icon-1024.png
```

That also writes `android/` and `ios/` sets — delete them; neither is a target here.

> ⚠️ **Editing the icon files alone is not enough on Windows.** The `.ico` is compiled into the
> executable by a build script, and Cargo does not rerun that script when only the icon changes.
> The build succeeds, `icon.ico` on disk is correct, and the shipped `.exe` **keeps the old icon**.
> Touch `src-tauri/tauri.conf.json` (or `cargo clean -p lapis`) to force it, then verify the binary
> itself rather than the file you edited:
>
> ```powershell
> Add-Type -AssemblyName System.Drawing
> [System.Drawing.Icon]::ExtractAssociatedIcon("src-tauri/target/release/lapis.exe").ToBitmap().Save("check.png")
> ```

> ⚠️ **Dev builds and the installed app use separate app data directories** (`com.lapis.dev-dev` vs `com.lapis.dev`). They used to share one, so the two builds kept overwriting each other's search cache and re-indexing. → `src-tauri/src/paths.rs`

## Troubleshooting

**The app won't open / "unidentified developer" (macOS)**
A self-built app is unsigned, so Gatekeeper blocks it. Run `xattr -dr com.apple.quarantine /Applications/Lapis.app` and open it again.

**"Windows protected your PC" (Windows)**
The build is unsigned, so SmartScreen warns before running it. Choose **More info → Run anyway**. There is no
code-signing certificate behind these builds, and signing is not required to build or run the app.

**No search results**
The first index build may still be running — the same reason tags and backlinks can look empty. Give a large vault a moment.

**I wrote `#tag` in the body and it isn't picked up**
That's intended. Only frontmatter `tags:` is indexed.

**The MCP server doesn't show up in my client**
Clients launch servers with a minimal environment, so a homebrew node may not be found. The wrapper probes candidate paths, but if yours lives somewhere unusual, point at it with `LAPIS_NODE`. See [`mcp/README.md`](mcp/README.md).

**MCP responses come back with `stale`**
The vault is newer than the cache. A running app's watcher refreshes it, but **commits take 10–20 seconds**. A handful of entries usually doesn't affect results; hundreds mean the app wasn't running.

## Contributing

This is a tool built for my own convenience, so the roadmap follows how I use it. Features I don't use are low priority, and I may not be able to take a request even after hearing it.

Bug reports are genuinely **welcome**, though — they're the only way I learn where things break on paths I never walk. Please include reproduction steps and your OS and version (macOS / Windows) in [Issues](https://github.com/eren0315/lapis/issues). If you plan to send a PR, open an issue first so we can agree on direction.

## License

MIT
