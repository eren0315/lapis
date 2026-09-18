# Changelog

**English** · [한국어](CHANGELOG.ko.md)

Version history for Lapis. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
trimmed down for a one-person project. Versioning follows [Semantic Versioning](https://semver.org/) loosely.

> **No binaries are published.** Nothing is attached to GitHub Releases — only tags are pushed.
> Build from source as described in [the README's install section](README.md#installation).

> **⚠️ History rewrite notice (2026-08-18)** — the whole history was rewritten with `git filter-repo`
> when the repository moved to a personal account. **Every commit SHA before v1.10.0 changed.** Tags were
> updated to point at the new SHAs, but old SHA references in external documents and PR pages no longer resolve.

---

## [Unreleased]

### Fixed

- **The bundle config promised installers it never produced.** With `"targets": "all"` only the NSIS
  installer was built, with no error and no warning, and the MSI had been silently absent for
  **thirteen releases** before anyone noticed. The documentation says `"all"` means every supported
  format; the measurement disagreed, and why they differ is still unknown — WiX works fine and
  `--bundles msi` produces the installer on demand. The config now lists what to build explicitly, so
  it states what actually happens; naming the macOS targets alongside the Windows one is safe on both
  machines. MSI is no longer part of the default set. `npm run bundle:check` now verifies that every
  promised bundle exists for the current version, and a test prevents the config from going back to
  `"all"`.

## [3.11.0] — 2026-09-01

### Added
- **Searching still works when the Korean IME was left on.** If the palette finds nothing, it
  retries once with the keyboard layout reversed and says which query produced the results. This
  came out of the usage log rather than a guess: **seven of the nine** queries that returned zero
  results were Latin words typed through the Korean IME, and the note being looked for was in the
  vault the whole time. The 2-beolsik/QWERTY mapping is a fixed table, not an edit-distance guess,
  so it does not carry the false-positive risk that kept typo detection out of the tag audit. A
  query that already returns results is never touched — this is a back door that opens only at a
  dead end, and if the reversed query is also empty the original empty result stands. The opposite
  direction (Korean typed with the English IME) is deliberately absent: it needs a syllable-
  composing automaton, and the log contains no instance of it.
- **A "says done" check in the vault diagnostics.** It counts notes whose frontmatter claims the
  work is finished while the body still holds `- [ ]`. The app's diagnostics screen,
  `lapis doctor` and MCP's `audit:"decay"` all call the **same** function. Notes with no
  `status`, or a status outside the vocabulary, are **left out** — a checklist is supposed to stay
  unchecked, and a list that mixes in false positives stops being trusted. This does not break the
  audits' rule against judging: unlike inferring that two words are synonyms, both statements here
  belong to the same note, so it is counted rather than inferred. It reports **0** on the measured
  vault — the one note that prompted it was fixed the same day, so this is insurance, not a result.
- **Ask `status` by lifecycle, not by word — `@done`, `@active`, `@todo`.** People name the
  same state differently depending on the kind of document, and to code those are simply different
  strings, so asking with one literal quietly matched half of what was there — no error. In the
  measured vault, `status=완료` found 15 notes and `status=@done` found 41 of the 53 that carry a
  status. Both surfaces take the groups (`{"status":["@done"]}` for MCP, `--props status=@done`
  for the CLI). **An unknown group is an error**, because a typo returning zero hits reads exactly
  like a correct answer, and `@` on any other axis is an error rather than a silent no-op.
  This is a table a person declared, not synonyms a machine inferred — the vault audit still refuses
  to call two words synonyms. The table lives in one file and `npm run check:arch` blocks copies of
  it; when the rule went up it found three copies already, and **every one of them listed two of the
  five words**.
- **Saved queries inside a note.** A `lapis-query` fenced block runs where it sits and lists
  what matches, by `doc_kind`, `topic` and free text. It calls the same matcher the table
  view uses, so a query cannot mean one thing in a table and another in a note, and results are
  ordinary wikilinks, so clicking one goes through the same rule as every other link. The block
  states how many matched and says so again when the list was cut short — a truncated list that
  looks complete is worse than no list — and a query it cannot read is shown as an error in place,
  because an empty result would read as "no such notes". Nothing is written back into the note,
  including a `tag` axis that matches by exact name or nested prefix (`subject` finds `subject/ui`).

### Fixed
- **The diagnostics screen kept three different lists of its own tabs.** The modal knew nine, the
  type documented as "shared by the modal and the palette" knew seven, and the palette reached five —
  so four tabs had no direct palette command, and the type not knowing two of them meant a command
  could not even be added without a compile error. The comment above that list had predicted this
  exact failure once before; the cause was the same both times, a list maintained by hand. The list
  now has one owner, and the label table is typed so that adding a tab without a label fails to
  compile; the other direction is covered by a test.
- **The help text hard-coded how many checks `doctor` runs, and went stale.** The CLI help said
  four and the README said five while it actually runs seven. The counts are gone, and a test keeps
  them from coming back.
- **The watcher treated directory events as notes.** The usage log had accumulated **43** occurrences
  of a failed incremental reindex, and every path was a directory. The Rust side forwards directory
  events on purpose (to notice renames), but the frontend heard "a note changed" — the scan failed,
  and the recency map and the "changed while you were away" marks were polluted with directories.
  The failure was silent: the loop continued, other notes indexed fine, and the human-readable report
  showed only a bare "50 warnings". Events are now sorted into note / ignore / full reload: a
  directory being modified or created is ignored (the file events inside cover it), while one being
  removed or renamed triggers a full reload, since its scope cannot be known from the event. That
  second case previously left the index holding the old paths.
- **`lapis usage` showed only half of what it computed.** Named error counts, the notes actually
  opened, and the commands never used were available in `--json` and absent from the human report.
  Reading "most used command: open:note 3" suggested the app was barely used, when opens actually
  totalled **31** — that line counts only palette-initiated commands. Lists that get truncated now
  say so.
- **Examples inside code blocks were counted as open tasks.** Three places answered "which lines
  are code" differently: `linkRewrite` got it right with a markdown-it block parse but kept that
  function **private**, so the task scanner used a line toggle (missing indented code blocks) and
  the unlinked-mention masking used a regex (missing `~~~` fences and indented code blocks). The
  failure is silent — counting an example as a task only inflates a number, and the decay audit
  would call a perfectly consistent note contradictory over one example. One owner now holds the
  rule and `check:arch` blocks copies. A regex cannot fix this: **nested tasks are also indented
  four spaces**, so treating four spaces as code destroys task depth; only a block parser separates
  list continuation from code. Parsing every note measured 18× slower, so only notes that contain a
  checkbox-shaped line (6% here) reach the parser. The measured vault had **zero** real
  occurrences — this is insurance, not a result.
- **`lapis tasks audit --json` and `lapis stats --json` emitted absolute paths.** Every other
  CLI JSON surface returns vault-relative ones, and `cli/README.md` promises the output mirrors
  `lapisQuery()`. The failure is silent: each command looks fine on its own, and intersecting two
  of them yields **zero rows** rather than an error. The handler built its relativizer and used it
  only for filtering, never for the output — the human-readable line had it right all along. A test
  now walks **every** `--json` surface, so the next audit is covered too.
- **Notes that could not be read were dropped without saying so.** Counting open tasks needs
  the note bodies, and when a note in the cache is gone from disk — or unreadable — five
  places quietly skipped it. So "12 open" could mean twelve, or twelve plus however many
  were skipped, with nothing to tell the two apart. The same file had already added a
  "where are they concentrated" number because a bare count hides things; the denominator
  itself could be wrong. Reading and counting now live in one place, and both `lapis_stats`
  and `tasks audit` report how many were skipped — but only when it is not zero, because a
  noisy normal stops being read.

- **`.mmd` notes were only half supported.** The app treats `.mmd` as a first-class note —
  Rust indexes it, the watcher watches it, the new-note dialog knows it — but three paths
  still assumed `.md`:

  - `lapis new diagram.mmd` created **`diagram.mmd.md`**. Rust's own rename check had it right.
  - Renaming a `.mmd` note **silently broke incoming markdown links**: the pattern only
    matched `.md`, and the replacement hardcoded `.md` regardless of what it found.
  - Clicking a `.mmd` link, and resolving one in a query, stripped only `.md`.

  The rule for what counts as a note extension now lives in one module, and the architecture
  gate fails the build if it is written anywhere else. A comment had claimed single ownership
  for a long time; eight places had drifted from it, and three of those were wrong.

- **The same tag question could get two answers.** The query engine compared tags after
  Unicode normalisation only, while the app's tag index also lowercased them — so
  `subject/UI` and `subject/ui` were one tag in the sidebar and two in a `tag:` query.
  Both now go through one module. Measured on this vault the gap was **zero**: none of the
  85 tags differ only by case. This is insurance, not a win.

- **The caller gave up two seconds before the app explained itself.** When nobody claims a
  render request the app writes a failure file saying so, but that only happens after its
  own 15.5 second wait — and the default limit on the calling side was 20 seconds. Measured
  end to end, the file lands at about 18 seconds. A slightly slower window meant the user
  saw "the app produced nothing in time" instead of the actual reason, exactly when the
  precise diagnosis mattered. The limit is now 25 seconds, and it lives in one place
  instead of the four it had been copied into.

- **A second rename could leave the first one waiting forever.** The link-rewrite consent
  modal is held in a store slot that carries the caller's resolve callback, and the slot
  could simply be overwritten. When that happened nobody ever answered the first request,
  so the rename sat on an unresolved promise — no error, no timeout, and the note ended up
  renamed with its incoming links untouched. Global shortcuts are not suppressed while a
  modal is open, so a second rename was reachable.

  The store now owns the pair: a new request cancels the pending one, and settling resolves
  and clears in a single step. Nothing outside can set the slot directly.

  The modal itself had no tests at all despite being the consent gate for a write that
  touches many files at once. All four ways of closing it are now pinned, along with the
  default focus sitting on **cancel** — one stray Enter must not apply an irreversible write.

## [3.10.0] — 2026-08-29

> The MCP server can now drive the app, and the CLI can sit in the middle of a pipe.
> One tool became eight; fourteen commands became twenty-one.

### Added
- **Seven new MCP tools.** `lapis_query` was the only one, and it could only read. Now:
  `lapis_stats` (vault totals), `lapis_usage` (usage-log rollup), `lapis_index` (headless
  reindex), `lapis_export_html`, `lapis_open` (open a note in the running app),
  `lapis_reveal` (open the containing folder), and `lapis_render` (app-quality HTML, and
  mermaid diagrams as PNG).

- **`lapis_render` renders through the app, not beside it.** Mermaid, math and user CSS only
  exist in a browser. Rendering them a second time inside the MCP server would mean two
  renderers that drift — the single most common defect in this repository. Instead the request
  goes over the existing argv channel, the app draws it, and the file lands where you asked.
  Slower, but it cannot disagree with what you see on screen.

- **`lapis_export_html` runs without the app** and says where it differs. Its `differs_from_app`
  field names what the standalone converter cannot reproduce (mermaid, math, user CSS, wikilink
  resolution). A difference is **not** an error; an unreported difference is.

- **Seven new CLI commands.** `read` (note body; `-` reads the path from stdin), `stats`,
  `usage`, `new`, `config`, `diff`, and `completion` for bash/zsh/pwsh.

- **The CLI fits in a pipe.** `--quiet` drops the human-facing lines, and `read -` takes its
  path from stdin, so this works:
  `lapis search q --json | jq -r '.results[0].path' | lapis read -`

- **`config` gives settings a second pair of eyes.** `mcp_enabled` could only be flipped from
  the app. When that toggle silently did nothing there was no other way to look, so the search
  for a cause started in the wrong place. Two readers disagree loudly.

### Added
- **`lapis render`** hands a note to the running app and takes back what the screen shows —
  app-quality HTML, or the first mermaid diagram as a PNG. `export` still runs without the
  app, but it has no browser, so mermaid stays a code fence there. The request building, the
  wait, and the failure check now live in one module that both the CLI and `lapis_render`
  call; after the move the two produced byte-identical output from the same note.

- **`lapis props rename`** fixes what `props audit` finds. The audit reported `topic`
  split across `feature` (11 notes) and `feature-selection` (2), and there was no way to
  act on it — tags had `tag rename`, frontmatter values had nothing. Same discipline as
  tags: dry-run by default, `--apply` to write, the same backup-and-replace transaction.
  Unlike tags there is **no prefix hierarchy** — `cross-platform` is not `platform`, so
  only exact values match.

- **`lapis tasks audit` can be narrowed** with `--under`, `--exclude`, `--top` and
  `--count`. This vault has 89 open items, 67 of them in a single manual-test checklist, and
  all 99 lines came out every time. The count of what was filtered away is always printed —
  otherwise a narrowed list reads as the whole list.

- **Task totals say where they are concentrated.** `lapis_stats` reported
  `{ open: 90, done: 30 }`, which is true and misleading: three quarters of it was one
  checklist. It now reports the heaviest note and its share alongside. No new setting — the
  same call made for orphan notes, where a second number lets a person judge instead of the
  app deciding what to hide.

- **Side-by-side reading.** Right-click a note in the tree and open it beside the one you
  are reading — until now that meant a second window, which is awkward on one monitor. The
  side pane is **read-only**: no tabs, no editor, no in-document search. Every piece of body
  state is a singleton today, and splitting all of it per pane is a restructuring of a
  2,400-line file; the value is in "keep B up while I read A", and that part is here. Links
  in the side pane move the **main** pane, and the side pane closes itself if the main pane
  arrives at the same note — otherwise the same document renders twice, side by side.

- **The command palette answers to initial consonants.** Typing `ㅅㅌ` already found files
  (`새 탭`), because the file index precomputes their initials — but commands went through
  a different path that compared the query against the label as written, so a jamo-only query
  could never match. It now folds the label the same way, including across word boundaries
  (`ㅅㄴㅌ` → `새 노트`), and such a match is promoted to the top group like any other.

- **Recently-opened notes show where you left off.** The list already existed; what it did not
  say was which of those you actually read into. A dot marks a remembered position, and the
  line number appears when it was the editor. **No percentage** — the stored position knows
  scroll offset and line, not document length, and a guessed progress bar is wrong without
  ever looking wrong.

### Fixed
- **Tasks the app drew were not counted by the audit.** `+ [ ] something` and
  `1. [ ] something` rendered as real checkboxes but were invisible to `tasks audit`,
  `stats` and the MCP server — the screen showed work left while the tools answered
  "no open tasks". The rule for what counts as a task lived in two places: the renderer
  sits on top of markdown-it and therefore accepted all three CommonMark bullets and
  ordered lists, while the audit scanned lines with a regex that only allowed `-` and `*`.

  The two cannot be merged — one reads parser output, the other reads raw text without an
  index. So a test now feeds the same input to both and fails when their answers differ.

  On this vault the gap was **zero** — nothing here is written with `+`. This is
  insurance, not a win.

- **Every link in the side-by-side pane was dead.** Wikilinks, markdown links and the mermaid
  export button all did nothing when clicked, and nothing reported an error. The click rules
  lived inside `+page.svelte`, where nothing could call them, so the side pane got its own
  copy — and the copy was wrong. It looked for `a.wikilink` while the plugin emits
  `span.wikilink` (deliberately: an anchor would let the webview navigate away), and read
  `data-target-path`, a name nothing in the repository ever sets. Plain `<a>` links were
  not handled at all, so their default behaviour survived: an internal `.md` link could
  trigger SPA routing and an external URL could move the webview.

  The fix removes the copy rather than correcting it. Both panes now call one function. They
  render with the same parts, so the HTML they produce is identical — the rule that reads it
  should be single too.

  Two older tests had pinned the bug in place: they hand-built the DOM the broken component
  expected instead of using what the renderer actually emits, so they stayed green while the
  feature was entirely dead.

- **`props rename` could rewrite a value it should not touch.** In YAML a `#` only starts a
  comment when whitespace precedes it, so `C#` is the scalar `C#` — but the comment was
  matched with a pattern that allowed none, so `topic: C#` was read as the value `C`.
  Renaming `C` turned it into `topic: D#`, and the real value `C#` could never be matched
  at all. The dry-run preview reported the change as expected, so a person reviewing it had no
  way to notice. Values in quotes (`topic: "a # b"`) were cut at the same place.

- **A render request could hijack a window that had another vault open.** A cold start marks
  `main` as the designated window so it takes the request regardless of vault — but nothing
  cleared that mark, so every later request was claimed by the same window, which then switched
  its vault to render. Opening a note already clears the mark on every new request; rendering
  did not.

- **The side pane briefly showed the previous note.** Reading is asynchronous, so after the
  path changed the header already named B while the body was still A, with nothing to indicate
  it. A blank moment is better than a wrong one.

- **"No unused commands" was a lie.** Asked through a real MCP client, `lapis_usage`
  reported zero commands used and zero unused. The truth was that it had no denominator: the
  command list lived in a module that pulls in Svelte stores, so the headless consumers could
  not read it and passed nothing. The ids now live in an import-free module, a mismatch
  between them and the real commands is a compile error, and a missing denominator reports
  `null` rather than an empty list.

- **A render for a vault no window had open went nowhere.** The second process exited
  with status 0 — reporting success for having handed over the arguments — while no output
  file and no failure file were ever written, so a shell chaining on `&&` carried on. Opening
  a note already solved this: if no window claims the request, the app opens one and remembers
  its label so that window takes it regardless of vault. Rendering now does the same, opens
  the requested vault in that window, and writes a failure file if even that window does not
  claim it — a timeout is never the only signal.

- **A render request made while the app was closed silently vanished.** The app took the
  request from argv and held it, but the front end asked for it once at startup — before the
  vault had opened — and the answer is only given to a window whose vault matches. The event
  that would prompt a second ask had already gone out before anything subscribed. Rust logged
  "staged", never "taken"; no output file, and no failure file either, because nothing had
  failed. The caller learned about it only as a timeout. It now asks again once the vault opens.

- **`data-rendered` was read as "finished".** Mermaid sets that attribute to `pending` the
  moment it *starts*, and the wait counted any host carrying the attribute as done — so the
  next line looked for an `<svg>` that was not there yet and reported "the diagram is not
  drawn yet, or its syntax is wrong". It was neither. The wait now looks at the rendered
  result rather than the attribute, and reports three outcomes separately, because
  "too slow", "bad syntax" and "done" call for different responses.

- **Every path in a reply now has one shape.** Fixing `out` in `lapis_render` left the same
  leak in its neighbours: `lapis_usage` returned its log directory with backslashes, and
  `lapis_open` returned the executable path the same way. Consumers split these on `/`, so an
  odd one out silently loses its file name and parent directory. Found by calling the tools
  through a real MCP client rather than a test harness.

- **Exporting no longer writes into the vault.** With no `out`, `lapis_export_html` put the
  HTML next to the note — inside the vault — while the module declared it writes only outside
  it. The app is watching, so that write triggered a reindex, and files the user never created
  accumulated where their notes live. It now goes to `~/Downloads` (or the temp directory if
  that is missing), and the reply says where.

- **A timeout blamed the wrong thing.** With the app plainly running, `lapis_render` still
  answered "check that the app is running". The real cause was that the running app predates
  the feature: older builds ignore an argument they do not know, the second process hands over
  its argv and exits, and nobody writes a failure. The remedy now names both causes, version
  first. There is no probe for this — the project has no networking code and argv is one-way,
  so a running app cannot be asked its version; an honest remedy beats a detection that cannot
  exist.

- **`lapis_render` mixed two path shapes in one reply.** `path` and `vault` came back with
  forward slashes and `out` with backslashes. Consumers split these on `/`, so the odd one
  out silently loses its file name and parent directory.

- **Settings are written atomically.** The CLI wrote the settings file in place. One file holds
  *every* app setting, so an interrupted write loses not one key but all of them — and the app
  reads that as "no settings", which closes the MCP gate. Now: temp file, then rename, in the
  same directory.

- **stdin paths keep their `\r`.** A Windows pipe hands over CRLF. Splitting on `\n` alone left
  a carriage return glued to the end of the path, and the file came back **missing** while
  looking perfectly fine on screen.

### Changed
- The MCP failure table is now a table, with a remedy per kind. `app_not_found` and
  `app_timeout` are deliberately separate: one is an install problem, the other means the app
  simply is not running, and a caller told the wrong one digs in the wrong place.

## [3.9.0] — 2026-08-29

> The rest of the fifth analysis, and five new CLI commands. Cut as one release rather than four —
> the ceremony was costing more than the work.

### Added
- **Printing.** The exported HTML now carries `@media print`, so the browser's "save as PDF"
  produces something readable. No PDF library: one stylesheet gets the same result without making
  fonts, CJK and math our problem. Code blocks wrap (a scrolling block simply **vanishes** on
  paper), external links print their address, and headings do not strand at the foot of a page.

- **Errors show up in the status bar.** Release builds have no devtools, so a failure was recorded
  in the log and nowhere else — you had to open the file to learn something had broken at all.
  A count now sits in the status bar. It does not interrupt: the banner is still reserved for
  irreversible writes that failed.

- **An "untouched" tab in vault diagnostics** — notes that have sat for six months. Not a list of
  things to fix; a list of things to look at again. Uses whichever is later, file mtime or the
  frontmatter `date`, and **skips notes where neither is known** — counting "unknown" as "ancient"
  would fill the list and nobody would trust it.

- **Ambiguous links are marked where you read them.** Seven note names exist twice in this vault
  (two projects). Diagnostics listed them, but reading `[[open-items]]` gave no hint at all.
  A wavy underline now says "check this", and the title lists the candidates. The link still works —
  marking, not blocking.

- **Palette preview.** The active note's opening lines, debounced, only for entries that have a
  path. It sits below the list rather than beside it: the palette's width is tuned, and widening
  it would shrink the result text.

- **Keyboard resizing.** The sidebar and context resizers carried `role="separator"` and a label
  but no `tabindex` and no key handling — assistive tech announced a control that could not be
  reached. Arrows move them, `Shift` moves further, `Home` resets.

- **Five CLI commands.** `read` (find a note by name and print it — `cat` needs the path),
  `stats` (what is in the vault, as distinct from `status`, which is about the cache), `usage`
  (the same analyzer the app writes `analysis.md` with), `new` (a note, from a template, refusing
  to overwrite and refusing to leave the vault), and `completion` for bash/zsh/pwsh — which reads
  the command list from the spec rather than repeating it.

### Fixed
- **Command usage was still under-counted.** The title bar and tab bar acted through direct store
  calls, so opening a vault, running the palette from the title bar, closing or pinning a tab were
  all invisible. They log now.

## [3.8.0] — 2026-08-29

> The fifth analysis, first group: the places where lapis found something and then made you go
> find it again.

### Added
- 🔴 **Notes reopen where you stopped reading.** Position is remembered per note and restored
  after the body renders. Measured motivation: four sessions in the usage log all reopened the
  same note `via: tab`, every one of them at the top.

  ⚠️ Written outside `requestAnimationFrame` — a hidden window never fires it (v3.5.1), and that
  is exactly when the last position matters. Restoring re-checks the current path immediately
  before applying, so a fast note switch cannot land the previous note's position on the new body.
  An explicit `[[note#heading]]` anchor wins over a remembered position.

- **Open tasks jump to the line.** `OpenTask` already carried `line`; the panel only opened the
  file, leaving you to find the item again in a ninety-item note. It now hands the task text to
  in-document search — the same mechanism `⌘⇧G` results use — as a literal, because task text
  contains brackets and asterisks often enough that a regex would miss or throw.

- **Broken links can create the missing note.** The name is carried into the new-note dialog,
  in the folder of the note that links to it. Nothing is written until you confirm.

- **Copy a link to any heading** from the outline. `[[note#heading]]` anchors already worked;
  there was no way to produce one without retyping the heading, and one wrong character silently
  lands at the top of the document. Headings containing `]]`, `|` or `#` offer no button at all —
  a broken link is worse than no link.

- **Reopen closed tab**, from the command palette. No shortcut: `⌘⇧T` opens a new window and this
  is not an everyday action.

### Fixed
- 🔴 **A search handed over from another screen never highlighted.** Preview highlighting only
  re-runs when the preview HTML changes, and reads the query non-reactively — deliberately, since
  making it reactive resets the current match on every step. But a hand-off arrives in the other
  order: body first, query second. So `⌘⇧G` → note has been landing at the top of the document
  with the search bar filled in and nothing marked.

  A hand-off counter now wakes the highlight; only `applySearch` increments it, so stepping
  through matches is unaffected.

## [3.7.2] — 2026-08-29

> Both of these were found by reading the first analysis document the app wrote for itself.

### Fixed
- 🔴 **The analysis document was still redacting, and pointed at an export that no longer exists.**
  It printed paths as `…/note.md` and told you to "export again with `raw`" — but v3.7.1 removed the
  export UI. Redaction existed to guard the moment a report *left* the machine; there is no such
  moment now, and hiding which folders you work in destroys the first question the log is for.

  Paths and queries now appear in full, and the document's first line says so, so it is never
  pasted somewhere public by accident.

- 🔴 **Command usage was recorded as zero while the app was in use.** The settings gear called
  `openSettings` directly instead of going through the rail's `activate()`, which is where the
  logging lived. The document therefore announced "no commands recorded yet" and listed twenty
  commands as never used — **not merely wrong, but backwards.**

  The gear now logs, and the window menu logs at the one place items are chosen, so a new item
  cannot be forgotten. A guard pins each entry point.

### Added
- **The window menu (`⋯`) records which item was chosen** — `via: "menu"`, a surface the schema
  had reserved and nothing was using.

## [3.7.1] — 2026-08-29

### Fixed
- 🔴 **The window would not close.** v3.7.0 registered a close handler so it could record how
  long a session lasted. Tauri holds the window open until that handler finishes — so anything
  slow or throwing inside it left the app **with no way to quit**. The X button looked broken.

  The handler is gone. Session length is now derived from the timestamps already in the log:
  from a `session start` to the last event that follows it. That measures *time actually used*
  rather than *time the window was open*, which is arguably the more useful number — and it costs
  nothing at close time.

  ⚠️ The lesson is worth more than the feature: **an observability hook must never be able to hold
  the app hostage.** One session-length figure is not worth a program you cannot quit.

### Changed
- **Log files are now `YYYY-MM.log`** — the content is still JSONL, only the extension changed, so
  they read as logs when you go looking in the folder. Existing `.jsonl` files are renamed on
  startup; leaving them behind would make those months vanish from the stats with no error.

- **The export UI is gone; the analysis document writes itself.** Settings had a save button, a
  format picker and a redaction checkbox — that pushed the job of *managing logs* onto the reader.
  The app now writes `analysis.md` beside the logs on startup, and you copy out whatever you want.
  "Clear log" stays.

  ⚠️ Written on startup, not on close, for the reason above. The document therefore describes
  everything up to the previous session, which is exactly what you want when you go read it.

### Removed
- Manual export (`usageExport.ts`) and report redaction. The document never leaves the app data
  folder now, so there is no boundary left to redact at — and redacting what you are about to read
  yourself only makes it less useful.

## [3.7.0] — 2026-08-29

> The usage log was added to answer "what should I fix next", but it could only export a Markdown
> summary — and nobody parses a table back out. This rebuilds it around that purpose.

### Added
- **The raw log can be exported as JSONL.** That is the shape the log already has on disk and the
  shape analysis wants. The month files are **concatenated verbatim** rather than re-serialized:
  parsing and re-writing would silently drop lines the parser could not read, and then the exported
  file would disagree with the disk with no way to tell.

- **Four more event kinds.** Searches (which query, how many results, whether anything was opened),
  note opens (which note, reached how), timings (index build, cache hit, vault open — with the note
  count, because a duration alone cannot say whether the vault is big or the code is slow), and
  session ends, so "how long is a sitting" has an answer.

  ⚠️ A note open records **where it was reached from, supplied by the caller**. Guessing inside
  `selectNote` would be wrong — the tree, palette, backlinks and wikilinks all call it. The field is
  required, so the type checker names every one of the 25 call sites instead of leaving it to
  vigilance.

- **`UsageAnalyzer` streams.** The settings screen used to load every month into one array before
  summarizing; with a 16 MB cap per month file, a year is up to 192 MB of strings, and more event
  kinds make that worse. Months are now fed in one at a time and dropped.

### Fixed
- 🔴 **Redaction left the username in a bare home path.** The general path rule ran first and
  collapsed `/Users/name` to `…/name`, so the two username rules underneath never fired — the exact
  thing redaction exists to prevent. They now run first.

- 🔴 **Redaction did not cover search queries**, which are now logged. Path rules cannot match a
  query, so a redacted report would have claimed to hide something it printed in full. Redacted
  queries keep only their length.

- **Warnings were recorded as errors** with the severity smuggled into a `warn: ` prefix on the
  message, so any analysis had to parse it back out. Severity is now its own field, and the parser
  converts already-recorded lines so months of existing warnings do not read as errors.

- **A line the parser could not read and a line from a newer version were counted the same.** Roll
  back one version and a healthy log would report thousands of "corrupt" lines. They are separate
  counts now, and the report says which is which.

### Changed
- **One save button instead of two.** "Save report" and "Save unredacted" sat side by side with no
  way to tell them apart without clicking. There is now a format (raw / summary) and, for the
  summary only, a redaction checkbox that is **off by default** — the file is written to a location
  the user picked, and the risk is in pasting it somewhere later, not in saving it.

## [3.6.0] — 2026-08-28

> Everything left on the open list that could be closed from here. Two of the four fixes were
> found by putting screens the fixture could not reach in front of the preview.

### Fixed
- **The Korean UI showed English in three places.** `NewNoteModal`'s primary button read
  *Create & Open* while *Cancel* right beside it was translated; one of the palette's nine group
  headers was a hardcoded `COMMANDS` while its siblings render as 최근 / 노트 / 본문; and
  `commandsHeaderLabel` carried `"COMMANDS"` / `"QUICK ACTIONS"` in code. Type checking cannot see
  this — the strings are perfectly valid. A guard now scans markup and code for untranslated UI
  text, with an allowlist limited to proper nouns and abbreviations.

- **Locale files can no longer drift.** A key present in only one of `ko.json` / `en.json` leaks as
  an empty string or the key name in the other.

### Added
- **The dev fixture now reaches four more screens.** It carries a git history, two note templates
  under `.lapis/templates/`, a deliberately divergent `status` value, and a path whose writes fail.
  Each exists so a screen that only appears under some condition can actually be looked at: the
  recent-changes tab, the template picker, the frontmatter-divergence audit, and the failure banner.

  ⚠️ The divergent value is `구현 완료`, not `완료됨`. The audit requires a word boundary after the
  shared part — `완료됨` is one word, so it is deliberately not reported (otherwise `완료`/`미완료`
  would be flagged as the same value). The fixture comments say so, because "fixing the typo" would
  silently empty that screen.

- **The failure banner has component tests.** The store was fully covered while nothing tested the
  thing that draws it — this repository's recurring failure. Ten tests pin that it stays out of the
  layout when empty, keeps detail collapsed, dismisses one alert at a time, and carries a readable
  accessible name.

- **The export path's canvas-free logic is now testable.** Scale clamping moved to
  `exportGeometry.ts` and the app-only node stripping to `previewExportDoc.ts`. Both were previously
  unreachable: with a canvas attached, happy-dom gives "passed without running".

  The stripping matters more than it looks — it unwraps in-document search highlights before export.
  Miss it and **the file records what you were searching for** when you exported it, with no error.

## [3.5.2] — 2026-08-28

> Found by looking at the app rather than at the tests.

### Fixed
- 🔴 **Descending sort put empty cells at the top.** `compareCells` documents the rule as
  *"empty always goes last"*, but `sortedOrder` multiplied the whole comparison by the direction
  sign — which flipped the empty rule along with everything else. Sorting a column with gaps
  descending filled the top of the table with blank rows.

  `tableView.ts` implements the same rule correctly, with a measurement to justify it: in a real
  vault `related` is filled on 3% of notes and `description` on 1%, so most columns become all-blank
  when reversed. The rule was written twice and only one copy was right — the shape of defect this
  repository keeps producing. A new test now stands both sorters in front of the same question.

- **Table headers could not be sorted from the keyboard.** They carried a click listener and
  nothing else — no `tabindex`, no control — so with no mouse the feature was simply unreachable, in
  an app otherwise driven by shortcuts. Headers now hold a focusable button; the click handler stays
  on the cell, so the whole header remains a click target.

- **Sort state was invisible to assistive technology.** Headers now carry `aria-sort`
  (`none` → `ascending` → `descending`), matching the arrow that was already drawn.

- **Three modals announced their close button as "✕".** `aria-label="✕"` looks like a label and
  passes automated checks, but a screen reader reads the glyph. Grep, tag-rename and vault
  diagnostics now use a translated *Close*, like the app's other modals already did.

## [3.5.1] — 2026-08-28

> Three defects that produced **no error message at all**, plus a way to actually look at the app.

### Fixed
- 🔴 **The index build stopped forever when the window was not visible** — `requestAnimationFrame`
  never fires while a window is hidden or fully occluded, and three copies of the same chunk-yield
  helper (`linkIndex` · `relations` · `stores/vault`) simply awaited it. Measured in a background
  tab: zero rAF callbacks in 1.5s, and the build stalled at the first chunk boundary with no error,
  no timeout, no log — just the "building index…" overlay, forever.

  The helper now lives in one place (`yieldToPaint.ts`) and **races rAF against a timer**. A visible
  window still yields to paint (rAF arrives in ~16ms, well inside the 100ms cap), so the spinner
  keeps updating; a hidden one proceeds immediately.

- 🔴 **The folder axis and the palette scope chips never appeared** — `scopeOptions` computes
  directory prefixes down to depth 2, but both callers pass **absolute** paths. The drive and home
  directory ate the entire depth budget, so every candidate covered all notes and was dropped by the
  "must actually filter something" rule. The unit tests fed it vault-relative paths, so the function
  passed while the feature was blank.

  `scopeOptions` now skips the root every path shares, and returns a `label` (below the vault) next
  to the `prefix` used for matching — one function owns both, so they cannot drift apart.

- **Filter chips showed no selected state** — active styling was written per chip type, so axes
  added later (folder in 3.1.0, arbitrary frontmatter in 3.3.0) silently had none. There is now a
  base `.facet-chip.active` rule with per-type accents layered on, and a test that requires every
  chip variant to have one.

- **The dev fake backend is now off under test** — vitest is also `DEV` and outside Tauri, so tests
  that mock the Tauri core were reaching the fixture instead of the mock. The fixture returns
  plausible values, so the assertions **passed without observing anything**.

### Added
- **The app runs in a plain browser during development** (`npm run dev`) against an in-memory
  fixture vault, so the filter panel, tables, and diagnostics can be looked at directly. The status
  bar shows a `FIXTURE` badge, unknown commands throw rather than returning `undefined`, and a test
  scans the production build to prove none of it ships.

## [3.5.0] — 2026-08-28

> The **last** group from the fourth analysis (8, 9, 10, 11, 12, 13, 17). All 21 candidates are
> now closed.

### Added
- 🔴 **Failures are shown on screen** ([#278]). v3.2.0 structured 96 sites into `logError`, but
  that is a **record** — release builds have no devtools, so the user still saw nothing.

  `stores/vault.ts` said as much: *"this path still has no on-screen error surface."*

  ⚠️ Only **failures of irreversible writes** reach it — citation rewrites, conflict
  resolution, auto-commit. Surfacing all 96 would make the banner permanent, and a permanent
  warning is one nobody reads.

  ⚠️ A **banner, not a toast**. Toasts disappear; if you step away while "renamed but citations
  not updated" flashes by, you never learn it happened. It stays until dismissed.

  ⚠️ One entry per key. A repeatedly failing auto-commit would otherwise stack identical lines,
  which is noise rather than information.

- **New-note templates** ([#278]). `NewNoteModal` carried a "expand into templates in Phase 4.2"
  note. The measurement justifies it: frontmatter conventions here are at **100%**
  (`title`/`doc_kind`/`topic`/`tags` on 112 of 112), all typed by hand.

  ⚠️ They live **inside the vault** (`.lapis/templates/`). Putting them in app settings means
  they do not travel with the vault — notes living in the filesystem is this app's premise.

  ⚠️ Substitution covers **dates and the title only**. Expressions and conditionals would make
  it a template engine, and engines fail silently. **Unknown names are left alone**, so a typo
  like `{{titel}}` stays visible instead of vanishing.

- **Note content at a commit** ([#278]). "Content at this commit" in the history shows the body
  as it was, with a copy button.

  ⚠️ **Not a restore.** `git checkout` rewrites the working tree — an irreversible write. It
  shows and copies, nothing more; the same stance as every audit here.

  ⚠️ Only commit hashes are accepted. An arbitrary string passed to `git show` could read
  **outside the vault** via something like `HEAD~3:../..` — the path is guarded, the revision was not.

- **Recent changes across the vault** ([#278]). The seventh tab in diagnostics, answering "what
  changed today" — a **different question** from per-note history.

- **A trace of auto-commit** ([#278]) in the status bar. It runs silently after 4 seconds, so
  without a trace **working and not working look identical.**

  ⚠️ Recorded **only when a commit actually happened.** With no changes the backend is a no-op,
  and updating the trace anyway would be a lie.

### Changed
- 🔴 **Whole-word search now works correctly in Korean** ([#278]). `고양이` no longer matches
  inside `검은고양이`.

  Three stages: before v3.1.1 it matched **nothing** (ASCII `\b` gives Korean no boundary at
  all); v3.1.1 avoided the zero-result case but had no real boundary; now it uses a Unicode
  word-character lookbehind.

  ⚠️ **Guarded by a feature test.** Where lookbehind cannot be parsed, `new RegExp` throws, the
  regex becomes `null`, and **search dies entirely** — the very symptom v3.1.1 fixed. Engines
  without it fall back to stage two and **never to the zero-result stage one**.

  ⚠️ `\p{...}` requires the `u` flag; without it, `p` is read as a literal and it silently
  matches something else. The flag is set only for real boundaries — enabling it in regex mode
  would break patterns that used to work.

### 17 · Deliberately not built
`lapis doctor` is **not** moving into the app. What doctor answers (cache version, paths, schema
skew) are questions you ask **when the app will not start**. Inside the app it would be
unavailable exactly when it is needed — the CLI is the right place. The reasoning is recorded in
the plan.

## [3.4.0] — 2026-08-28

> The **note body** group from the fourth analysis (2, 3, 4, 5, 7) — where the corpus pointed
> hardest.

### Added
- **Task lists render as checkboxes** ([#277]). markdown-it has no task-list support, so
  `- [ ] a task` showed up **literally** as `[ ] a task`.

  Measured: **90 open** and **30 done** across 5 notes — not a small number, all of it brackets.

  ⚠️ **Read-only.** Clicking to edit the file is an irreversible write and the README states
  this is not a writing tool. Since a checkbox that does nothing looks broken, the reason is in
  its `title`.

  ⚠️ Inline tokens are **not rebuilt.** Re-parsing would either double-process wikilinks and
  emphasis or drop them — both fail silently.

- **Open-tasks audit** ([#277]) — the **sixth** vault diagnostic, on all three surfaces
  (app, `lapis tasks audit`, MCP `audit: "tasks"`).

  On the real vault: **88 open, 23 done**, with 67 of them in a single note — invisible without
  opening it.

  ⚠️ **Fenced code is skipped.** 63 notes here contain code blocks and shell examples include
  `- [ ]`. Counting those would put **tasks that do not exist** in the list, and then the list
  cannot be trusted.

  ⚠️ Like `unlinked`, it **reads every note body**, so it only runs when the tab is opened.

- **Sortable, copyable tables** ([#277]). Click a header for source → ascending → descending;
  copy as Markdown or CSV.

  Measured: tables appear in **95 of 112 notes (85%)** — the dominant structure here, and it had
  styling but no behavior.

  ⚠️ **The source is never modified.** Sorting changes the view only; a reload restores the
  original order, which is the correct behavior.

  ⚠️ Cells that look numeric sort **as numbers**. String comparison puts `10` before `9`, which
  anyone sorting a table notices immediately.

  ⚠️ Copying **after** sorting yields the visible order. Copying something different from what is
  on screen would be a lie.

- **Copy button on code blocks** ([#277]). Measured languages: `bash:33`, `ts:12`, `json:5`.

### Already handled
Item 7 (horizontal overflow for wide tables) was already covered by `overflow-x: auto` in
`rendered.css` — the analysis listed it without checking the code.

## [3.3.0] — 2026-08-28

> The **axes and search** group from the fourth analysis (1, 6, 14, 15, 16). The first item was
> **planned in the third pass and dropped**.

### Added
- 🔴 **Filter by any frontmatter axis** ([#276]). Fields like `status` become chips in the
  filter view.

  The third-pass plan listed this as `PR-C`, but only the folder axis shipped. The measurement
  still held: `status` is on **44 notes (41%)** and Overview lets you **add it as a column while
  offering no way to filter by it.** Visible but unfilterable is half a feature.

  ⚠️ **Not every field is an axis.** `date` is on 96% of notes with a distinct value each — the
  chip row would be as long as the note list, and picking one leaves a single note. That is not
  a filter, it is opening a file. It uses the **same threshold** the audit uses for "is this an
  enum".

  ⚠️ Notes **without** the field drop out — a note with no `status` cannot be "done".

- **MCP and the CLI know the same axes** ([#276]). `props: {status: ["완료"]}` and
  `--props status=완료`. `list: "fields"` answers which axes exist; `list: "<field>"` lists its
  values.

  ⚠️ MCP calls the app's `applyFilters` **directly**. A separate implementation would let two
  surfaces answer the same question differently — which is exactly what happened with tag
  prefixes (v3.1.2).

- **Saved searches** ([#276]). `⌘S` saves the current search; an empty palette lists them.

  ⚠️ **The scope is saved with it.** Saving only the query means recalling it from another
  project returns the wrong thing, which reads as the saved search being broken.

- **Choose what "recently changed" means** ([#276]). Settings → Vault: file mtime or
  frontmatter `date`.

  The CLI and MCP accept `--by mtime|date`; the app was pinned to mtime. Measured: of the 107
  notes carrying `date`, **42 disagree with their mtime** — the two axes genuinely diverge here.

  ⚠️ The `date` axis only covers notes that carry the field. Treating a missing date as 0 would
  pile them at the end where they mean nothing. Parsing uses `parseFrontmatterDate`, the **same
  function** the CLI and MCP use.

### Changed
- **The palette's folder chips became a persistent scope** ([#276]). It survives closing,
  applies to **every mode**, and draws candidates from all path-bearing results.

  🔴 The old chips matched a folder **exactly** — every other surface uses a string prefix
  (`inScope`, `under`, `exclude`) and only the palette differed. Narrowing to `knowledge/lapis`
  **excluded** `knowledge/lapis/plans/a.md`. Results still appeared; no error.

  ⚠️ Because it persists, it is **always visible**. A silently narrowed result set becomes "why
  isn't it showing up", which is indistinguishable from broken search. The active scope gets its
  own row and clears in one click.

  ⚠️ **Items without a path (commands, tags, facets) are never removed by the scope.** If
  narrowing a folder made `>` commands disappear, anyone with a scope set could not use the
  command palette.

### Not built — items 18, 19 and 20 of the fourth analysis
Link previews (URLs on **4%** of notes), outline depth control (h4+ in **4 notes**), and a
title-collision UI (**1** duplicate title; the 7 duplicate filenames are already handled by
showing the path).

## [3.2.0] — 2026-08-28

> Candidate 21 of the fourth analysis. It started as "menu usage statistics", but measuring
> moved the center of gravity — this app was **failing silently in 96 places**.

### Added
- **Usage log** ([#275]). Records which commands you run and **from which entry point**, and
  where errors happen, on this machine only. Settings → Advanced turns it on or off, exports a
  report, and clears it.

  ⚠️ **This is not telemetry.** The README states there is no network code, and this feature is
  no exception — it writes to disk and nowhere else.

  ⚠️ **It does not write into the vault.** A log inside the vault makes the watcher reindex on
  **every event** and gets itself indexed as a note. It lives in
  `app_data_root/usage/YYYY-MM.jsonl`, following the same dev/release split.

  **Recording the entry point is the whole point.** "Opened files 400 times" is nearly useless;
  "380 of 400 via ⌘P, 3 via the rail" decides whether the rail is worth fixing. Commands never
  used are listed too — those are *absent* from the log, so the full command list is the
  denominator.

- **All 96 error sites are structured** ([#275]). Every `console.error`/`console.warn` is now
  `logError`/`logWarn` (console output is kept — in development it is still the fastest path).

  ⚠️ **Release builds have no devtools.** Until now those 96 sites wrote where nobody reads.
  `usageWiring.test.ts` blocks `console.error` from coming back.

- **Report export** ([#275]) as Markdown: period, most-used commands with their entry-point
  split, never-used commands, and error frequencies.

  ⚠️ **Redacted by default** — paths keep only their last segment. The accident happens not in
  the raw log but the moment a **document is pasted somewhere**, and this repository is public.
  An unredacted export takes a separate, explicit button, and that document carries a warning on
  its first line.

### Fixed
- **Settings were unreachable without a vault** ([#275]). Settings opened only from the rail
  button, the rail requires a vault, and no palette command exists for it — so language and
  theme could not be changed before opening a vault. The empty state now has an entry.

  (Found while verifying the usage screen in the browser.)

### What is and is not recorded

| Recorded | Not recorded |
|---|---|
| Command id, entry point, timestamp | Note **content** |
| Error site, message, exception, path | Any **transmission** |
| Session start, version, platform | |

## [3.1.2] — 2026-08-28

> **The rest** of the untouched modules. Two more defects, both **without an error**.

### Fixed
- **The app and MCP gave different answers for the same tag** ([#274]).

  MCP's tag query is `n === t || n.startsWith(t + "/")` — **exact match ∪ nested**. The app's
  prefix index **did not include the tag itself**. Selecting `feature` gave only `feature/*`
  in the app; notes tagged exactly `feature` **were missing**.

  ⚠️ A second problem rode along: when a tag is **both an exact tag and a parent prefix**
  (`a/b` used on its own while `a/b/c` also exists), `TagPanel`'s `isSubPrefix` went false and
  selected leaf mode — and there was no third-level chip either, so **the deeper notes were
  unreachable from the tree.** `prefixChildren` now holds every level and the test is
  "does it have children".

  `tagIndex.test.ts` reproduces the MCP rule directly and asserts **both implementations return
  the same set.**
- **Notes sharing a name shared their backlink excerpt** ([#274]).

  The cache key was `${source}::${target stem}`. The excerpt is built from the target's
  **stem, title and aliases**, so a stem alone does not identify the target.

  With two same-named notes (this vault has **7 such pairs** per `audit: tags`), both targets
  hit the **same key** from one source; the first computed won and the second showed **someone
  else's excerpt**. The key is now the target **path**.

### Added
- **Tests for every remaining module** ([#274]) — 65 of them: `backlinks` (cache key), `unread`
  (change-detection boundaries), `inDocSearch` (handed-over options must not persist),
  `cssFormat` (empty input, idempotence, parse failure), `cli/appLaunch`
  (detached/unref/stdio), `cli/io` (**vault escape, extension whitelist, atomic write**), and
  `watcher` (both branches of external-change conflict resolution).

  ⚠️ The `cli/io` escape check also covers **a symlink pointing outside**. Where symlinks cannot
  be created the assertion is skipped — **an environment that could not run it is not counted
  as a pass.**

  ⚠️ `watcher`'s "use external" is pinned to **keep the conflict open when the read fails.**
  Closing it would let the user believe it was resolved and overwrite the other change on the
  next save.

### Not tested — with reasons
- `mermaidExport` and `previewExport` — canvas rendering and image inlining; **no meaningful
  assertion exists without a real canvas.** The pure half of `previewExport`
  (`previewExportDoc`) is already covered.

## [3.1.1] — 2026-08-28

> A full pass over the unit tests. **Twelve modules had no test touching them**, and three of
> those held real defects. All three fail **without an error**.

### Fixed
- **Renaming a `.mmd` note silently broke its links** ([#273]).

  `renamePath` derives the old and new stem and hands them to the link rewrite, but the stem
  helper stripped **only `.md`**. For `.mmd` the extension stayed, so the rewrite searched for
  `"diagram.mmd"` while the body links read `[[diagram]]` — **zero matches**, no preview modal,
  a **silent return**. The file was renamed and every citation kept pointing at the old name.

  ⚠️ `vault.rs` treats **both** `.md` and `.mmd` as notes and preserves `.mmd` on rename. Only
  the extension-stripping rule was split **three ways** across the codebase:
  `previewExportDoc` (md/mmd/markdown), `relations` (md/mmd), and four other sites (**md only**).

  One definition now lives in `notePath.ts`, and `noteStem.test.ts` blocks a `.md`-only regex
  from reappearing.
- **Filtering the tree by a folder name produced an empty folder row** ([#273]).

  A folder whose own name matched still had its children replaced by the filtered result (an
  empty array). Typing `plans` showed an **empty `plans/`** while `countMatches`, which counts
  leaves only, printed **"0 matches"** — a visible row with a zero count means one of the two
  is lying.

  When the folder matches, its contents **are** what you were looking for, so they stay.
- **"Whole word" in in-document search returned nothing for Korean** ([#273]).

  `\b` is a boundary against **ASCII word characters**. Korean characters are not word
  characters, so both sides are non-word and there is **no boundary at all** — `\b고양이\b`
  did not even match `"고양이"`.

  That is not "matches less", it is **search is dead**. In an app built around Korean search,
  enabling that option emptied the results with no error and no explanation.

  In literal mode the boundary is now attached only on an edge that is an ASCII word character.
  ⚠️ Real CJK word boundaries need lookbehind, and where an older WKWebView cannot parse it the
  **whole regex becomes null — exactly the symptom just fixed.** So it stops here.

### Added
- **Tests for the untouched modules** ([#273]) — 60 of them: `layout` (three migration
  branches), `treeFilter`, the regex assembly in `previewHighlight`, `windowScope` (per-window
  keys), `tagIndex` (nested prefixes), and `noteStem`.
- **A shell-dimension drift guard** ([#273]). Checks that `--collapsed-strip-w` (CSS) and
  `COLLAPSED_STRIP` (TS) hold the same number, and that shell heights stay out of the density
  blocks. Drift makes the collapsed width and the strip button width disagree — both near 34px,
  so it is easy to miss.

### Not fixed — recorded as latent
- **A tag that is both an exact tag and a parent prefix hides its deeper notes.** `TagPanel`'s
  `isSubPrefix` goes false there and selects leaf mode, and there is no third-level chip to
  begin with. ⚠️ Measured on 2026-08-28, this vault has **zero depth-3 tags** and zero instances
  of the shape, so it does not bite yet. `tagIndex.test.ts` pins the condition so there is a
  reproduction to start from.

## [3.1.0] — 2026-08-28

> Six findings from a third corpus pass (107 notes). This time the audits were **actually run**
> to see what they miss.

### Added
- **Folder scope — "only under here"** ([#272]). All three surfaces: a **third axis** in the
  app's filter panel, `lapis ... --under`, and MCP `under`.

  Measured: all **7** name collisions reported by `audit: tags` were between the two projects
  living in one vault (`state`, `feature-map`, `open-items`, `verification`, `shortcut-map`,
  `autonomous-loop`, `열린 항목`). Half of every search result belongs to the other project,
  and **there is no error**.

  ⚠️ The two projects **use the same `doc_kind`**, so the existing two axes cannot draw that
  boundary. The path is the only discriminator.

  ⚠️ It is a **string prefix, exactly like `exclude`**. Matching on directory boundaries
  (`x + "/"`) makes a mid-segment prefix like `lapis/plans/lapis-cli-` a silent no-op — that is
  why `exclude` is already a string prefix, and if the two rules diverge the same string works
  on one side only.

  ⚠️ Where they overlap, **`exclude` wins.** If excluding the archive and then scoping into it
  brought it back, the exclusion would mean nothing.
- **`stale` now says whether *this* answer is wrong** ([#272]). `stale.affects_results` — is any
  path in the results newer than the cache?

  Measured: the cache was 11 hours (39,541s) behind with 19 newer files. But `newer_count` speaks
  about the **whole vault**, not this query. If none of those 19 are in the results, the answer
  is fine — and a count alone turns every response into a suspicion. Constant suspicion gets
  ignored.

### Changed
- **The frontmatter audit catches values that overlap at the end** ([#272]). New kind: `suffix`.

  Measured: `audit: props` returned **0** while `status` was split across
  `반영됨(19)`, `완료(10)`, `진행 중(10)`, `구현 완료(1)`, `해결됨(1)`, `닫힘(1)`,
  `이전됨(1)`, `미착수(1)` — five of the eight mean "done".

  The `prefix` rule only looked at **prefixes**, and `완료` is a **suffix** of `구현 완료`.
  Qualifiers usually attach to the front, so leaving that direction out misses half the splits.

  On the real vault it now catches `구현 완료 ⊂ 완료` and `cross-platform ⊂ platform`.
- **A signal for an unsettled axis** ([#272]). New kind: `sparse` — when values used exactly once
  number **three or more and are at least half** of all values.

  ⚠️ **It does not claim they are synonyms.** `반영됨`/`해결됨`/`닫힘`/`이전됨` share no
  substring, and whether they mean the same thing is **not something a machine can decide**.
  This feature's principle is that it does not judge. It reports only what can be counted:
  "eight values, five used once".

  ⚠️ It stays quiet on healthy axes. This vault's `doc_kind` has six values and no singletons.
  Firing there would cost trust in the whole audit.

  ⚠️ The value list is **capped at eight.** Uncapped, `topic` became a 17-row wall that buried
  the real split (`suffix`) below it. The truncation is **stated**, not silent.
- **Entry points sink to the bottom of "No backlinks"** ([#272]). Sorted by outgoing links
  ascending, then by path.

  Measured: this vault's `HOME.md` has **19** outgoing links and nothing points at it — which is
  what an entry point looks like. Path ordering put it at the **top** of the list. When the first
  row is always "not a problem", the rest of the list gets read less.

### Not built — the corpus said so

| | Measurement |
|---|---|
| More time-axis features | All 107 notes are **less than a week old**. Nothing to bite |
| Assets and attachments | **Zero** non-markdown files |
| Folding / long-document work | **Zero** notes over 1,000 lines |
| Images, mermaid, math | Still **zero** |
| `sparse` for tags | 35 of 74 used once, but the ratio is **0.47** — tags are an open axis and long-tailed by design. Firing there is noise |

### One hypothesis that was wrong

`related:` appears on 91% of notes while `buildBacklinks` only reads body links, which suggested
plenty of false orphans. Running it gave **7** — the orphan check counts frontmatter relations
too. That was nearly a conclusion drawn from one comment.

## [3.0.2] — 2026-08-28

### Changed
- **Three terms renamed** ([#270]). Display text only — **stored state, commands, and CLI
  flags are unchanged.**

  | Before | After |
  |---|---|
  | Vault hygiene | **Vault diagnostics** |
  | Orphan notes | **No backlinks** |
  | Table view | **Overview** |

  "Hygiene" and "cleanup" imply good and bad, and this screen **does not judge** — it finds
  and shows, it does not fix. "Orphan" was a loaded metaphor for the one thing actually
  measured: nothing links to this note.

  ⚠️ **Code and CLI keep the old names.** `lapis links --orphans` is an **API** — changing the
  flag breaks other people's scripts. Renaming only the code would leave the CLI as the odd one
  out, so the display changed alone and the mapping is documented at the top of `vaultAudit.ts`.

### Fixed
- **The "Columns" menu hid behind the table header in Overview** ([#270]). The menu and the
  sticky header were **both `z-index: 1`**, and at equal values **DOM order wins** — the table
  comes after the toolbar, so the header covered the menu.

  The menu opened with every item present; only its first rows disappeared behind the header.
  No error, nothing in the console. `tableStacking.test.ts` now pins the order of the two values.

## [3.0.1] — 2026-08-28

### Fixed
- **The window would not move and caption buttons would not click under the custom title bar**
  ([#269]). Caught on a real Windows window. Two causes, and **both fail without an error**.

  1. **There was effectively no drag region.** A bare `data-tauri-drag-region` only responds to
     **direct clicks on that element** — anywhere a child covers is not draggable, and on a 40px
     strip almost nothing is uncovered. It was also only on the center track. The whole title bar
     is now `deep`.

     ⚠️ No hand-written no-drag exceptions on controls — Tauri already blocks **interactive roles**
     like buttons and links. Writing them by hand means forgetting one per new button, and the
     forgotten one is the only button that stops working.

  2. **Caption buttons were half height.** `.titlebar` used `align-items: center`, so the three
     sections were only as tall as their content (~28px), and buttons sized with `height: 100%`
     resolved against that. The Windows convention is 46×40; it was rendering 46×28. Now it is
     46×40 and the close button reaches the window's right edge.

  Double-click to maximize failed for cause 1 as well — with no surface to grab, the double-click
  never lands on one.
- **Opening the vault menu from the title bar dragged the window** ([#269]). `deep` covers the
  whole subtree, so the popup now marks itself `data-tauri-drag-region="false"`. Its items are
  buttons and Tauri blocks those, but the empty space in the `<ul>` and `<li>` is not.

`titlebarChrome.test.ts` pins four things: that the region is `deep`, that no bare attribute
remains, that sections stretch, and that the button width is a 46px literal (a density token
would shrink the hit target in compact mode).

## [3.0.0] — 2026-08-28

> The shell redesign (title bar, status bar, single-view sidebar, segmented tabs, underlined
> tabs) and the color foundation are in the **[3.0.0-beta]** section below. This section covers
> what landed on top of it.

### Added
- **The palette has four modes** ([#268]). `⌘P` (files), `⌘⇧F` (content), and `⌘K` open
  **different modes of the same palette**. **The shortcuts are unchanged.**

  `⌘K` opens in **the mode you used last**. `⇥` cycles All · Files · Content · Commands.

  ⚠️ **`⇥` moved from list navigation to mode cycling.** Through v2 it was an alias for `↓`.
  The arrow keys still do that job, so nothing is lost — but it is a key your hands remember.

  ⚠️ `tag` (`#`) and `facet` (`:`) are **not** in the cycle; prefixes are the only way in, and
  `⌘K` does not remember them. Remembering them would reopen a palette showing tags with an
  empty input.
- **Folder chips and `rel` scores in content mode** ([#268]). `rel` is the value the CLI and
  MCP already emit — relevance within the query, where the top hit is `1.00`.

  ⚠️ Raw BM25 is not shown. Its scale differs per query (63 vs 1,494), which invites readers to
  compare across queries.

  ⚠️ Chips come from the results **before** filtering. Derived after, picking one chip would
  make the others vanish, leaving no way to move to another folder.
- **Three animation settings** ([#268]). Settings → Appearance → System / Minimal / Full.

  ⚠️ **The setting beats the system.** Reading only `prefers-reduced-motion` cannot express
  "quiet in this app alone" or "reduced system-wide but not here".

  ⚠️ **Spinners and progress bars keep moving on Minimal.** They report work in progress; a
  stopped indicator reads as "finished".
- **Three density steps** ([#268]). Cozy / Default / Compact, up from two in v2.0.0.

  ⚠️ **Text size is identical across all three.** Legibility is not a density concern. Shell
  dimensions and window buttons do not follow density either — they answer to OS convention.
- **A full-screen empty state** ([#268]). The no-vault screen moved out of the sidebar. A
  **recent vaults list** (up to 5) shortens the path when you open a different vault per window.

  ⚠️ v2 kept the message inside the sidebar while the rest of the screen — tab strip, note
  header, context panel — rendered as usual. One empty panel among full ones reads as "something
  failed to load", not "nothing is selected yet".
- **A window chrome switch on Windows** ([#268]). Settings → Appearance → Title bar. When on,
  the app bar doubles as the title bar and draws its own caption buttons (46×40, close hover
  `#c42b1c`).

  ⚠️ **It is applied at runtime, not written into `tauri.conf.json`.** Putting
  `decorations: false` in the config would produce an undecorated window even when the frontend
  fails to boot — and then the window can be neither moved nor closed, because whatever would
  draw the caption buttons is dead.

  ⚠️ **The switch does not appear on macOS.** There, `setDecorations(false)` removes the traffic
  lights too, leaving ⌘Q as the only way out. What macOS wants is `titleBarStyle: "Overlay"`,
  which is a build-time setting and cannot be toggled at runtime. A control that does nothing is
  indistinguishable from a broken one.

### Changed
- **Modals enter in 220ms and leave in 140ms** ([#268]). Closing is stepping away, not waiting
  for a result; at equal length it *feels* slow. Cards now add `y −8→0` to `scale .97→1`.
- **Tab underline and the read/edit segment slide** ([#268]). 180ms. The underline is **one
  element for the whole strip**, moved with `transform` — it does not wait on body rendering.

  ⚠️ Its position is measured (tabs reorder by drag and scroll horizontally). If measurement
  fails it draws **nothing**, which beats leaving a line in the wrong place.
- **Theme switching is a snapshot crossfade** ([#268]). No `transition` on the 151 token sites —
  that would make color lag behind every hover. A browser View Transition snapshot crossfades
  over 320ms instead. Where it is unsupported, colors change instantly.
- **250ms hover-intent delay on rail tooltips** ([#268]). Without it, brushing past the rail pops
  six bubbles in a row. **There is no delay on exit**, and none for keyboard focus.
- **A shimmer on the indexing pill** ([#268]). Width says how far along; the shimmer says still
  running. When an index build holds the main thread the width stalls, and this is what separates
  stalled from finished.
- **The vault hygiene modal uses a left list** ([#268]). Five horizontal tabs split into two
  groups — **from the graph** (broken links, orphans, tags, unlinked mentions) and **filterable
  axes** (frontmatter). Five in a row read as one kind of thing; there are two.
- **The custom CSS example uses the new tokens** ([#268]). The accent example now sets **all
  three** — overriding one leaves the other two at their old values, so only links come out wrong.

### Fixed
- **Spinners froze under "Animation: Minimal"** ([#268]). The `[data-motion="minimal"]` reset was
  missing the restore list for functional indicators entirely.

  Measuring that turned up something else: four of the five restored class names **did not exist
  anywhere in the app** — leftovers from the old infinite sliding bar. Dead names tell the next
  reader "this is being maintained" while maintaining nothing. `motionReset.test.ts` now checks
  both that the two lists agree and that every name has a referent.

- **Windows builds died on pre-release versions.** The MSI bundler requires the pre-release
  identifier to be **numeric** — it rejected `beta` in `3.0.0-beta` and the whole bundle step
  failed. Windows now produces only the NSIS installer (`.exe`).

  ⚠️ The target list is scoped to Windows via `tauri.windows.conf.json`. Touching `"all"` in
  the shared `tauri.conf.json` would change the macOS artifacts too, and MSI is a
  Windows-only target — there is nothing to remove there.

### Not done
- **Animating panel collapse/expand width.** Two approaches, both measured and both failed:
  `transition: grid-template-columns` **never reached its final value** (collapsed state, old
  width), and a length registered with `@property` snapped instantly — the same on a freshly
  created bare element.

  Width changes instantly. What did land is the **content fade** (120ms, 40ms delay on enter),
  which is what actually solves the problem the width animation was for (text squashing as the
  column narrows). Details in the "panel width" block of `app.css`.

### Token renames (affects custom CSS)

| Old | New | Note |
|---|---|---|
| `--dur-fast` | `--dur-1` | 90ms. The old name stays as an alias for **one release** |
| `--dur-base` | `--dur-2` | 140ms |
| `--dur-slow` | `--dur-3` | 220ms |
| — | `--dur-4` | 320ms, new |
| `--border-*` | unchanged | values went from opaque grey to rgba hairlines |
| — | `--accent-solid` · `--accent-text` | new |
| — | `--n-250` · `--n-350` | new ramp steps |
| — | `--titlebar-h` · `--statusbar-h` · `--collapsed-strip-w` | new shell dimensions |

Custom CSS that used `--accent` as a text color should move to `--accent-text`.
The `data-lapis` hooks went from fifteen to **seventeen** (`titlebar`, `vault-empty`).

### Unchanged

The shortcut table, the single dark theme, "vault hygiene does not judge", file-granular replace,
indexing only frontmatter `tags:`, `mcp_enabled` off by default, one index producer in Rust.

⚠️ **`CACHE_VERSION` is unchanged (7). This release does not trigger a re-index.** A UI overhaul
has no reason to invalidate the cache.

## [3.0.0-beta] — 2026-08-28

> **Pre-release.** The 3.0 overhaul up to the **shell** — the color foundation and the spatial
> skeleton. Palette search modes, the three modal layouts, motion polish, and empty states land
> in v3.0.0.
>
> ⚠️ The window chrome (removing the native titlebar decorations) is **not in yet.** It cannot
> be verified without driving a native window, so it goes behind a settings switch in v3.0.0.

### Changed
- **The sidebar shows one view at a time** ([#265]). Four stacked accordion sections become a
  single view the rail selects, VS Code activity-bar style.

  The v2.0.0 comment already said "VS Code activity bar idiom" while the behavior was section
  toggling. 3.0 builds what the comment described: another icon switches, **the active icon
  collapses**. The rail's collapse button is gone — the re-click does that job. ⌘B is unchanged.

  Two views join the rail: the table and vault hygiene. ⚠️ Those are modals, not sidebar views —
  the rail opens them and leaves the sidebar alone, because routing them through the view state
  would leave an empty sidebar behind.

  ⚠️ Section heights are gone, and the stored values with them. Four sections sharing 260px meant
  none of them had room; height dragging handed that problem to the user rather than solving it.

  ⚠️ **Collapsing no longer unmounts the sidebar.** Width-zero plus unmount redrew the whole tree
  on every expand. It is a 34px strip now, and only the heavy contents are conditional.
- **The context panel becomes segment tabs** ([#265]). Same reasoning at 300px. The tell was that
  the outline defaulted to collapsed "because documents vary in length" — that is four sections
  competing for one column, not a property of outlines.

  The tab contents are untouched; only the container changed.
- **Tabs are underlined, not folder-shaped** ([#265]). The chip worked by having the active tab
  climb onto the content surface and join the page below it. With 3.0's surfaces the seam between
  them is too faint to read. An underline does not depend on surfaces.

  Drag reordering, the context menu, pins, and the dirty dot are unchanged.
- **The shell gets a title bar and a status bar** ([#264]). Two full-width rows the window owns,
  rather than rows a note owns.

  v2.0.0 dissolved the global top bar into the note header because Discord has no global bar.
  What Discord also does not have is a vault, an indexing pass, and one-vault-per-window — those
  belong to the **window**, and a note header has nowhere to put them when no note is open.

  The vault menu, the ⌘K command bar, and the index state move up; watch state, note count,
  document stats, and the current path move down. The note header keeps the name of what you are
  looking at, and nothing else.

  ⚠️ **Indexing shows real progress now.** The old strip was an infinite sliding bar — it says
  "working" and not "how much longer", and on twelve thousand notes that is the difference that
  matters. `buildProgress` had done/total all along and the screen was not reading it.

  ⚠️ Watch state and note count used to live in the sidebar footer, so **collapsing the sidebar
  hid them** — as though collapsing a panel stopped the watcher.
- **`data-lapis="titlebar"` joins the custom-CSS contract** ([#264]).
- **The accent splits into three** ([#263]). One value cannot carry fills, text, and borders at
  once — something always falls under threshold. The old Blurple was chosen for fills and measured
  **3.7:1 as text**, which is where links used it.

  `--accent-solid` fills, `--accent` draws focus rings and borders, `--accent-text` is for letters.
  Same contract as `--danger`/`--danger-text`, with the same guard: `accentText.test.ts` refuses
  `color: var(--accent)` anywhere.

  ⚠️ The twenty-six presets **derive** the other two rather than listing them. A hand-written value
  per theme is a value you can forget on the twenty-seventh, and a forgotten one leaves that theme's
  links the default blue while everything else moves — the screen looks fine and one element is
  wrong. Derivation moves lightness only; hue is the theme's identity and shifting it would make
  twenty-six themes resemble each other.

  ⚠️ A fixed −12% left `teal` at **4.4994:1** — under by six ten-thousandths, the same shape as the
  `--n-700` fix in 2.1.0. The fill now darkens until it has real headroom. All twenty-six are
  measured per theme, on that theme's own tinted surface.
- **New color foundation — Ink & Pyrite** ([#263]). The neutral ramp goes from nine flat greys to
  eleven steps tilted very slightly toward blue, and two steps are added where the shell's three
  layers, cards, and hover states had been sharing one. Dark stays the only theme.

  ⚠️ **Borders are hairline rgba now, not opaque grey.** Contrast between surfaces already
  separates the shell regions, so borders are left to divide cards and inputs *within* a surface.
  Custom CSS that layered its own color over `--border-*` will land differently.

  ⚠️ **Overlay layering is inverted.** Popovers and modals used to be darker than the page (the
  Discord idiom). With a scrim in play a card has to be *lighter* to lift off the background.

  Measured on the new content surface: body text 11.93:1, secondary 8.53, muted 5.74, accent text
  5.72, danger text 6.29.
- **Motion budget widened** ([#263]). `--dur-fast/base/slow` (100/150/200) become `--dur-1..4`
  (90/140/220/320). The old names remain as aliases **for one release**.

  ⚠️ `motion.ts` carries the same numbers for Svelte transitions, which CSS `prefers-reduced-motion`
  cannot reach. Changing one side alone makes the same gesture run at two speeds depending on
  whether CSS or JS draws it.

## [2.4.1] — 2026-08-27

### Fixed
- **Turning on MCP queries could do nothing, silently** ([#261]). Two defects, either of which
  produces "I switched it on and it did not take":

  `setMcp` returned early when the new value equaled the store's — so if the store and the file
  ever disagreed, **the one control that could fix it neither wrote nor said anything**, and the UI
  already showed the desired option as active.

  And nothing checked whether the write landed. `settingsWrite` not throwing was treated as
  success, but a write can **succeed into a different file** (the dev/release split), which is not
  an exception — it is a normal return. That can only be caught by reading back, so `patchSettings`
  now does, and throws when the value is not there. ⚠️ It leaves the store alone in that case:
  updating it would produce exactly the state being diagnosed, where the screen changed and the
  disk did not.
- **The settings screen shows which file MCP actually reads** ([#261]). A dev build writes to the
  `-dev` directory while the MCP gate looks at the release file first, so switching MCP on in a dev
  build cannot reach MCP. That is correct behavior producing an identical symptom to a real bug,
  and the two were indistinguishable. The MCP row now names both paths, in warning color when they
  differ.
- **The property audit counted everything twice** ([#261]). Rust puts every frontmatter key into
  `props`, including the typed `doc_kind` and `topic`, and the audit counted both sides. It
  reported `todo 6 · todos 4` where the truth was `3 · 2`. Which values had split was right and
  only the numbers lied — which is why nobody doubted them.
- **A note's own H1 was read as a mention of another note** ([#261]). Two projects keeping a
  document each on the same concept end up with the same title; one note's H1 then matches the
  other's frontmatter title, and the unlinked-mentions audit called that a mention. A body's first
  H1 is the note's own name — masked now, for the same reason `title:` is.

  That makes three false-positive classes this audit has shed from measurement rather than from
  reasoning about it.

## [2.4.0] — 2026-08-27

### Added
- **The MCP server can ask about vault hygiene** ([#259]). The audits stood at five in the app,
  five in the CLI, and **zero in MCP** — an assistant could search a vault but not ask what was
  broken in it. `lapis_query` takes `audit: "broken" | "orphans" | "unlinked" | "tags" | "props"`.

  It calls **the same pure functions** the app and the CLI call. A separate judgement here would
  mean the state an assistant sees and the state a person sees can disagree, with no way to tell
  which is right.

  ⚠️ There is no `all`. Only `unlinked` reads every note body, so folding it into `all` charges
  that cost to the four cheap ones — and leaving it out while calling the argument `all` is a lie.
- **`lapis export --all --out-dir <dir>`** ([#259]). The whole vault, **mirroring its directory
  structure**. Flattening would put `a/Note.md` and `b/Note.md` in one directory to fight over a
  filename, and the loser disappears without a word.

  `--all` without `--out-dir` is refused: hundreds of documents concatenated onto stdout is not a
  document, and doing that quietly is worse than stopping.
- **The palette reaches all five audits** ([#259]). One command opened the hygiene panel on its
  first tab; getting to "properties" took two more clicks. Each audit has its own entry now.
- **Heading autocomplete in wikilinks** ([#258]). Typing `[[Note#` now offers that note's headings.

  ⚠️ Before this, it did the opposite of nothing — the trigger treated `#` as part of the name, so
  `[[boundary-contracts#` searched for a note by that literal name and **the list went empty**.
  2.2.0 added the syntax and never added a way to type it; you had to remember the heading exactly.

  `[[#Heading]]` completes from the **buffer being edited**, not from disk — the most common moment
  to write an anchor is right after writing the heading, and a note read from disk would not have it
  yet.

  A note that does not resolve falls back to name completion, so `[[C#` still offers `C#.md`. Same
  precedence as resolution itself.
- **Transcluded content says where it came from** ([#258]). A border marks it as somebody else's
  writing; it did not say **whose**. The source is now a line above the excerpt, and it is an
  ordinary wikilink — the existing click path handles it rather than a second one being built.

  Failed embeds get no such line. There is nowhere to go.
- **The editor knows the new syntax** ([#258]). `> [!WARNING]` and `![[Note]]` were plain text
  while editing and colored in the preview, so a typo like `[!WARN]` was only visible after
  switching modes.

  ⚠️ **An unknown callout type is marked differently** — that is the point. Coloring only the
  recognized ones leaves a typo as unhighlighted text, which reads as normal. Unknown types get the
  danger color *and* a wavy underline; color alone gets skipped over.

## [2.3.1] — 2026-08-27

### Fixed
- **`--danger` was still the text color in fifteen places** ([#256]). 2.3.0 measured the problem
  and moved only the callout; the rest were left for a pass with eyes on them. This is that pass.

  Measured against every surface the app puts text on, `--danger` lands between 3.35:1 and 4.37:1 —
  under AA on all four. `--danger-text` lands between 5.54 and 7.22. Borders keep `--danger`: the
  non-text threshold is 3:1 and it clears that.

  ⚠️ The guard reads `app.css` and **resolves the real tokens** rather than restating hex values.
  Writing them out by hand is how the first draft ended up measuring `--surface-content` as the
  wrong ramp step and reporting a pass that was not one.
- **Code blocks had no background** ([#256]). `.rendered pre` sets `--surface-sunken`, and the very
  next rule — `.rendered .hljs { background: transparent }` — beat it on specificity for every
  fence, because they all render as `<pre class="hljs">`. The comment directly above said the
  background belongs to the `pre` rule; the code said otherwise, and only the border was left on
  screen.

  `transparent` is the idiom for cancelling a highlight.js **theme stylesheet**, and this
  repository does not load one. It was guarding against something that is not there.

## [2.3.0] — 2026-08-27

### Added
- **Transclusion** ([#254]). `![[Note]]` expands the whole note where you wrote it;
  `![[Note#Heading]]` expands just that section — heading line included, down to the next heading
  at the same or higher level.

  This is what [#246] was groundwork for: anchors had to resolve before a slice could be addressed.

  ⚠️ **A failure stays in its place.** An embed is part of a sentence's surroundings, so an empty
  gap is hard to notice — nothing says what used to be there. A missing note, a missing heading, a
  cycle, a chain too deep: each leaves a line naming what could not be pulled in.

  ⚠️ **Cycles and depth are both cut, on purpose.** A cycle alone would be caught by the depth
  limit and vice versa, but they say different things. Turning either one off in a canary still
  terminated — the other caught it — while producing the wrong message.

  The app fills placeholders by walking the DOM after render (reading a note is IPC, and
  markdown-it is synchronous); the CLI walks the string. **The rules are shared** — depth, cycle
  detection, and the failure wording all live in one module, because a split there would make the
  same document read differently in the two places.

  ⚠️ An embed on a line of its own is what this assumes. The placeholder is a block element
  emitted from an inline rule, so text sharing its line ends up outside the paragraph.
- **`lapis export <note>`** ([#253]). One self-contained HTML file, from the terminal. The app has
  had this since 2.0; the CLI is where the other headless consumers live, and it did not.

  Same assembler as the app (`previewExportDoc.ts`). What differs is where the material comes from,
  and the difference is documented rather than hidden — the app clones the **live DOM** because
  Mermaid only becomes `<svg>` after mounting, and there is no browser here. So Mermaid stays a
  code fence, and token values are read out of `app.css` plus whichever color theme the settings
  file names, rather than from `getComputedStyle`. Custom CSS does not carry over.

  ⚠️ Images that cannot be inlined are **counted and reported**. Leaving the original path in
  silently would make "self-contained" a lie. Remote images are deliberately left alone: fetching
  and failing loses the picture entirely, while the URL still works online.
- **Settings search** ([#252]). A box in the settings header that searches **across** categories —
  knowing which category holds a setting is exactly what you lack when you go looking. Each result
  names its category, and clicking one takes you there.

  Splitting settings into categories in 2.0.0 took something away: a single scrolling list could be
  searched with the browser's own find. This gives that back.

  ⚠️ The search does not filter the categories in place, because they are not all rendered — an
  inactive category is absent from the DOM, which is why the heavy CodeMirror editor only mounts
  when Advanced is opened. Search swaps in a result list instead.

  ⚠️ That means the list of settings lives in **two** places: the markup and a search index. Adding
  a setting without indexing it makes one that exists but cannot be found — quiet, and easy to read
  as "there is no such setting". A guard reads the markup and checks that every title appears in
  the index under the right category.

  Matching ignores whitespace, so "사용자정의css" finds "사용자 정의 CSS", and descriptions are
  searched too — people do not remember names exactly.
- **Callouts** ([#251]). `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`.

  Measured first: 41 of this vault's files carry 218 hand-rolled callouts written as `⚠️ **…**`.
  The syntax was missing, so bold text and an emoji stood in for it.

  ⚠️ **Only the five GitHub supports.** Obsidian takes a dozen more, but these documents are also
  read on GitHub — the repository is public and the README and changelogs render there. Anything
  outside the intersection shows up in one place and not the other. An unknown type is left as an
  ordinary blockquote on purpose: `[!QUESTION]` stays visible, so whoever wrote it can see why it
  did not take. Swallowing it silently would not tell them.
- **frontmatter hygiene — the fifth audit** ([#250]). Values that have split apart on an axis you
  can filter by. `lapis props audit`, a fifth tab in the vault hygiene panel, and a row in
  `lapis doctor`. The first four audits look at the link graph; this one looks at the axes.

  ⚠️ **It is quiet.** A query does not error — it finds half of what it should. On the real
  vault today: `doc_kind` holds both `todo` and `todos`, and `status` has split into twelve values
  (`반영됨` 18, `완료` 2, `해결됨` 1, plus six free-form variants like `완료 — #232`).

  Three checks, the same shapes the tag audit already looks for on tags: case-only, singular/plural,
  and shared prefix.

  ⚠️ **What it does *not* look at is the point.** Only two fields are excluded by name — `tags`
  (the tag audit has it) and `aliases` (those are names, splitting is normal). Everything else is
  filtered by shape: a field whose values barely repeat is free-form, not an enum; a field whose
  values **resolve to notes** is a cross-reference, not a value.

  That last rule came out of measurement. Before it, half the findings on the real vault were
  `related`: `feeds`, `feeds-excerpt-only`, `feeds-settings-hardening`. Those are three different
  documents — similar names are a normal property of document titles, not a defect. A hand-kept
  list of field names would have needed editing every time a new field appeared; asking the index
  "does this value resolve to a note?" does not.

  Free-form values are not called errors. `status: 완료 — #232` is useful to a person. All the
  audit reports is that several values start the same way.

### Fixed
- **The CLI and the MCP launchers did not run on Windows** ([#249]). `cli/lapis` and
  `mcp/lapis-*` are `#!/bin/sh` scripts. Typing `cli/lapis …` in PowerShell opens a **"choose an
  app to open this file"** dialog — not an error, not a "not supported" message. Pick an editor
  and you are looking at the shell script.

  `cli/README.md` had ruled a Windows shim out: *"one more truth to maintain, and the main
  development environment is macOS"*. That reasoning does not survive contact — Windows is a
  first-class target here (the Rust CI job runs on both), and the fallback advice, "use Git
  Bash", assumes something that is not true by default: a stock PowerShell `Path` has neither
  `sh` nor `bash`.

  Each shell wrapper now has a `.cmd` twin. The maintenance worry is paid for with a guard rather
  than a rule: `scripts/launchers.test.ts` checks that every sh wrapper has a `.cmd` beside it,
  that the two name **the same entry point**, and that both bundle runners keep the two contracts
  they share (the `$lib` alias, the `LAPIS_REPO` handoff). A fifth wrapper added on one side only
  turns it red.

  ⚠️ `*.cmd` is pinned to CRLF in `.gitattributes`. The repo forces LF everywhere else, and
  cmd.exe misbehaves on LF-only batch files in ways that do not announce themselves.
- **A native path would have put the whole path in the exported title** ([#253]). `$lib` assumes
  `/` separators — the `to_ui` contract — and the CLI sits outside that pipeline. Real calls pass a
  cache path, which is already normalized, but a Windows path produced
  `<title>C:\\Users\\…\\note</title>`: the document renders fine and only the tab name is wrong.
  Normalized at the boundary now.
- **The rendered-body stylesheet was imported from a single route** ([#251]). It lived in the main
  page component, so the component preview route rendered Markdown with **no styling at all** —
  the five callouts came out identical, with no error anywhere. Exactly the shape of the custom-CSS
  bug fixed in [#243]; the stylesheet import did not get moved at the same time. It is in the root
  layout now, with a guard.

  Found by reading computed colors out of a real browser. Every test passed while it was broken —
  they check structure, and happy-dom has no layout engine.
- **`--danger` is not readable as text** ([#251]). It measures 3.35:1 against the content
  background, under the 4.5 threshold. The saturated red is right for fills and borders and wrong
  for letters — the same shape as the `--n-700` fix in 2.1.0. `--danger-text` (5.54:1) joins the
  palette and the caution callout uses it.

  ⚠️ Eight existing places still set `color: var(--danger)`. They are being moved separately, with
  eyes on them — changing them all at once would make it impossible to see what shifted.
- **A callout titled with the accent color would have been unreadable in most themes** ([#251]).
  On the default accent it measured 2.37:1 over its own tint, and the twenty-six color themes each
  move `--accent` somewhere new, so the number is a lottery. `note` is neutral instead; the other
  four use status colors, which themes do not touch. Measured: 4.65 to 11.48:1, all above AA.

## [2.2.0] — 2026-08-27

### Added
- **Wikilinks can point at a heading** ([#246]). `[[Note#Heading]]` opens the note and scrolls
  there; `[[#Heading]]` moves within the current document. Markdown links have always dropped the
  anchor before resolving (Rust does it during extraction) — wikilinks never did, so `[[Note#H]]`
  resolved to nothing.

  That failure was quiet in two places at once. The link rendered grey as if the note did not
  exist, it was reported under broken links, and the **backlink edge disappeared** — the target's
  backlink list was simply one row shorter, with nothing to indicate why.

  ⚠️ **The whole target is looked up first, and only a miss is read as an anchor.** A file name may
  contain `#` (`C#.md`), and the other order would send an already-working `[[C#]]` quietly to
  `C.md`. Written this way the fallback cannot change any link that resolves today.

  A heading that is not there does not scroll anywhere. Landing at the top of the right note beats
  landing on the wrong heading, which reads as if it were the right one.
- **Unlinked mentions — the fourth audit** ([#245]). Places that name another note without linking
  to it. `lapis links --unlinked`, a fourth tab in the vault hygiene panel, and a row in
  `lapis doctor`. Broken links ask "pointed at nothing", orphans ask "nobody points here"; this one
  asks **"said it, never pointed"** — the same graph from a third angle.

  It lists and stops there. No convert-to-link button: the audits all behave this way, and a bulk
  action over a list that still contains false positives spreads one mistake across the vault.

  ⚠️ **Keeping false positives out is the whole feature.** The known weakness of the reference
  implementations is noise, and a noisy list is one nobody opens. Eight rules do the filtering, and
  each was measured by switching it off against a real 81-note vault:

  | switched off | mentions reported |
  |---|---|
  | nothing (shipped) | **2** |
  | code exclusion | 63 |
  | sources already connected to the target | 5 |
  | frontmatter exclusion | 5 |
  | ambiguous-name rejection | 3 |

  A two-item list looks like a feature that found nothing. The table is how you know it is a vault
  that is genuinely well linked — loosening any single rule multiplies the list by up to thirty.

  Only this audit reads note bodies; the other three need the index alone. That makes `doctor` read
  them too: 0.73 → 0.79 s on the same vault (+54 ms), and on a large vault this row dominates.

### Fixed
- **`lapis index` committed a cache the same CLI refuses to read** ([#247]). The command drives the
  installed app to write the cache. When that app is a version behind, it writes the older cache
  format — and then prints `커밋했다. 앱을 켜면 이 인덱스를 그대로 읽는다(재색인 없음)`, while
  `lapis doctor` on the same vault rejects it as `version_skew`. **What it just made, it cannot
  read**, and it reported success.

  Found by running the command against a scratch vault while working on something else. The
  existing guard covers an old app that *ignores* the flags; this is an old app that accepts them
  and writes a different version.

  It stops before building shards now. Not a hard failure, because the cache is not worthless —
  the app that wrote it reads it fine; the CLI and the MCP server are the ones locked out. So
  `--allow-version-skew` is there, and taking it changes the last line to say who can read the
  result. A warning during the run is not enough: that scrolls away, and the last line is the one
  people read.
- **Renaming a note dropped the anchor from wikilinks** ([#246]). `[[old#Heading]]` became
  `[[new]]`. Markdown links preserved anchors from the start; the wikilink pattern matched only
  `[[stem]]` and `[[stem|alias]]`. It never mattered while anchors did not resolve — now it would
  be a rename silently breaking a link.
- **Three of the first five hits were notes that already linked to the target** ([#245]). Found by
  running the audit against a real vault before shipping it. All three had the same shape — a link
  written with the filename and the description written with the title:

  ```md
  - [[STATE]] — Lapis progress
  ```

  The linked span is masked, the title sitting next to it is not, so a note that already points at
  the target was reported as not pointing at it. Sources already connected to the target — by body
  link or by a frontmatter relation — are now left out entirely. Note-level, not line-level: this
  audit looks for **missing edges**, and once the edge exists it does not matter which line repeats
  the name.

### Internal
- **The masking pass has a test of its own** ([#245]). Line numbers are counted from offsets into
  the original text, so the mask replaces code and frontmatter with spaces rather than removing
  them. If that length preservation ever breaks, nothing throws — every reported line number just
  quietly shifts and still looks plausible.

## [2.1.0] — 2026-08-27

### Added
- **Twenty-six colour themes** ([#243]). Dark is still the one theme; these sit on top of it,
  fourteen changing only the accent and twelve tinting the background as well. Settings →
  Appearance. Custom CSS still overrides individual tokens on top of whichever is selected.

  They are data, not a second palette in `app.css` — that duplication was removed in 2.0.0 and a
  guard keeps it out. A preset is injected at runtime, between the stylesheet and custom CSS.

  ⚠️ **None of them was colour-matched by eye.** Doing that by hand across twenty-six themes
  guarantees a few unreadable ones, and an unreadable theme is not an error — it is just a bad
  screen, seen only by whoever picked it. Instead a tint preserves the **WCAG relative luminance**
  of every step it touches, by construction: contrast ratios depend on luminance alone, so
  holding it constant holds legibility constant. Measured across themes, body text lands between
  9.29 and 9.41 against a default of 9.36.

  An accent cannot inherit that — its colour is the whole point — so the text placed on it is
  computed instead, black or white by whichever contrasts more. Amber and Ember get black text
  without anyone deciding that.
- **The custom CSS editor opens with a worked example** ([#243]). Every rule in it is commented
  out; uncommenting one and saving changes the app. An example that only describes the hooks
  does not show what can be grabbed.

  It is shown, not stored. Seeding it as the saved default would erase the difference between
  "nothing configured" and "configured to nothing", and then clearing it would either bring it
  back or lose it for good.

### Fixed
- **The text-muted token had no contrast headroom** ([#243]). At `#949ba4` it measured exactly
  4.505:1 against the content background — over the 4.5 threshold by four thousandths. Rounding
  a tinted variant to 8 bits was enough to push it under. It is now `#989fa8` (4.73:1), which is
  not visibly different and leaves room to move. This was a latent fragility in the default theme,
  not only in the new ones.
- **Custom CSS was injected from a single route** ([#243]). The effect lived in the main page
  component, so anything rendered outside it — the component preview route, for one — took the
  stored CSS and theme but never applied them. It runs from the root layout now.

### Internal
- **The CSS token guard no longer objects to component-local properties** ([#243]). A custom
  property set inline on an element and read by that same component's stylesheet has no business
  in `app.css`, but the guard counted it as undefined. Previously such cases went into a
  hand-maintained allowlist; the guard now asks whether the same file defines the property.
  A list that grows every time it is wrong ends up excusing the typos it exists to catch.

## [2.0.0] — 2026-08-27

> **⚠️ Breaking — the light and system themes are gone.** There is one theme now, and it is dark.
> Colour is changed through custom CSS instead. Any theme preference stored from an earlier
> version is ignored.

### Changed
- **The interface follows Discord's visual grammar** ([#235], [#236], [#237]). The neutral ramp
  was a blue-leaning slate; Discord's is a near-desaturated grey, and that accounts for most of
  the difference in impression. The three shell surfaces now sit on Discord's own three:
  rail `#1e1f22`, sidebar `#2b2d31`, content `#313338`.

  The accent had already been Blurple since v1.x, so this is a continuation rather than a turn.

  Corners went up where it counts — `--r-sm`, used in 43 places, moved from 4px to 6px. `--r-lg`
  was raised to 16px and then put back: modals use it, and 16px made them rounder than Discord's
  own. Wanting something to look like Discord is not the same as wanting it rounder.

  Hover and active transitions get a separate easing curve from entrances. The existing curve
  overshoots, which is right for a modal appearing and wrong for a colour change under a moving
  cursor — it reads as a bounce.
- **The global title bar is gone; the note has a header instead** ([#237]). Discord has no global
  bar: the name of what you are looking at sits directly above it. Visit history, the note path
  and the save badge moved into that header, and the word "Lapis" was dropped — an app has no
  reason to display its own name at all times.
- **Settings are split into categories** ([#239]). Appearance, Language, Vault, Advanced, in a
  list on the left with the selected category's contents on the right. Seven sections in a single
  column meant scrolling and re-reading to find anything. The version number now sits at the
  bottom of the category list rather than in the window chrome.

### Added
- **Custom CSS** ([#238], [#239]). The design tokens in `app.css` and fifteen `data-lapis` hooks
  are a documented, stable contract; internal class names explicitly are not. Drawing that line
  narrowly is deliberate — a wide one turns the internal structure into a public API and freezes
  it.

  The editor lives under Advanced: syntax colouring, bracket matching, and real formatting, and
  a failed format doubles as the syntax check. Saving is an explicit action, because saving on
  every keystroke would make the app vanish somewhere in the middle of typing
  `[data-lapis="app"] { display: none` — before the closing brace.

  ⚠️ **Three ways back.** One line of CSS can hide the window and the settings with it.
  `⌘⇧⌥C` (`Ctrl+Shift+Alt+C`) switches custom CSS off — a key handler runs regardless of what
  the styling is doing, so it works on a blank screen. `lapis css --off` edits the settings file
  from a terminal for when the app will not start at all; it disables the CSS without deleting
  it. Failing those, removing the settings file resets everything.

  A preview step is **not** one of those ways: `display: none` looks identical in a preview.
  A safeguard that only works when you already noticed the mistake is not a safeguard.

### Fixed
- **The same colour was defined in three places** ([#235]). `app.css` carried the palette under
  `:root`, again under `[data-theme="light"]`, and a third time inside a
  `prefers-color-scheme` block — with a comment instructing whoever edited one to remember the
  others. Nothing enforced it, and a drift there is invisible to anyone using dark. Removing the
  light and system themes took 135 lines out of the file, and a guard now rejects a second
  palette while still allowing the deliberate compact-density variant.
- **The editor and the preview highlighted search matches differently** ([#236]). Both hardcoded
  their own colours and the two had already drifted — 30% against 35% opacity, a different orange
  for the current match. Moving between editing and reading changed how a match looked. They
  share four tokens now.

### Internal
- **Guards for the contracts this release introduces** ([#235], [#238], [#239]). That a palette
  stays single; that every `data-lapis` in the contract exists in the markup and every one in the
  markup is in the contract; that the panic shortcut is checked before any other key handling;
  that every settings row sits inside a category, since one outside is invisible while still
  compiling and passing tests.

  Two of them were wrong on the first attempt and only a canary showed it. One counted `{#if}`
  depth with a plain counter, which nested conditionals inside a section drove negative — it
  caught nothing. The other read a documentation comment as a real attribute.
- **Formatting loads on demand** ([#239]). Bundled statically, prettier landed in an 852 KB chunk
  the entry point pulled in immediately — every launch paid for it whether or not settings were
  ever opened. Behind a dynamic import it splits into 156 KB and 82 KB, fetched the first time
  Format is pressed. One press is slower; every launch is not.
- **Three open measurement questions were closed without building anything** ([#240]). Whether to
  index `aliases`, whether the `name` field earns its place, and whether the Korean bigram
  tokenizer over-matches. None can be answered from this corpus: it contains no aliases at all,
  its filenames are Latin while its titles are not, and the over-matching was observed on 19,225
  notes where this vault has 71 — a match count cannot exceed the number of notes.

  The limits are recorded in the harness itself, so the next attempt starts by looking at the
  corpus rather than at the tool.

## [1.20.0] — 2026-08-27

> **⚠️ This release reindexes once on first launch.** `CACHE_VERSION` goes 8 → 9 because the
> full-text index gained a field, so existing shards cannot be reused. Unlike the v1.17.0 cache
> migration — which only renamed files — this one rebuilds. Large vaults will spend a moment on it.

### Added
- **A note's title is now its own search field** ([#233]). The full-text index carried only
  `name` and `body`. `name` is the filename, which in these vaults is English kebab-case, so
  `boost: { name: 3 }` did nothing at all for a Korean-language title query. The frontmatter
  `title` had no field of its own — its text sat inside `body`, weighted like any other prose.

  Measured on one vault with the index shape as the only variable (69 notes, 204 cases):

  | fields | overall | title | **title, 2 words** | body | MRR |
  |---|---:|---:|---:|---:|---:|
  | `name`, `body` | 79.9% | 91.2% | **64.7%** | 83.8% | 0.870 |
  | `name`, `title`, `body` | 89.7% | 98.5% | **85.3%** | 85.3% | 0.943 |

  Two earlier attempts at this had failed — swapping the tokenizer moved it 1 point, and the
  four-stage combination ladder moved it not at all.

  ⚠️ **Read that number carefully.** The harness draws its queries from the frontmatter `title`,
  so indexing that field separately is partly teaching to the test. Body queries, which owe
  nothing to the title, went 83.8% → 85.3%. The honest claim is not "search got 10 points
  better" but **"finding a note by a title you half-remember got much better"** — which is the
  situation this harness was built to model.

  No boost is applied to the field. Varying it from 0.01 to 100 changes nothing: clean queries
  all resolve at the `AND` stage, which passes its search options explicitly, so a per-instance
  boost never arrives. The gain comes from BM25 length normalisation — a term in a short title
  field outweighs the same term buried in a long body. A number that does nothing would read as
  a tuned value to whoever comes next.

### Fixed
- **The search-quality harness reported success having measured nothing** ([#232]). Running
  `./mcp/lapis-eval --vault <path>` produced `0 cases`, every quality figure as `NaN%`, and a
  final line reading pass, with exit code 0.

  Three things had to line up. `Number("--vault")` is `NaN`, and `slice(0, NaN)` is an empty
  array — no exception, no warning. `--vault` was never a supported option, yet nothing rejected
  it, so it silently consumed the positional argument that was meant to be the sample size. And
  the verdict at the end only ever checked the latency budget.

  A measuring tool is what other decisions rest on. Change the tokenizer, run this, read "R@1
  unchanged" — and nothing was ever compared. `mcp/benchRun.ts` had the same line, where
  `Math.max(200, NaN)` is also `NaN`.

  Both tools now parse arguments properly, support `--vault` and `--help`, and reject anything
  unrecognised — the discipline `cli/README.md` already described and a sibling tool was not
  following. Zero cases is now an error, not a pass.

### Internal
- **A guard ties the index shape to `CACHE_VERSION`** ([#233]). `CLAUDE.md` warned that
  `fullTextOptions.ts` sits outside that version's protection, but nothing enforced it, and
  forgetting means old shards are read by new query code with no error and quietly wrong results.
  The guard fingerprints what actually determines the stored index — `fields`, `tokenize`,
  `processTerm` — and pins it beside the version. Query-time values (`boost`, `bm25`, `fuzzy`)
  are deliberately excluded: including them would force a full rebuild for every ranking tweak,
  and a guard that noisy gets switched off.
- **A duplicate `FullTextDoc` was removed** ([#233]). `searchIndex.ts` carried a second copy of
  the interface and the app built its documents against that one while the index was configured
  from the other. The two happened to agree, so nothing was wrong — until a field was added to
  one of them. Each file stays internally consistent, so type checking never objects; only the
  search results are wrong. Deleting the copy immediately revealed two more document-producing
  sites, both on the incremental-update path, where only edited notes would have been indexed
  in the other shape.

## [1.19.0] — 2026-08-27

### Fixed
- **A stale index answered confidently, and only one command said so** ([#228]). The CLI reads the
  search index; it never builds one. So when the vault is newer than the index, answers can be out
  of date. `mcp/README.md` documented the contract — report staleness, do not block — but **only
  `lapis search` implemented it.**

  `backlinks`, `list`, `links --broken`, `links --orphans`, `tag audit` and `replace` all stayed
  silent. Running the audits right after adding notes returned no broken links and 1 orphan; after
  a reindex the same vault had 3 orphans. The answer did not change — the first one was wrong, and
  nothing suggested it might be.

  Every read now reports it, in prose and as a `stale` field under `--json`. Reads are still never
  blocked: a live vault goes stale within seconds of being edited, so failing hard would make the
  tool unusable.

  **Writes are treated differently and now stop.** `tag rename --apply` and `replace --apply` walk
  the *indexed note list* while reading contents fresh from disk, so a stale list silently skips
  every note created since the last index — while reporting that 2 notes were updated. Reproduced
  on a throwaway vault: a note added after indexing kept its old text and nothing mentioned it.
  Both commands now refuse on a stale index (exit 2) and point at `lapis index`; `--allow-stale`
  forces it through. A stale read can be repeated; a partial write leaves a vault nobody can audit.
- **Typing the name of a command did not bring that command to the top** ([#228]). In `⌘K`, typing
  `위생` listed body-search results first and the matching command five rows down, even though the
  label of that command starts with the word.

  This was not a scoring problem. Commands were scored with a 1.2× boost, but the palette renders
  fixed groups and the command group was always last, so the boost could never move anything.
  The boost code reads correctly on its own — the file that decides position is a different one.

  A command whose label (or any word in it) starts with what you typed is now promoted above the
  results. Fuzzy-only matches stay where they were: a looser rule would push commands into every
  note lookup, which is worse than the problem. Group order is otherwise unchanged — positions that
  move around defeat muscle memory, and a mis-pick in the palette opens a note or a window.
- **Three keyboard shortcuts in the README did not exist** ([#226]). `⌥B` is actually `⌘⌥B`,
  `⌘←`/`⌘→` are actually `⌘⌃←`/`⌘⌃→`, and `⌘⇧B` (table view) was missing from the table entirely.
  Pressing what was written did nothing, which reads as a broken app rather than a stale document.
  The code was right; the README was not. The Development section now matches CI as well.

### Added
- **`lapis doctor`** ([#228]). Runs every audit at once — broken links, orphans, duplicate tags,
  ambiguous names — plus the index freshness check that otherwise needs a fourth command.

  The exit code carries meaning so it can be used from a hook or CI: `0` clean, `1` problems found,
  `2` could not run. **`doctor` is the only command that gives `1` a meaning beyond error**, so it
  is also the only one that reports an unusable vault as `2` — otherwise a mistyped path would be
  reported as a hygiene finding.

  Staleness is printed first, because how much to trust the numbers below depends on it, but it is
  not counted as a problem: a live vault is almost always slightly stale, and a check that always
  fails gets removed. Like the audits it wraps, `doctor` does not fix anything.

### Internal
- **Guards for the two drift classes above.** One reads the source of every handler and checks that
  a command reading the index reports staleness in **both** its `--json` and human output — the
  first version accepted either, and a canary showed that deleting the human-facing line still
  passed while the JSON field remained. That is the worst shape of all: the script gets the field,
  the person at the terminal sees a stale number with no warning. Another reads the palette
  component and checks its render order matches the declared `GROUP_ORDER`; the absence of that
  check is why score and position had been allowed to disagree.
- **Screens that are awkward to reach by hand can be opened directly** ([#229], [#230]). The
  vault-hygiene modal and the replace panel need real vault state before they show anything.
  `npm run dev` then `/dev/preview` renders them from fixtures, without Tauri, with a surface and
  theme switcher — for checking colour, spacing and alignment, which the DOM tests cannot see.
- **Those screens are now covered by tests** ([#227]). The audit and replace logic were already
  pinned as pure functions, and the CLI shares them, so the data was verified — what was not was
  how the markup draws it. A flipped condition removes a warning with no error at all, and in the
  replace panel those warnings are the last thing seen before an irreversible write. Icon
  containers (`.icns`, `.ico`) are also checked byte-for-byte against the source PNGs.

## [1.18.0] — 2026-08-26

### Fixed
- **A note name shared by two documents resolved to whichever one the walk reached first**
  ([#220]). The resolver was a flat vault-wide map from lowercase name to a single path, and the
  first writer won. Because the walk is alphabetical, a link written in one project silently
  pointed at a same-named note in another. Links were not broken — they went somewhere else.

  Resolution now keeps every candidate and picks the one nearest the linking note; frontmatter
  cross-references go through the same rule, which is where most of the leakage was. Names given
  by a person (`lapis open`, `backlinks`) have no such context, so an ambiguous one is now
  rejected with the candidate paths instead of guessed.

  Measured on a two-project vault: orphan notes went from 8 to 4, and the four that disappeared
  were all false — their inbound links had been captured by same-named notes in the other project.
- **Structural results came back in an unspecified order** ([#219]). Rows from `doc_kind`,
  `topic`, `tag`, and `backlinks_of` carry no score, and their order was whatever order the cache
  happened to store `link_infos` in — vault walk order for a full build, patched order after the
  app's incremental reindex. The same query returned a different order before and after a reindex.

  Order was not the only casualty: results are truncated to `limit` afterwards, so **which rows
  survived changed too**. Structural results are now sorted by vault-relative path, compared by
  UTF-16 code unit rather than `localeCompare` so the order does not depend on the machine's locale.

---

### Added
- **`lapis replace` and replace inside `⌘⇧G`** ([#224]). Vault-wide find and replace. Finding
  worked already; there was no way to act on it. **Dry-run by default** — `--apply` is required —
  and the write goes through the same `$lib/safeWrite` transaction as a tag rename: backup,
  sequential write, rollback on failure.

  ⚠️ Search and replace use **different regex engines**: `⌘⇧G` runs Rust `regex`, replacement runs
  JS `RegExp`, and they can match different text. So the counts shown before applying come from the
  replace engine, never from the search, and in the app a note the search did not surface is never
  written — a miss is recoverable, a wrong write is not. When the two disagree the app says so.

  Warnings come before the file list, not after it: a replacement that matches the pattern again
  (`a` → `aa` doubles on every run), and how many matches sit inside frontmatter where they can
  break the YAML.
- **Time axis — `--since`, `--sort`, `--by`** ([#223]). The vault records when every note was
  modified and nothing could ask about it. `checkStale` was already walking the whole vault on
  every query and throwing those timestamps away; frontmatter `date` was already indexed. Both are
  now query dimensions, on `search`, `backlinks`, and `links --orphans`, and in the MCP tool.

  There are two axes because they answer different questions and one of them lies. `mtime` is what
  you actually touched — but `git pull` and `checkout` rewrite it, and a fresh clone gives every
  file the same value, so after a pull "recently changed" means "whatever the pull touched".
  Frontmatter `date` is unaffected by git but only exists where someone wrote it.

  Notes with no value on the chosen axis are dropped from a `--since` filter and sorted last
  otherwise — and the dropped count is always reported.

  In the app the Command Palette's empty state gained a **Recently changed** group, kept separate
  from *recently opened*: a change made by an editor, by git, or by any other tool never appears in
  reading history.
- **New app icon.** Replaces the Tauri placeholder the project had been shipping with — indigo
  bracket mark with a gold gem, from a supplied vector source. `src-tauri/icons/lapis-light.svg`
  and `lapis-dark.svg` are kept so the set can be regenerated.

  A desktop app icon is a single asset, so the light variant is the one that ships: the dark one is
  nearly black and loses its silhouette against a dark taskbar or dock.
- **`lapis links --orphans` and `lapis tag audit`** ([#221]). Two audits that read what the index
  already holds. Orphans are notes nothing links to — the mirror image of the broken-link audit,
  and, since backlinks are the primary way to navigate, notes that are effectively unreachable.
  The tag audit reports duplicate candidates: the same leaf filed under two parents, tags differing
  only in case, and names that resolve to more than one note.

  Neither one tells you what to do. Orphan rows carry an outgoing-link count so an entry point
  (many outgoing, none incoming) reads differently from a stranded note, and merging is left to
  `tag rename`, which previews, backs up and rolls back.

  In the app the broken-link screen became **Vault hygiene** with three tabs. The Command Palette
  entry changed name accordingly.

---

## [1.17.0] — 2026-08-26

### Added
- **`lapis open <note>`** ([#216]). Opens a note in the running app, or starts the app if it is
  not running. No listening port is involved — the app binary is re-executed and its argv is
  handed to the running instance.

  Which window opens it is decided by the windows, not by Rust: Rust does not know which vault
  each window has, so it stages the request and every window asks whether it is theirs. If no
  window has that vault, a new one is opened for it.
- **`lapis index` — 앱 없이 인덱스를 다시 만든다** ([#215]). Rebuilding the search index used
  to require launching the app. Now the CLI can do it from a terminal, and the app reads the
  result on next launch with no reindexing.

  The work is split across a process boundary the same way the app splits it across IPC: Rust
  walks the vault (it is the only index producer), Node builds the MiniSearch shards (the options
  live in one place), Rust commits them in the order the cache contract requires.

  Against an older app that does not know the flag, the CLI says so instead of hanging — an
  outdated build silently opens a window and never returns, which is how it was found.
- **`lapis tag rename` — CLI layer 3** ([#213]). Renaming or merging a tag across the vault now works
  from a terminal. Child tags follow the parent, the boundary is only at `/`, and renaming onto an
  existing tag is called out as a merge before anything is written.

  **The dry run is the default.** Without `--apply` nothing is written — an irreversible operation
  should not run because an argument was left off. Writes go through the same `$lib/safeWrite`
  transaction the app uses (backup, sequential write, rollback on failure), and `cli/io.ts` re-asserts
  the guarantees the Rust command gives: atomic write, vault confinement resolved through symlinks,
  and the extension whitelist. A CLI that were looser would fork the safety rules it shares.

### Fixed
- **Legacy cache files could be left as orphans** ([#217]). The one-time rename introduced in
  [#214] only ran when the new-key file was missing, so if `lapis index` wrote the cache before the
  app was ever opened, the old file stayed on disk forever — the exact state [#214] set out to
  remove. Observed on a real cache while verifying the CLI.

  The sweep now also runs when the new-key file exists, and in that case removes the superseded
  file instead of renaming over it — renaming would replace a freshly built index with an older
  snapshot. Which side wins is decided from the meta file's mtime, once per key, so a snapshot is
  never split across generations.
- **The same vault could end up with two caches** ([#214]). The cache filename hash was computed from
  whatever path string the caller happened to pass, so `C:\Projects\x` and `C:/Projects/x`, a
  trailing slash, or a path reached through a symlink each produced a different name. The symptom is
  "why is it reindexing everything again", with the previous cache left behind as an orphan. Verified
  on this machine: the app's cache file matched the backslash spelling, and the same vault written
  with forward slashes hashed to a different name. The path is now canonicalised before hashing.

  Existing caches are renamed rather than rebuilt, the same way [#207] handled the previous hash
  change — the migration now tries both older generations.
- **A failed write could look like a success** ([#212]). The backup-then-write-then-rollback
  transaction returned nothing: on a failed backup it just `return`ed, so callers could not tell an
  aborted write from a completed one. The tag-rename dialog closed as if it had worked while nothing
  had been written — the worst way for an irreversible operation to fail, because it makes you believe
  it is done. It now returns an outcome, the dialog stays open with the reason, and the note-rename
  path logs a readable summary.

  The transaction also moved out of the Svelte store into `$lib/safeWrite` with its IO injected. It
  had one consumer, then two (#202 exported it), and a third was coming. Rules for irreversible writes
  must not fork — a fork is how a fix lands on one path and not the other.

---

## [1.16.0] — 2026-08-26

### Added
- **A command-line interface** ([#210]). The same index the MCP server exposes to an agent is now
  reachable from a terminal, without the app running: `search`, `backlinks`, `list`, `links --broken`,
  `status`. Every command takes `--json` and prints the shape `lapis_query` returns, so a script or
  an agent does not have to learn a second format.

  It calls `lapisQuery()` directly rather than reimplementing anything — one ranking, two consumers.
  The command surface (names, options, help text) lives in a single array that `--help`, argument
  validation and a parity test all read, so the help can not drift from what the parser accepts.
  Unknown options exit `2` instead of being ignored: silently dropping `--limt 5` returns a
  default-limit result that looks like the requested one.

  The contract, exit codes, and a layered plan for what is deliberately **not** built yet — headless
  indexing, writes, driving the running app — are in [`cli/README.md`](cli/README.md), in the
  repository rather than in a symlinked notes tree, so they travel with a clone.

### Fixed
- **Every MCP query would have failed after upgrading to v1.15.0** ([#209]). The app moved to cache
  version 8 ([#201]) but the MCP server's expected version stayed at 7, so it would reject a perfectly
  healthy cache with `version_skew` — the tool dies completely while the index is fine.

  The test suite could not catch this **by construction**: `mcp/fixture.ts` writes caches with the
  TypeScript constant and the server reads with the same constant, so the two always agree no matter
  how far either drifts from the app. A guard now reads the Rust source directly and compares, which
  is the only place the two truths meet. Four tests that hardcoded `version: 7` — a literal that
  happened to equal the constant — now use the constant, so they keep testing what they meant to.
- **A frontend wrapper called a Tauri command that no longer exists** ([#208]). `writeSearchCache`
  was the pre-sharding (cache v3) writer; the Rust command was removed in v4 but the TypeScript
  wrapper stayed, so a function that dies with "command not found" sat there looking like API. Command
  names are **strings** — no type checker reaches them, so `tsc`, `svelte-check` and `cargo` all
  passed and the breakage would only surface when someone called it. A test now fails if any
  `invoke("x")` has no matching entry in `generate_handler!`, naming the file. The unused
  `gitHasChanges` wrapper is removed too.

  A second guard checks that `ko.json` and `en.json` carry the same key set. A key present in only one
  locale is not an error either — paraglide falls back to the base locale, so one English sentence
  appears in a Korean screen and nothing complains.
- **Hover and selection styling in the table view did nothing** ([#206]). `TableView.svelte` referred to
  `--surface-hover` (4 places), `--accent-soft` (1) and `--text-tertiary` (6), none of which exist in
  `app.css`. An undefined custom property is **not an error** — the declaration is simply dropped, so
  the build passed, `svelte-check` passed, and row hover, chip selection and de-emphasised text quietly
  did nothing. They now use the tokens that were meant: `--surface-raised`, `--accent-bg-subtle`,
  `--text-muted`. A test now fails if any `var(--x)` in the source is missing from `app.css`, with the
  offending file named in the message.
- **The search cache filename came from an unstable hash** ([#207]). `vault_key` derives the cache
  file's name from the vault path with `DefaultHasher`, whose values std explicitly does not guarantee
  across builds. If that value ever shifted, the app would look for a filename that does not exist —
  a silent full rebuild, with the previous cache left behind as an orphan nothing would ever read or
  clean up. Same root cause as the fingerprint fixed in v1.15.0, in a place where the symptom is
  slowness rather than a wrong answer. It now uses the specified FNV-1a construction from
  `crate::hash`, shared with the fingerprint so there is one written contract instead of two habits.

  Existing caches are **renamed, not rebuilt**: on the first read that misses, the old name is looked
  up and the files are moved. No version bump and no second reindex. If the old name cannot be
  reproduced the result is exactly today's behaviour — a rebuild — so the migration is never worse
  than doing nothing.

---

## [1.15.0] — 2026-08-26

### Added
- **Rename or merge a tag across the vault** ([#202]). Tags form a `/`-separated hierarchy that the
  sidebar renders as a prefix tree, but fixing a single typo meant opening every note that carried it
  by hand. Renaming a note has rewritten its inbound links for a long time; tags had no counterpart.
  Child tags follow the parent — renaming `tech` to `stack` turns `tech/svelte5` into `stack/svelte5`
  — and the boundary is only at `/`, so `technical` is left alone. Renaming onto an existing tag
  merges the two and is called out as such before you commit to it.

  It reuses the note-rename transaction exactly: dry-run preview, backup, sequential write, rollback
  on failure. And like `related:` rewriting, it edits the YAML **line by line rather than parsing and
  re-serializing** — that is the lesson from #184, where a parse failure wiped a note's frontmatter.
  Body `#tag` text is deliberately untouched, because the indexer ignores it for a reason.
- **Whole-vault literal and regex search** (`⌘⇧G`) ([#200]). In-document search (`⌘F`) had regex,
  case and whole-word for years; whole-vault search (`⌘⇧F`) had only BM25 token matching. That gap
  mattered because **BM25 and grep fail in opposite directions** — measured on this vault, grep
  returned nothing for 4 of 4 questions in `_memories` (the notes say "창", the query said "윈도우")
  while BM25 drowned the good hits in that same tree. `mcp/README.md` concluded "use both", but the
  app only had one arm. Matching runs in Rust over the same rayon-parallel walk the bundle read
  already uses. Clicking a result opens in-document search with the same pattern, so you land on the
  match instead of at the top of the note.

  ⚠️ Match offsets come **from Rust**, in UTF-16 code units. Recomputing them in the frontend would be
  wrong twice over: Rust's `regex` has no backreferences or lookaround, so JS `RegExp` can match
  somewhere else, and byte offsets would misplace every highlight on a line containing Korean.
- **A broken-link audit** ([#199]). The preview marks unresolved wikilinks with a class, but only in
  the note you happen to have open — across 19,000 notes that is not something you find by looking.
  It matters because, as the README says, the vault is written by other tools rather than by Lapis:
  renaming inside the app rewrites the links that point at a note, but a file deleted or renamed
  *outside* it breaks them silently, and nothing surfaced that. A new command lists every unresolved
  body link, **grouped by target and ordered by how many notes point at it** — the unit of repair is
  one missing note, not one link, so the top of the list is also the cheapest thing to fix. Computed
  on demand rather than during index build, so startup is untouched.

  ⚠️ Frontmatter cross-refs are deliberately out of scope. `relations.ts` treats "resolves to a note"
  as the definition of a relation, so auditing those fields would flag every ordinary scalar
  (`status: welcome`, `priority: high`) as a broken link. Body links carry their own syntax and have
  no such ambiguity.
- **A relative score (`rel`) that can be compared across queries** ([#198]). Raw BM25 scores could not
  be compared between queries — the same corpus answered `"멀티 윈도우"` with 63 and an English-mixed
  query with 1,494 (another sample: 848 vs 73), because IDF shifts with the query's term composition
  and is shard-local besides. That meant **no absolute cutoff was possible**, which hurt most in the
  `OR` fallback, where the ranker deliberately casts wide and nothing could trim the tail. Every ranked
  hit now carries `rel`, the score relative to that query's top hit (`1.0`). The MCP tool takes
  `min_rel` to drop the tail, and reports `used[].dropped_by_min_rel` so a filtered-out result is never
  silently missing. Ordering is untouched — `rel` is a monotone transform applied after the existing
  sort, so the eval harness's R@1/R@10/MRR are unchanged.

### Fixed
- **Staleness is now decided exactly, not estimated** ([#201]). `mcp/README.md` listed this under
  remaining limitations: the cache fingerprint came from Rust's `DefaultHasher`, whose values std
  explicitly does not guarantee across builds, so the MCP server could not reproduce it and fell back
  to comparing mtimes. That proxy **misses a file that was edited without its mtime moving** — the
  server answers "current" while the index is stale, which is worse than answering "I don't know".
  The hash is now a specified FNV-1a construction that both sides implement from the same written
  contract, pinned by identical test vectors in `vault.rs` and `mcp/fingerprint.test.ts`. Responses
  carry `stale.changed` (the exact verdict) and `stale.fingerprint`.

  The fingerprint input also normalizes paths to `/`, which closes a second issue: the same vault
  produced **different fingerprints on macOS and Windows**, so opening it from both meant a full
  rebuild every time.

  ⚠️ **Cache version 7 → 8.** The first launch after upgrading rebuilds the whole index once
  (about a minute at 19,000 notes). Once only.

---

## [1.14.0] — 2026-08-26

### Added
- **Windows (x64) support** ([#196]). The app builds and runs on Windows 10+ next to macOS, and CI now
  runs the Rust checks and tests on **both**. Three things had to change. **Paths** — Rust handed the
  frontend `\`-separated strings while the frontend splits on `/` in about twenty places, and Windows
  `canonicalize()` returns extended-length paths (`\\?\C:\...`); one boundary helper (`uipath::to_ui`)
  now normalizes both, with the same contract mirrored in the MCP server (`normPath`). **Images** — the
  static asset-protocol scope assumed a macOS layout, so a vault outside the user profile (`D:\notes`)
  rendered no images at all; the opened vault is now registered at runtime instead, which is also
  *narrower* than the static scope. **Shortcuts** — the palette showed `⌘K` on a machine where that key
  does not exist, so labels and the sample notes are rewritten to `Ctrl+K` at display time.

### Fixed
- **The knowledge-query MCP server could never find its cache on Windows** ([#196]). The app-data
  directory was hardcoded to `~/Library/Application Support`, so every query answered `cache_absent`
  no matter how healthy the index was.

---

## [1.13.0] — 2026-08-24

### Changed
- **Changing one note no longer re-reads the whole vault on startup** ([#192]). The cache key was a
  single hash over every file's `(path, mtime, size)`, so one edited note invalidated all of it. On the
  author's vault that meant re-reading **52.6 MB** of note bodies and re-indexing for **~5.3 s** —
  triggered, in practice, by 38 changed files out of 19,364 (0.2%). Because the vault is written by
  other tools rather than by Lapis, most launches took that path: something changed on 19 of the last
  30 days. Startup now compares a per-file stat snapshot against the previous one and, when few files
  moved, repairs only those — the same incremental machinery the file watcher already used. A full
  rebuild still happens when the change set is large, when the shard count would change, or when the
  snapshot is missing or does not match. The snapshot lives in its own file (231 KB gzipped, +1.6% of
  the cache) rather than in the metadata read on every launch, so an unchanged vault costs nothing extra.

### Fixed
- **Search result snippets could show a note's YAML header instead of the matching text** ([#191]).
  Ranking finds Korean text by character bigrams, but the snippet extractor only looked for the query
  typed verbatim. When a word carried a different particle — searching `인덱스로` against a note
  reading `인덱스를` — nothing matched and the fallback printed the first 120 characters, which by
  convention is the frontmatter block. The result was a search hit that could not show why it matched.
  Snippets now try the raw words first and then the same bigrams ranking uses, and never start inside
  frontmatter.
- **Switching vaults could leak the previous vault's notes into search results** ([#191]). Opening a
  vault cleared the link index but left the full-text worker loaded. Shards are only reset for the ones
  the new vault writes, and the shard count follows note count — so going from a large vault (8 shards)
  to a small one (1 shard) left shards 1–7 in memory, and every ready shard answers queries.
- **Five code fence languages rendered without any highlighting** ([#193]). Measured across the whole
  vault: `svelte` (18 fences), `dart` (15), `ruby` (7), `http` (4), and `objective-c` (2). The first
  three had no language registered; the last two were spelling variants no registered alias covered.
  `svelte` maps to the XML grammar, which still colors markup and the contents of `<script>`/`<style>`.

## [1.12.2] — 2026-08-24

### Fixed
- **Tables blew out sideways, while the columns that would have fit folded to one character per line**
  ([#189]). Inline code carried no line-breaking rule, so a long path without spaces
  (`dontalk/…/Foo.swift:1234`, or a brace shorthand like `A/{B,C,D}`) stayed a single unbreakable chunk.
  In a paragraph it pushed the whole pane sideways; in a table it inflated that column's minimum width,
  and the automatic table layout squeezed whatever was left over to the other columns — Korean breaks
  between any two characters, so the squeeze showed up as **one character per line** in a cell 545px tall.
  Inline code now wraps with `overflow-wrap: anywhere`, the one value that also lowers the minimum width
  (`break-word` does not, and would have left the table alone). Code blocks are excluded and still scroll
  horizontally, and exported HTML picks up the same rule. Measured on the author's vault: 321 of 1,301
  notes (24.7%) carry an inline code token longer than 60 characters with no space in it.

## [1.12.1] — 2026-08-21

### Fixed
- **A broken diagram left a "Syntax error in text" graphic stuck on screen** ([#187]). Mermaid draws
  its own error graphic into a temporary `div` it appends to `document.body`, and on a parse failure it
  throws without removing it. So the bomb icon floated at the bottom of the window, survived every note
  switch, and only went away when the app restarted — the note on screen did not even need to contain a
  diagram, because the wreckage came from some earlier note. Mermaid's error rendering is now suppressed
  and the temporary nodes are cleaned up; the failure is reported inline, where the broken block is.

## [1.12.0] — 2026-08-21

### Fixed
- **Editing a property could wipe a note's entire frontmatter** ([#184]). When the YAML failed to parse,
  the app read it as "no properties at all" and rewrote the block with only the key you just edited —
  everything else was gone. It now refuses the write and tells you to fix the YAML in the editor first.
  Measured on the author's vault: 1 note out of 19,213 is in exactly that state today.
- **Dates were rewritten on every property edit** ([#184]). `created: 2026-08-13` came back as
  `2026-08-13T00:00:00.000Z`, because js-yaml's default schema turns timestamps into `Date` objects.
  Reading and writing now both use the CORE schema, so dates stay text. The same bug leaked into the
  UI, where the properties panel showed `Thu Aug 20 2026 09:00:00 GMT+0900`.
- **The blank line between frontmatter and body vanished** on every property edit ([#184]) — the
  separator pattern swallowed the newline. Automatic link updates shared the same splitter and the
  same bug.

### Added
- **The search measurement harness now gates cost, not just quality** ([#182]). `lapis-eval` reports
  p50/p95/max latency next to R@1/R@10/MRR, adds a long-query probe (16 and 32 words — the quality
  cases can never produce one), and exits non-zero when a latency budget is exceeded. A previous
  change passed every quality metric while being four times slower; that was caught by hand.
- **`lapis-bench`** ([#182]) — index build cost: milliseconds per 1,000 notes, growth ratio from n/2 to
  n (to catch superlinear regressions), and **JSON bytes per note**. The size metric is the primary
  gate: it is deterministic, so a 15% margin is enough, while a wall-clock budget loose enough to
  survive a busy machine cannot detect a tokenizer regression at all.
- **42 tests for the frontmatter parser** ([#184]), which had none, and one more for effect dependency
  registration through a helper call ([#185]).

### Changed
- **Preview post-processing effects were rewritten** ([#185]). Five `$effect`s declared their
  dependency by assigning to a variable they never used (`const _html = parsed.html`); the pattern
  breaks silently if a guard moves in front of it. They now call a named `trackPreviewHtml()`, and the
  repeated "null check → `tick()` → null check again → post-process" sequence moved into one helper.
  No behavior change — verified by hand across wikilink colors, mermaid, theme switching, and `⌘F`.

## [1.11.0] — 2026-08-20

### Added
- **CI** — `.github/workflows/ci.yml`. On pull requests and pushes to `main`, it runs `svelte-check`,
  the MCP type check, vitest, and the vite build on Ubuntu, plus `cargo fmt --check`, `cargo clippy`
  (warnings as errors), `cargo check`, and `cargo test` on macOS.
- **`CHANGELOG.md`** — this file. With GitHub Releases unused, it stands in for release notes.
- **A test project for DOM and reactivity** (`*.dom.test.ts`), alongside the existing node one. Preview
  post-processing and Svelte effect timing can now be tested without mounting a component. It carries a
  canary: without `resolve.conditions: ["browser"]` vitest compiles for SSR, `$effect` becomes a no-op,
  and every reactivity test passes vacuously — the canary fails loudly instead.
- **`⌘⇧F` full-text search now offers the structural arm too** — matching tags and `doc_kind`/`topic`
  facets appear below the content hits. This alternative existed only in `⌘K` before.
  It was meant to help short queries, and measurement says it does not: the structural vocabulary is
  English (4 of 4,643 distinct tags contain Hangul, 5 of 299 topics, none of the 23 doc kinds), while
  the queries that score badly are Korean. They cannot meet. What this actually helps is queries
  written in the vocabulary's own language. Short Korean queries remain unsolved, and the answer is
  not here.
- **Window position and size survive a restart.** Every window remembers its own geometry, keyed by
  label, so a second window reopens where the last one was. If the monitor it was on is gone, the
  window falls back to a default position instead of restoring off-screen.

### Changed
- **Full-text combination now degrades in four steps instead of two.** It was AND-then-OR: if a single
  query word was missing from the target, AND returned nothing and the whole query fell back to OR,
  matching **10,346 documents on average** — 53% of the corpus. Typing a half-remembered title is not an
  edge case, and that was the worst path. Two stages now fill the gap: `AND-1` (drop one word, AND the
  rest) and `OR-min` (OR results filtered by matched-term count). Measured on 19,292 notes / 360 cases,
  queries carrying one bogus word went from **10,346 matches to 220 (−98%)** with R@1 **67.2% → 68.9%**.
  Clean queries are byte-for-byte unchanged — the new stages are only reachable when AND finds nothing.
  `AND-1` is capped at 8 words because it is O(n²): uncapped it scored 1.1pt higher but ran 4× slower
  (118ms average against 29ms before, and 860ms on a 32-word query).
- The MCP response field `used[].combine` gained two values, `AND-1` and `OR-min`. See `mcp/README.md`.
- Install instructions moved from a Releases download to building from source. Binary distribution stopped.
- **English is now the primary language for published documents.** `README.md` and `CHANGELOG.md` are the
  English originals; Korean lives in `README.ko.md` and `CHANGELOG.ko.md`. The former `README.en.md`
  became `README.md`.

### Fixed
- `mcp/lapis-eval` silently ignored its sample-size argument — the wrapper did not forward `"$@"`, so
  every run used the default. Two measurements were compared under different case counts before this
  surfaced.
- The release badge in the README was dead — with every release deleted, `github/v/release` had nothing
  to resolve. Replaced with a tag-based `github/v/tag`.

---

## [1.10.0] — 2026-08-19

UI localization and an MCP query toggle. Moving the repository to a personal account brought along
a round of cleanup for public consumption.

### Added
- **UI localization (ko/en)** — built on Paraglide JS 2. English is the source language and Korean is the
  translation. It follows the OS language by default and can be overridden in settings. 309 messages ([#171])
- **MCP query toggle** — turn the `lapis_query` tool on and off from app settings. **Blocked by default**,
  and the gate sits on `tools/call` rather than `tools/list`, so it takes effect without a restart ([#170])
- MIT LICENSE ([#166]), an English README and a language switcher ([#168])

### Fixed
- The properties autocomplete dropdown was clipped instead of escaping the context panel ([#169])
- The MCP wrapper depended on `PATH`, so the server never started under Claude Desktop ([#163])
- Partial settings writes — saving only some fields reset the rest to their defaults. The symptom stayed
  hidden while there was only one field ([#170])

### Docs
- README rewritten, repository URLs updated ([#165]), personal-tool disclaimer added ([#167])
- Corrected the search stack — the README had long claimed "tantivy + lindera", but that stack was removed
  in v1.3.0 ([#161], [#164])
- Added an MCP usage guide ([#162])

---

## [1.9.0] — 2026-08-13

Opened the knowledge vault up to queries from Claude Code, and cleared out several cache faults that had
been failing silently along the way.

### Added
- **`lapis_query` MCP server** — serves full-text and structural queries (backlinks, topic, tag, doc_kind)
  over the index the app builds. It exposes exactly one tool ([#156])
- Start editing where you were reading — the section anchor carries across the read/edit switch ([#154])

### Changed
- Full-text combination switched to AND-first with an OR fallback. Measurement showed the bottleneck was
  the combination strategy, not the tokenizer ([#159])

### Fixed
- Six faults where cache meta and shards drifted apart ([#155])
- Edits did not refresh the on-disk cache — a duplicated gate at the call site ([#158])
- Development and release builds shared an app data directory; they are now separate ([#157])

---

## [1.8.0] — 2026-08-11

Per-window vaults and a single read/edit toggle. The dormant graph code was removed.

### Added
- **A different vault per window** — watcher refcounting plus per-window event routing
- `⌘T` opens a new tab; `⌘P` now replaces the active tab
- Click the topbar path label to copy the absolute path

### Changed
- **Removed the Editor/Preview split in favor of a single read↔edit toggle**
- Editor loads lazily — startup payload 1089 KB → 543 KB
- Shortcut matching extracted to `keymap.ts` (27 tests); the welcome document to `welcomeDoc.ts`
- Removed the dormant graph feature (3,135 lines)

### Fixed
- New windows opened the previous vault — the per-window key is now evaluated lazily

---

## [1.7.0] — 2026-08-06

### Added
- Reading typography pass — adjustable measure, heading hierarchy, paragraph spacing ([#144])
- Debug build markers — window title and a topbar badge ([#146])

### Fixed
- The pane toolbar's ⋯ menu wrapped one character per line (a v1.6.0 regression) ([#145])

---

## [1.6.0] — 2026-08-05

A full UI overhaul. The shell layout borrows from chat apps (Discord): a left icon rail and a right
context panel.

### Added
- Design tokens — three surface layers, larger radii, two density steps ([#130])
- A permanent left icon rail with active-section indication ([#132]), and a new right context panel ([#133])
- Vault header dropdown and a bottom status bar ([#139]), rail tooltips ([#138])
- **Unread markers for notes that changed while you were away** ([#140])
- Enter/exit motion for overlays ([#137]); tab chip and category collapse motion ([#141])

### Changed
- Removed hard borders in favor of the three surface layers ([#131]); new accent color ([#135])
- Fresh installs default to a collapsed Editor; slimmer topbar ([#134])
- Items rendered as chips, rail pill morphing, uppercase categories ([#136])

### Fixed
- Outline entries clipped at the bottom; section badges capped at 9999+ ([#142])

---

## [1.5.0] — 2026-08-03

### Added
- Reveal in Finder — from the file tree, tabs, and both panes ([#127])
- Export the preview as a self-contained HTML file ([#128])
- A ⋯ overflow menu on the pane toolbar ([#126])

---

## [1.4.0] — 2026-06-22

Search quality and responsiveness.

### Added
- **Initial-consonant search in the Quick Switcher** — Korean jamo matching ([#119])
- **A Korean bigram tokenizer for full-text** — recall for compounds and inflections ([#120])
- Force index rebuild in settings — ignore the cache, reset the worker, rebuild everything ([#123])

### Changed
- Debounced palette search with lazily generated snippets ([#121])
- Quick Switcher normalization cache and progressive filtering ([#122])
- Git auto-commit now `add`s only changed paths, avoiding a full working-tree scan ([#118])

---

## [1.3.0] — 2026-06-18

### Removed
- **The entire claude-mem integration** ([#117]). **The tantivy + lindera morphological search engine went
  with it** — search has been a single MiniSearch stack ever since. The README failed to reflect this for
  a long time and was only corrected in v1.10.0.

---

## [1.2.2] — 2026-06-18

### Changed
- Graph feature temporarily disabled pending a 3D redesign ([#114])
- Watcher reindexing moved to the background, so live changes no longer block the sidebar ([#113])

### Fixed
- The mirror sync indicator got stuck on "syncing" forever — a listener re-registration race ([#115])

---

## [1.2.1] — 2026-06-18

### Fixed
- **A UTF-8 character boundary panic in `strip_md_extension`** — an immediate crash after release.
  Replaced with byte-slice comparison ([#110])
- Index build spinner freeze; the watcher missing the search index ([#111], [#112])

### Added
- Incremental indexing and a `.mmd` watcher ([#112])

---

## [1.2.0] — 2026-06-15

Version control the vault with git.

### Added
- A git version-control backend for the vault — shell-out commands ([#104])
- Auto-commit plus a banner for starting version control ([#105])
- Git history viewer — a "History" section in Neighborhood ([#106])
- A settings entry point for git version control, reachable after dismissing the banner ([#107])

### Fixed
- Git commands blocked the IPC thread and froze the UI for 30 seconds — async + `spawn_blocking` ([#108])

---

## [1.1.0] — 2026-06-11

### Added
- On-demand betweenness with a "bridge notes" toggle ([#97]); undirected conversion and a weighting toggle ([#101])
- Disparity filter backbone mode ([#98])
- A global `doc_kind` type filter for the graph ([#100])
- MOC suggestion diagnostics — MOC candidates, bridge notes, orphan notes ([#102])
- Drag-resizable expanded sidebar sections ([#99])

---

## [1.0.0] — 2026-06-08

A document-level knowledge graph and a restructured sidebar.

### Added
- Frontmatter type relation index and the Neighborhood panel ([#92])
- Field lens grouping in the Files tab ([#93])
- Document-level knowledge graph — data model and Local/ego mode ([#94]), Global mode and encoding ([#95])
- Vertical accordion sidebar navigation with an icon rail ([#96])

> The graph feature was disabled in v1.2.2 and its code removed in v1.8.0. It is not in the app today.

---

## [0.12.1] — 2026-06-05

### Fixed
- Tab context-menu actions like "Close other tabs" did nothing ([#90])

---

## [0.12.0] — 2026-06-04

### Added
- Persisted note tabs, restored per vault ([#85])
- Drag to reorder tabs; "close other tabs" from the context menu ([#86])
- Preview font size (zoom) control ([#87])

### Fixed
- Backlink cache now invalidates immediately on in-app rename, delete, and move ([#88])

---

## [0.11.0] — 2026-06-04

A note navigation bundle.

### Added
- **Wikilink autocomplete (`[[`)** — a CodeMirror completion dropdown ([#79])
- Note back/forward navigation ([#80]) and a history dropdown ([#81])
- **Note tabs (multiple open notes)** ([#82])
- A favorites/pins sidebar tab with recent notes ([#83])

---

## [0.10.0] — 2026-06-02

### Added
- Document outline (TOC) panel, synced both ways with the editor and preview ([#73])
- Word/character count and reading time in the topbar ([#72])
- An entry point for adding Properties even when frontmatter is empty ([#77])

### Changed
- Spacing tokenized — exact-match px values replaced with `--sp-*` ([#74])
- A `ModalShell` primitive and normalized z-index tokens ([#75])
- Automatic link updating now identifies code regions via an AST (markdown-it) instead of regex ([#76])
- Icon buttons unified under `.btn--icon` ([#77])

---

## [0.9.1] — 2026-06-01

### Fixed
- Mermaid PNG export — worked around WKWebView canvas tainting (blob → data URL) ([#71])

---

## [0.9.0] — 2026-06-01

### Added
- Syntax highlighting for preview code blocks — highlight.js wired to the `--cm-*` tokens ([#68])

### Changed
- **A full design system overhaul** — tokens plus a three-way theme (light/dark/system) ([#64])
- Normalized sizes and shapes; a button primitive ([#67])

### Fixed
- Mermaid diagram legibility in light mode — theme-adaptive rendering ([#66])

---

## [0.8.0] — 2026-05-29

### Added
- Mermaid diagram PNG export — atomic save from a hover button ([#62])

---

## [0.7.0] — 2026-05-27

### Added
- Collapsible sidebar — `⌘B`, a header button, and a collapsed strip ([#60])

---

## [0.6.0] — 2026-05-21

A performance bundle for large vaults.

### Changed
- Removed search cold init; added an LRU cache and a release profile ([#49])
- Vault cold-start bundle — `read_vault_bundle` on rayon ([#50])
- MiniSearch disk cache ([#51]); gzipped cache and lazy `fullTextIndex` loading ([#52])
- Split cache meta and JSON IPC; moved MiniSearch into a Web Worker ([#53])
- Virtualized the file tree ([#55])
- Sharded progressive loading of the search index — partial search 1.8s in, after the first shard ([#56]),
  with the shard count scaled to vault size ([#57])

### Added
- Copy the current note's absolute path; filter the sidebar tree by search ([#54])

---

## [0.5.1] — 2026-05-19

### Added
- Backup `max_keep` exposed in settings (1–100) ([#47])

### Removed
- The graph view, removed entirely — ADR-001 ([#45])

---

## [0.5.0] — 2026-05-18

### Added
- Dry-run preview for automatic link updating, with `.lapis` snapshot backups ([#42])
- Backup pruning (max 20) and automatic rollback on write failure ([#43])
- In-document search options — regex, case, whole word ([#39])
- vitest adopted, with golden tests for linkRewrite ([#41])

---

## [0.4.0] — 2026-05-14

### Added
- F2 rename and `⌘⌫` delete, Properties add, backlink invalidation ([#34])
- An F2 fallback in the Command Palette plus a note about Mac Magic Keyboards ([#35])
- Support for standalone `.mmd` files ([#36])

---

## [0.3.0] — 2026-05-14

### Added
- Export claude-mem session summaries into the vault; memory FTS search and a related-memory panel
- A `lapis-mem.db` mirror and a live sync engine
- The tantivy + lindera Korean morphological search engine
- The claude-mem integration made optional, off by default ([#30])

> Everything in this section was **removed in v1.3.0**.

---

## [0.2.0] — 2026-05-12

The first tag. Everything from Phase 0 through 5.0 landed here.

### Added
- Tauri 2 + SvelteKit + TypeScript scaffolding; a CodeMirror 6 + markdown-it + frontmatter proof of concept
- Open a vault, file tree, scroll sync
- Wikilinks, a backlinks panel, and safe link navigation
- Quick Switcher (`⌘P`), full-text search (`⌘⇧F`), a tag index, and Files/Tags sidebar tabs
- Editing and saving (`⌘S` + autosave) with **atomic writes**
- Frontmatter four-key schema recognition, hierarchical nested tags, `doc_kind`/`topic` facet filters
- A file watcher — external changes detected automatically, with conflict handling
- Vault operations (create, delete, rename, move) with automatic link updating
- The `⌘K` command palette; expandable backlink chips with context snippets
- Inline frontmatter editing, inline Mermaid code block rendering, relative image paths and a published-asset gallery
- In-document search — `⌘F` in each of the editor and preview

<!-- link references -->

[Unreleased]: https://github.com/eren0315/lapis/compare/v3.11.0...main
[3.11.0]: https://github.com/eren0315/lapis/compare/v3.10.0...v3.11.0
[3.10.0]: https://github.com/eren0315/lapis/compare/v3.9.0...v3.10.0
[3.9.0]: https://github.com/eren0315/lapis/compare/v3.8.0...v3.9.0
[3.8.0]: https://github.com/eren0315/lapis/compare/v3.7.2...v3.8.0
[3.7.2]: https://github.com/eren0315/lapis/compare/v3.7.1...v3.7.2
[3.7.1]: https://github.com/eren0315/lapis/compare/v3.7.0...v3.7.1
[3.7.0]: https://github.com/eren0315/lapis/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/eren0315/lapis/compare/v3.5.2...v3.6.0
[3.5.2]: https://github.com/eren0315/lapis/compare/v3.5.1...v3.5.2
[3.5.1]: https://github.com/eren0315/lapis/compare/v3.5.0...v3.5.1
[3.5.0]: https://github.com/eren0315/lapis/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/eren0315/lapis/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/eren0315/lapis/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/eren0315/lapis/compare/v3.1.2...v3.2.0
[3.1.2]: https://github.com/eren0315/lapis/compare/v3.1.1...v3.1.2
[3.1.1]: https://github.com/eren0315/lapis/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/eren0315/lapis/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/eren0315/lapis/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/eren0315/lapis/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/eren0315/lapis/compare/v3.0.0-beta...v3.0.0
[3.0.0-beta]: https://github.com/eren0315/lapis/compare/v2.4.1...v3.0.0-beta
[2.4.1]: https://github.com/eren0315/lapis/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/eren0315/lapis/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/eren0315/lapis/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/eren0315/lapis/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/eren0315/lapis/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/eren0315/lapis/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/eren0315/lapis/compare/v1.20.0...v2.0.0
[1.20.0]: https://github.com/eren0315/lapis/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/eren0315/lapis/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/eren0315/lapis/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/eren0315/lapis/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/eren0315/lapis/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/eren0315/lapis/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/eren0315/lapis/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/eren0315/lapis/compare/v1.12.2...v1.13.0
[1.12.2]: https://github.com/eren0315/lapis/compare/v1.12.1...v1.12.2
[1.12.1]: https://github.com/eren0315/lapis/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/eren0315/lapis/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/eren0315/lapis/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/eren0315/lapis/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/eren0315/lapis/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/eren0315/lapis/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/eren0315/lapis/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/eren0315/lapis/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/eren0315/lapis/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/eren0315/lapis/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/eren0315/lapis/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/eren0315/lapis/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/eren0315/lapis/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/eren0315/lapis/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eren0315/lapis/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/eren0315/lapis/compare/v0.12.1...v1.0.0
[0.12.1]: https://github.com/eren0315/lapis/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/eren0315/lapis/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/eren0315/lapis/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/eren0315/lapis/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/eren0315/lapis/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/eren0315/lapis/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/eren0315/lapis/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/eren0315/lapis/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/eren0315/lapis/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/eren0315/lapis/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/eren0315/lapis/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/eren0315/lapis/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/eren0315/lapis/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eren0315/lapis/releases/tag/v0.2.0

[#278]: https://github.com/eren0315/lapis/pull/278
[#277]: https://github.com/eren0315/lapis/pull/277
[#276]: https://github.com/eren0315/lapis/pull/276
[#275]: https://github.com/eren0315/lapis/pull/275
[#274]: https://github.com/eren0315/lapis/pull/274
[#273]: https://github.com/eren0315/lapis/pull/273
[#272]: https://github.com/eren0315/lapis/pull/272
[#271]: https://github.com/eren0315/lapis/pull/271
[#270]: https://github.com/eren0315/lapis/pull/270
[#269]: https://github.com/eren0315/lapis/pull/269
[#268]: https://github.com/eren0315/lapis/pull/268
[#267]: https://github.com/eren0315/lapis/pull/267
[#265]: https://github.com/eren0315/lapis/pull/265
[#264]: https://github.com/eren0315/lapis/pull/264
[#263]: https://github.com/eren0315/lapis/pull/263
[#261]: https://github.com/eren0315/lapis/pull/261
[#259]: https://github.com/eren0315/lapis/pull/259
[#258]: https://github.com/eren0315/lapis/pull/258
[#256]: https://github.com/eren0315/lapis/pull/256
[#254]: https://github.com/eren0315/lapis/pull/254
[#253]: https://github.com/eren0315/lapis/pull/253
[#252]: https://github.com/eren0315/lapis/pull/252
[#251]: https://github.com/eren0315/lapis/pull/251
[#250]: https://github.com/eren0315/lapis/pull/250
[#249]: https://github.com/eren0315/lapis/pull/249
[#247]: https://github.com/eren0315/lapis/pull/247
[#246]: https://github.com/eren0315/lapis/pull/246
[#245]: https://github.com/eren0315/lapis/pull/245
[#243]: https://github.com/eren0315/lapis/pull/243
[#240]: https://github.com/eren0315/lapis/pull/240
[#239]: https://github.com/eren0315/lapis/pull/239
[#238]: https://github.com/eren0315/lapis/pull/238
[#237]: https://github.com/eren0315/lapis/pull/237
[#236]: https://github.com/eren0315/lapis/pull/236
[#235]: https://github.com/eren0315/lapis/pull/235
[#233]: https://github.com/eren0315/lapis/pull/233
[#232]: https://github.com/eren0315/lapis/pull/232
[#230]: https://github.com/eren0315/lapis/pull/230
[#229]: https://github.com/eren0315/lapis/pull/229
[#228]: https://github.com/eren0315/lapis/pull/228
[#227]: https://github.com/eren0315/lapis/pull/227
[#226]: https://github.com/eren0315/lapis/pull/226
[#224]: https://github.com/eren0315/lapis/pull/224
[#223]: https://github.com/eren0315/lapis/pull/223
[#221]: https://github.com/eren0315/lapis/pull/221
[#220]: https://github.com/eren0315/lapis/pull/220
[#219]: https://github.com/eren0315/lapis/pull/219
[#217]: https://github.com/eren0315/lapis/pull/217
[#216]: https://github.com/eren0315/lapis/pull/216
[#215]: https://github.com/eren0315/lapis/pull/215
[#214]: https://github.com/eren0315/lapis/pull/214
[#213]: https://github.com/eren0315/lapis/pull/213
[#212]: https://github.com/eren0315/lapis/pull/212
[#210]: https://github.com/eren0315/lapis/pull/210
[#209]: https://github.com/eren0315/lapis/pull/209
[#208]: https://github.com/eren0315/lapis/pull/208
[#207]: https://github.com/eren0315/lapis/pull/207
[#206]: https://github.com/eren0315/lapis/pull/206
[#202]: https://github.com/eren0315/lapis/pull/202
[#201]: https://github.com/eren0315/lapis/pull/201
[#200]: https://github.com/eren0315/lapis/pull/200
[#199]: https://github.com/eren0315/lapis/pull/199
[#198]: https://github.com/eren0315/lapis/pull/198
[#196]: https://github.com/eren0315/lapis/pull/196
[#193]: https://github.com/eren0315/lapis/pull/193
[#192]: https://github.com/eren0315/lapis/pull/192
[#191]: https://github.com/eren0315/lapis/pull/191
[#189]: https://github.com/eren0315/lapis/pull/189
[#187]: https://github.com/eren0315/lapis/pull/187
[#185]: https://github.com/eren0315/lapis/pull/185
[#184]: https://github.com/eren0315/lapis/pull/184
[#182]: https://github.com/eren0315/lapis/pull/182
[#171]: https://github.com/eren0315/lapis/pull/171
[#170]: https://github.com/eren0315/lapis/pull/170
[#169]: https://github.com/eren0315/lapis/pull/169
[#168]: https://github.com/eren0315/lapis/pull/168
[#167]: https://github.com/eren0315/lapis/pull/167
[#166]: https://github.com/eren0315/lapis/pull/166
[#165]: https://github.com/eren0315/lapis/pull/165
[#164]: https://github.com/eren0315/lapis/pull/164
[#163]: https://github.com/eren0315/lapis/pull/163
[#162]: https://github.com/eren0315/lapis/pull/162
[#161]: https://github.com/eren0315/lapis/pull/161
[#159]: https://github.com/eren0315/lapis/pull/159
[#158]: https://github.com/eren0315/lapis/pull/158
[#157]: https://github.com/eren0315/lapis/pull/157
[#156]: https://github.com/eren0315/lapis/pull/156
[#155]: https://github.com/eren0315/lapis/pull/155
[#154]: https://github.com/eren0315/lapis/pull/154
[#146]: https://github.com/eren0315/lapis/pull/146
[#145]: https://github.com/eren0315/lapis/pull/145
[#144]: https://github.com/eren0315/lapis/pull/144
[#142]: https://github.com/eren0315/lapis/pull/142
[#141]: https://github.com/eren0315/lapis/pull/141
[#140]: https://github.com/eren0315/lapis/pull/140
[#139]: https://github.com/eren0315/lapis/pull/139
[#138]: https://github.com/eren0315/lapis/pull/138
[#137]: https://github.com/eren0315/lapis/pull/137
[#136]: https://github.com/eren0315/lapis/pull/136
[#135]: https://github.com/eren0315/lapis/pull/135
[#134]: https://github.com/eren0315/lapis/pull/134
[#133]: https://github.com/eren0315/lapis/pull/133
[#132]: https://github.com/eren0315/lapis/pull/132
[#131]: https://github.com/eren0315/lapis/pull/131
[#130]: https://github.com/eren0315/lapis/pull/130
[#128]: https://github.com/eren0315/lapis/pull/128
[#127]: https://github.com/eren0315/lapis/pull/127
[#126]: https://github.com/eren0315/lapis/pull/126
[#123]: https://github.com/eren0315/lapis/pull/123
[#122]: https://github.com/eren0315/lapis/pull/122
[#121]: https://github.com/eren0315/lapis/pull/121
[#120]: https://github.com/eren0315/lapis/pull/120
[#119]: https://github.com/eren0315/lapis/pull/119
[#118]: https://github.com/eren0315/lapis/pull/118
[#117]: https://github.com/eren0315/lapis/pull/117
[#115]: https://github.com/eren0315/lapis/pull/115
[#114]: https://github.com/eren0315/lapis/pull/114
[#113]: https://github.com/eren0315/lapis/pull/113
[#112]: https://github.com/eren0315/lapis/pull/112
[#111]: https://github.com/eren0315/lapis/pull/111
[#110]: https://github.com/eren0315/lapis/pull/110
[#108]: https://github.com/eren0315/lapis/pull/108
[#107]: https://github.com/eren0315/lapis/pull/107
[#106]: https://github.com/eren0315/lapis/pull/106
[#105]: https://github.com/eren0315/lapis/pull/105
[#104]: https://github.com/eren0315/lapis/pull/104
[#102]: https://github.com/eren0315/lapis/pull/102
[#101]: https://github.com/eren0315/lapis/pull/101
[#100]: https://github.com/eren0315/lapis/pull/100
[#99]: https://github.com/eren0315/lapis/pull/99
[#98]: https://github.com/eren0315/lapis/pull/98
[#97]: https://github.com/eren0315/lapis/pull/97
[#96]: https://github.com/eren0315/lapis/pull/96
[#95]: https://github.com/eren0315/lapis/pull/95
[#94]: https://github.com/eren0315/lapis/pull/94
[#93]: https://github.com/eren0315/lapis/pull/93
[#92]: https://github.com/eren0315/lapis/pull/92
[#90]: https://github.com/eren0315/lapis/pull/90
[#88]: https://github.com/eren0315/lapis/pull/88
[#87]: https://github.com/eren0315/lapis/pull/87
[#86]: https://github.com/eren0315/lapis/pull/86
[#85]: https://github.com/eren0315/lapis/pull/85
[#83]: https://github.com/eren0315/lapis/pull/83
[#82]: https://github.com/eren0315/lapis/pull/82
[#81]: https://github.com/eren0315/lapis/pull/81
[#80]: https://github.com/eren0315/lapis/pull/80
[#79]: https://github.com/eren0315/lapis/pull/79
[#77]: https://github.com/eren0315/lapis/pull/77
[#76]: https://github.com/eren0315/lapis/pull/76
[#75]: https://github.com/eren0315/lapis/pull/75
[#74]: https://github.com/eren0315/lapis/pull/74
[#73]: https://github.com/eren0315/lapis/pull/73
[#72]: https://github.com/eren0315/lapis/pull/72
[#71]: https://github.com/eren0315/lapis/pull/71
[#68]: https://github.com/eren0315/lapis/pull/68
[#67]: https://github.com/eren0315/lapis/pull/67
[#66]: https://github.com/eren0315/lapis/pull/66
[#64]: https://github.com/eren0315/lapis/pull/64
[#62]: https://github.com/eren0315/lapis/pull/62
[#60]: https://github.com/eren0315/lapis/pull/60
[#57]: https://github.com/eren0315/lapis/pull/57
[#56]: https://github.com/eren0315/lapis/pull/56
[#55]: https://github.com/eren0315/lapis/pull/55
[#54]: https://github.com/eren0315/lapis/pull/54
[#53]: https://github.com/eren0315/lapis/pull/53
[#52]: https://github.com/eren0315/lapis/pull/52
[#51]: https://github.com/eren0315/lapis/pull/51
[#50]: https://github.com/eren0315/lapis/pull/50
[#49]: https://github.com/eren0315/lapis/pull/49
[#47]: https://github.com/eren0315/lapis/pull/47
[#45]: https://github.com/eren0315/lapis/pull/45
[#43]: https://github.com/eren0315/lapis/pull/43
[#42]: https://github.com/eren0315/lapis/pull/42
[#41]: https://github.com/eren0315/lapis/pull/41
[#39]: https://github.com/eren0315/lapis/pull/39
[#36]: https://github.com/eren0315/lapis/pull/36
[#35]: https://github.com/eren0315/lapis/pull/35
[#34]: https://github.com/eren0315/lapis/pull/34
[#30]: https://github.com/eren0315/lapis/pull/30
