<script lang="ts">
  import { logWarn, logCommand, logQuery } from "$lib/stores/usage";
  import { readNote } from "$lib/tauri/notes";
  import { m } from "$lib/paraglide/messages.js";
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { backdropFade, cardIn, cardOut } from "$lib/motion";
  import { formatShortcut } from "$lib/shortcutLabel";
  import { displayName as savedLabel } from "$lib/savedSearch";
  import {
    paletteOpen,
    paletteHintMode,
    paletteIntent,
    closePalette,
    setPaletteMode,
    paletteScope,
    setPaletteScope,
    savedSearches,
    saveSearch,
    removeSavedSearch,
  } from "$lib/stores/palette";
  import {
    fullTextIndexReady,
    indexBuilding,
    fullTextLoading,
    pendingFullTextVault,
  } from "$lib/stores/search";
  import {
    unifiedSearchWithFallback,
    groupResults,
    isGroupVisible,
    CYCLE_MODES,
    cycleMode,
    folderChips,
    scopeCandidates,
    inPaletteScope,
    relScore,
    type PaletteResult,
    type PaletteEntry,
    type PaletteMode,
  } from "$lib/palette";
  import { selectNote, ensureFullTextIndex } from "$lib/stores/vault";
  import { selectTag, showTagsTab } from "$lib/stores/tags";
  import { toggleDocKind, toggleTopic } from "$lib/stores/filters";

  let inputEl: HTMLInputElement | null = $state(null);
  let listEl: HTMLDivElement | null = $state(null);
  let query = $state("");
  let activeIndex = $state(0);

  /** 검색 디바운스(ms) — 빠른 타이핑 시 키 입력마다 풀검색(searchQuick 12k + readNote×N) 방지. */
  const SEARCH_DEBOUNCE_MS = 90;

  // 키보드 탐색 중에는 mouseenter를 무시 — 컨테이너가 스크롤되면 마우스 좌표가 그대로여도
  // 새로 화면에 들어온 항목 위에 커서가 위치하게 되어 mouseenter가 발화, activeIndex가
  // 의도와 반대로 바뀌는 hijacking을 막는다. 마우스가 실제로 움직이면 모드 해제.
  let keyboardNavMode = $state(false);
  let lastMouseXY = { x: -1, y: -1 };

  // 모달 열릴 때 초기화 + 포커스
  $effect(() => {
    if ($paletteOpen) {
      query = "";
      activeIndex = 0;
      keyboardNavMode = false;
      lastMouseXY = { x: -1, y: -1 };
      tick().then(() => inputEl?.focus());
      // cold-start cache hit 직후 fullTextIndex가 lazy 빌드 대기 상태일 수 있음.
      // idle callback이 아직 안 돌았으면 여기서 즉시 트리거 — 사용자가 검색을 시작
      // 하기 전에 백그라운드 빌드 시작. ensureFullTextIndex는 idempotent.
      void Promise.resolve().then(() => ensureFullTextIndex());
    }
  });

  // 모달 열린 동안 window mousemove로 실제 마우스 이동 감지 → 키보드 모드 해제
  $effect(() => {
    if (!$paletteOpen) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientX !== lastMouseXY.x || e.clientY !== lastMouseXY.y) {
        lastMouseXY = { x: e.clientX, y: e.clientY };
        keyboardNavMode = false;
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  });

  // unifiedSearch가 async (matchContent가 readNote × N 동반)이라 $derived 대신 $state + $effect.
  // cancellation으로 빠른 타이핑 시 stale 결과 덮어쓰기 방지.
  let results = $state<PaletteResult[]>([]);
  /**
   * 한글 IME 를 되돌려 다시 찾았을 때 그 질의. 없으면 처음 질의로 찾은 것이다.
   *
   * 🔴 **반드시 보여준다.** 조용히 다른 것을 찾아 주면 왜 그게 나왔는지 모른다.
   */
  let imeSwappedTo = $state<string | null>(null);
  /**
   * 0건이라 **굴절을 접어** 찾았다. IME 되돌리기와 같은 이유로 반드시 보여준다.
   *
   * ⚠️ 이쪽은 질의를 바꾸지 않으므로 보여줄 문자열이 없다 — 접었다는 사실만 말한다.
   */
  let stemMatched = $state(false);
  /**
   * 마지막으로 기록한 질의. 열림을 그 질의에 붙이기 위한 것.
   *
   * ⚠️ `$state` 가 아니다 — 화면이 안 읽는다. 룬으로 두면 쓸 때마다 재렌더가 돈다.
   */
  let lastLoggedQuery: string | null = null;
  let lastLoggedOpened = false;

  $effect(() => {
    if (!$paletteOpen) {
      results = [];
      imeSwappedTo = null;
      stemMatched = false;
      return;
    }
    const q = query;
    const hint = $paletteHintMode;
    let cancelled = false;
    // 빈 입력(Recent/Quick Actions)은 즉시, 입력이 있으면 디바운스 — 타이핑 중 매 키마다
    // 풀검색이 도는 것을 막아 입력 지연을 없앤다. 다음 키 입력이 timer를 clear하므로
    // 입력이 멈춘 뒤 1회만 실행. cancelled로 stale 결과 덮어쓰기도 차단(이중 안전).
    const delay = q.trim() === "" ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const {
            results: r,
            imeSwappedTo: swapped,
            stemMatched: stemmed,
          } = await unifiedSearchWithFallback(q, hint);
          if (!cancelled) {
            results = r;
            imeSwappedTo = swapped ?? null;
            stemMatched = stemmed === true;
            // ⚠️ **빈 질의는 안 남긴다.** Recent/Quick Actions 화면이라 검색이 아니다 —
            //    남기면 "결과 0건 질의"가 빈 문자열로 잔뜩 쌓인다.
            if (q.trim() !== "") {
              lastLoggedQuery = q;
              lastLoggedOpened = false;
              logQuery(hint === "fulltext" ? "fulltext" : "quick", q, r.length);
            }
          }
        } catch (e) {
          if (!cancelled) {
            logWarn("CommandPalette", "unifiedSearch failed", e);
            results = [];
            imeSwappedTo = null;
            stemMatched = false;
          }
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  /**
   * 스코프 후보는 **스코프를 걸기 전** 결과에서 뽑는다. 건 뒤에서 뽑으면 하나를 고르는
   * 순간 나머지가 사라져 **다른 폴더로 옮겨갈 수가 없다** — 되돌아올 길이 없는 필터다.
   *
   * ⚠️ 스코프가 이미 걸려 있으면 후보를 안 뽑는다. 그 안에서 다시 쪼개는 것은 이 화면이
   * 답할 질문이 아니고, 칩이 두 겹으로 쌓이면 무엇이 걸린 건지 안 읽힌다.
   */
  const chips = $derived($paletteScope === null ? scopeCandidates(results) : []);

  /** ⚠️ 칩이 하나면 안 그린다 — 거를 것이 없는 필터는 자리만 먹고 아무 질문에도 답하지 않는다. */
  const showFolderChips = $derived(chips.length > 1);

  const visibleResults = $derived.by<PaletteResult[]>(() =>
    results.filter((r) => inPaletteScope(r.entry, $paletteScope)),
  );

  const groups = $derived(groupResults(visibleResults));

  /**
   * 본문 결과의 최고점 — `rel` 의 분모.
   *
   * ⚠️ **거르기 전** 결과에서 잡는다. 거른 뒤로 잡으면 폴더를 고를 때마다 같은 문서의
   * `rel` 이 올라가고, 그러면 이 숫자가 "질의 안에서의 순위"라는 뜻을 잃는다.
   */
  const topContentScore = $derived(
    results.reduce((mx, r) => (r.entry.kind === "content" && r.score > mx ? r.score : mx), 0),
  );

  // 화면 그리는 순서대로 평면화한 배열. activeIndex는 이 배열의 인덱스(시각적 순서)를 사용해야
  // ↑/↓ 탐색이 자연스럽게 동작한다. results(점수 순)와 다름에 주의.
  const displayList = $derived.by<PaletteResult[]>(() => {
    const out: PaletteResult[] = [];
    // ⚠️ 순서는 `palette.ts`의 `GROUP_ORDER`와 같아야 한다. 갈라져도 에러가 안 나므로
    //    `palette.test.ts`가 이 파일을 읽어 대조한다.
    if (showTopCommands) out.push(...groups.topCommands);
    if (showRecents) out.push(...groups.recents);
    if (showChanged) out.push(...groups.changed);
    if (showNotes) out.push(...groups.notes);
    if (showContent) out.push(...groups.content);
    if (showTagsGroup) out.push(...groups.tags);
    if (showFacets) out.push(...groups.facets);
    if (showCommands) out.push(...groups.commands);
    return out;
  });

  const indexByEntry = $derived.by(() => {
    const m = new Map<PaletteEntry, number>();
    displayList.forEach((r, i) => m.set(r.entry, i));
    return m;
  });

  function displayIndexOf(entry: PaletteEntry): number {
    return indexByEntry.get(entry) ?? -1;
  }

  /**
   * 지금 고른 항목의 **앞부분 미리보기**.
   *
   * ## ⚠️ 팔레트를 늦추지 않는다
   *
   * 팔레트는 계측으로 맞춰 놓은 경로다(디바운스 · 점진 필터 · 스니펫 지연). 방향키로
   * 내려갈 때마다 파일을 읽으면 그 조정이 깨진다 — 그래서 **디바운스**하고, 노트류가
   * 아니면 아예 안 읽는다.
   *
   * ⚠️ **읽어 온 뒤 다시 확인한다.** 읽는 사이에 다른 항목으로 옮겨 갔을 수 있고, 그러면
   * 남의 본문이 붙는다. 지금 경로가 아니면 버린다.
   */
  const PEEK_DEBOUNCE_MS = 140;
  /** 앞부분만 — 팔레트에서 문서를 읽는 게 아니라 "이거 맞나"를 가리는 것이다. */
  const PEEK_CHARS = 1200;

  let peekPath = $state<string | null>(null);
  let peekText = $state<string>("");
  let peekTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 🔴 **effect 가 읽는 값을 effect 가 쓰면 순환이 된다.**
   *
   * 처음엔 `peekPath` 를 "이미 읽었나" 판정에 썼는데, 그 값을 같은 effect 가 쓰므로
   * 스스로를 다시 깨웠다. 결과는 조용했다 — 미리보기가 **이전 항목의 본문**에 굳었다.
   * 그래서 판정용 값은 반응 밖(`let`)에 둔다.
   */
  let peekRequested: string | null = null;

  /** 미리볼 수 있는 항목인가 — 경로가 있는 것만. */
  function peekablePath(r: PaletteResult | undefined): string | null {
    if (!r) return null;
    const e = r.entry;
    return e.kind === "note" || e.kind === "content" || e.kind === "recent" || e.kind === "changed"
      ? e.path
      : null;
  }

  $effect(() => {
    const path = peekablePath(displayList[activeIndex]);
    if (peekTimer !== null) clearTimeout(peekTimer);
    if (!path) {
      peekRequested = null;
      peekPath = null;
      peekText = "";
      return;
    }
    if (path === peekRequested) return;
    peekRequested = path;
    peekTimer = setTimeout(() => {
      peekTimer = null;
      void readNote(path)
        .then((body) => {
          // ⚠️ 읽는 사이에 옮겨 갔으면 버린다 — 남의 본문이 붙는다.
          if (peekablePath(displayList[activeIndex]) !== path) return;
          peekPath = path;
          peekText = body.slice(0, PEEK_CHARS);
        })
        .catch(() => {
          // 못 읽어도 팔레트는 계속 돈다. 미리보기만 빈다.
          if (peekablePath(displayList[activeIndex]) !== path) return;
          peekPath = path;
          peekText = "";
        });
    }, PEEK_DEBOUNCE_MS);
  });


  // active 인덱스가 범위 벗어나면 보정
  $effect(() => {
    const len = displayList.length;
    if (activeIndex >= len) activeIndex = Math.max(0, len - 1);
  });

  // active 항목 가시 영역 유지 + sticky 그룹 헤더 뒤에 가려지지 않도록 보정
  $effect(() => {
    const _ = activeIndex;
    if (!listEl) return;
    tick().then(() => {
      if (!listEl) return;
      const el = listEl.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "nearest" });

      // sticky 헤더(.group-header)들 중 활성 항목 위에 있는 헤더의 최하단보다 항목 top이
      // 위라면 그만큼 추가로 위로 스크롤 — 그래야 헤더에 가려지지 않는다.
      const elRect = el.getBoundingClientRect();
      const headers = listEl.querySelectorAll<HTMLElement>(".group-header");
      let coverBottom = listEl.getBoundingClientRect().top;
      for (const h of headers) {
        const hRect = h.getBoundingClientRect();
        // 활성 항목 영역까지 sticky로 머물러 있는 헤더만 후보
        if (hRect.top <= elRect.top && hRect.bottom > coverBottom) {
          coverBottom = hRect.bottom;
        }
      }
      if (elRect.top < coverBottom) {
        listEl.scrollTop -= coverBottom - elRect.top;
      }
    });
  });

  // placeholder — hint mode와 prefix에 따라 안내
  const placeholder = $derived.by(() => {
    if ($paletteHintMode === "files") return m.palette_ph_names();
    if ($paletteHintMode === "fulltext") return m.palette_ph_content();
    // ⚠️ 모드로 들어온 명령 모드도 여기서 잡는다. 접두사만 보면 `⇥` 로 온 경우 빈 입력에서
    //    "통합 검색" 이 뜨고, 화면은 명령만 보여준다 — 안내와 결과가 어긋난다.
    if ($paletteHintMode === "command") return m.palette_ph_commands();
    if (query.startsWith(">")) return m.palette_ph_commands();
    if (query.startsWith("#")) return m.palette_ph_tags();
    if (query.startsWith(":")) return m.palette_ph_facets();
    return m.palette_ph_all();
  });

  // 활성 결과 실행
  async function execute(idx: number) {
    const r = displayList[idx];
    if (!r) return;
    const entry = r.entry;
    // 🔴 **질의가 결실을 봤나.** 결과가 있었는데 아무것도 안 열었으면 못 찾은 것이다.
    //    한 질의에 한 번만 센다 — 같은 결과를 두 번 열어도 성공은 한 번이다.
    if (lastLoggedQuery !== null && !lastLoggedOpened) {
      lastLoggedOpened = true;
      logQuery($paletteHintMode === "fulltext" ? "fulltext" : "quick", lastLoggedQuery, results.length, true);
    }
    // ⚠️ **여기 한 곳**에서 기록한다. 아래 switch 의 가지마다 적으면 새 가지를 넣을 때
    //    빼먹고, 빼먹은 가지만 통계에서 사라진다.
    logCommand(
      entry.kind === "command" ? entry.command.id : `open:${entry.kind}`,
      "palette",
    );
    switch (entry.kind) {
      case "note":
      case "content":
      case "recent":
        // ⌘P로 연 팔레트만 활성 탭을 갈아끼운다. ⌘K·⌘T는 탭을 추가.
        await selectNote(entry.path, {
          via: "palette",
          replaceCurrentTab: $paletteIntent === "replace",
        });
        closePalette();
        break;
      case "tag":
        selectTag(entry.key, entry.mode);
        showTagsTab();
        closePalette();
        break;
      case "facet":
        if (entry.field === "doc_kind") toggleDocKind(entry.value);
        else toggleTopic(entry.value);
        closePalette();
        break;
      case "command":
        // 명령 자체가 다른 모달을 열 수 있음 — 팔레트 먼저 닫고 실행
        closePalette();
        await Promise.resolve(entry.command.run());
        break;
    }
  }

  /**
   * 지금 검색을 저장한다.
   *
   * ⚠️ **스코프를 같이 담는다.** 질의만 담으면 다른 프로젝트를 보던 중에 불렀을 때
   * 엉뚱한 결과가 나오고, 그건 저장된 검색이 고장 난 것처럼 읽힌다.
   */
  function saveCurrent(): void {
    const q = query.trim();
    if (q === "") return;
    saveSearch({ name: "", query: q, mode: $paletteHintMode, scope: $paletteScope });
  }

  function onKeydown(e: KeyboardEvent) {
    // ⚠️ `⌘S` 는 팔레트가 열려 있을 때만 여기로 온다 — 본문 저장과 겹치지 않는다.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCurrent();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      return;
    }
    /**
     * ⚠️ `Tab` 이 3.0 에서 **모드 순환**으로 바뀐다. v2 까지는 `ArrowDown` 의 별칭이었다 —
     * 화살표가 이미 그 일을 하므로 잃는 것은 없지만, 손이 기억하는 키라 CHANGELOG 에 적는다.
     */
    if (e.key === "Tab") {
      e.preventDefault();
      switchMode(cycleMode($paletteHintMode, e.shiftKey ? -1 : 1));
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      keyboardNavMode = true;
      activeIndex = Math.min(activeIndex + 1, Math.max(0, displayList.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      keyboardNavMode = true;
      activeIndex = Math.max(activeIndex - 1, 0);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void execute(activeIndex);
      return;
    }
  }

  /**
   * 모드를 갈아탄다.
   *
   * ⚠️ 접두사를 벗긴다. `#tag` 를 치던 중 `⇥` 를 누르면 모드는 `files` 가 되는데 입력에
   * `#` 이 남아 있으면 그 글자가 파일명 질의가 된다 — 모드는 바뀌었는데 결과가 안 바뀌는
   * 것처럼 보인다.
   */
  function switchMode(mode: PaletteMode) {
    setPaletteMode(mode);
    if (/^[>#:]/.test(query)) query = query.slice(1);
    activeIndex = 0;
    inputEl?.focus();
  }

  function modeLabel(mode: PaletteMode): string {
    switch (mode) {
      case "files":
        return m.palette_mode_files();
      case "fulltext":
        return m.palette_mode_fulltext();
      case "command":
        return m.palette_mode_command();
      default:
        return m.palette_mode_all();
    }
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) closePalette();
  }

  // command 안의 entry가 함수 ref라 매번 동일하지 않을 수 있어, 안정적인 key 생성
  function entryKey(entry: PaletteEntry): string {
    switch (entry.kind) {
      case "note":
      case "content":
      case "recent":
      case "changed":
        return `${entry.kind}:${entry.path}`;
      case "tag":
        return `tag:${entry.mode}:${entry.key}`;
      case "facet":
        return `facet:${entry.field}:${entry.value}`;
      case "command":
        return `cmd:${entry.command.id}`;
    }
  }

  // hint 모드별 표시할 그룹 결정 (Cmd+P/Cmd+Shift+F는 단일 그룹)
  // 모드별 가시성 규칙은 `palette.ts`의 `isGroupVisible`에 있다 — 여기 두면 테스트가 못 붙는다
  // (vitest가 environment:"node"라 컴포넌트를 못 띄운다). 여기선 "비어 있지 않은가"만 곱한다.
  const showRecents = $derived(groups.recents.length > 0);
  const showChanged = $derived(groups.changed.length > 0);
  const showNotes = $derived(isGroupVisible($paletteHintMode, "notes") && groups.notes.length > 0);
  const showContent = $derived(
    isGroupVisible($paletteHintMode, "content") && groups.content.length > 0,
  );
  const showTagsGroup = $derived(
    isGroupVisible($paletteHintMode, "tags") && groups.tags.length > 0,
  );
  const showFacets = $derived(
    isGroupVisible($paletteHintMode, "facets") && groups.facets.length > 0,
  );
  const showCommands = $derived(
    isGroupVisible($paletteHintMode, "commands") && groups.commands.length > 0,
  );
  /**
   * 라벨 접두사가 맞은 명령 — 목록 **맨 위**.
   *
   * 예전엔 명령이 항상 마지막이라, 명령 이름을 정확히 치기 시작해도 본문 검색 결과에
   * 밀려 한참 아래에 있었다. 점수로는 못 고친다 — 자리를 정하는 것은 점수가 아니라
   * 이 렌더 순서다.
   */
  const showTopCommands = $derived(
    isGroupVisible($paletteHintMode, "topCommands") && groups.topCommands.length > 0,
  );

  // 빈 입력 시 COMMANDS 그룹은 "QUICK ACTIONS"로 라벨
  const commandsHeaderLabel = $derived(
    query.trim() ? m.palette_group_commands() : m.palette_group_actions(),
  );

  // 풀텍스트 인덱스가 아직 준비 안 됨 — 두 가지 케이스:
  // 1) cold-start 풀 빌드 중 (`$indexBuilding`)
  // 2) cache hit 후 lazy load 진행 중 또는 대기 중 (`$fullTextLoading` || `$pendingFullTextJson`)
  const showContentBuildingHint = $derived(
    ($paletteHintMode === "fulltext" || $paletteHintMode === "all") &&
      !!query.trim() &&
      !$fullTextIndexReady &&
      ($indexBuilding || $fullTextLoading || !!$pendingFullTextVault),
  );
</script>

{#if $paletteOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={onBackdrop} transition:fade={backdropFade()}>
    <div
      class="modal"
      data-lapis="palette"
      role="dialog"
      aria-modal="true"
      aria-label={m.palette_aria()}
      in:cardIn out:cardOut
    >
      <input
        bind:this={inputEl}
        type="text"
        class="palette-input"
        {placeholder}
        bind:value={query}
        onkeydown={onKeydown}
        autocomplete="off"
        spellcheck="false"
      />

      <div class="modes" role="tablist" aria-label={m.palette_mode_aria()}>
        {#each CYCLE_MODES as mode (mode)}
          <button
            type="button"
            class="mode"
            class:active={$paletteHintMode === mode}
            role="tab"
            aria-selected={$paletteHintMode === mode}
            onclick={() => switchMode(mode)}
          >
            {modeLabel(mode)}
          </button>
        {/each}
      </div>

      {#if showFolderChips}
        <div class="folders" aria-label={m.palette_folder_aria()}>
          {#each chips as c (c.prefix)}
            <button
              type="button"
              class="folder"
              title={c.prefix}
              onclick={() => { setPaletteScope(c.prefix); activeIndex = 0; }}
            >
              <!-- ⚠️ 매칭은 `prefix`(절대경로), 표시는 `label`(vault 아래). -->
              <span class="folder-name">{c.label.replace(/\/$/, "")}</span>
              <span class="folder-count">{c.count}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!--
        ⚠️ 스코프는 **닫아도 남는다.** 남는 만큼 항상 보여야 한다 — 조용히 좁혀진 결과는
        "왜 안 나오지"가 되고, 그건 검색이 고장 난 것과 구별이 안 된다.
      -->
      {#if $paletteScope !== null}
        <div class="scope-bar">
          <span class="scope-label">{$paletteScope.replace(/\/$/, "")}</span>
          <button
            type="button"
            class="scope-clear"
            onclick={() => { setPaletteScope(null); activeIndex = 0; }}
          >
            {m.palette_folder_clear()}
          </button>
        </div>
      {/if}

      {#if imeSwappedTo}
        <!-- 🔴 조용히 바꾸지 않는다. 무엇으로 찾았는지 말한다. -->
        <div class="status ime-swap">{m.palette_ime_swapped({ query: imeSwappedTo })}</div>
      {/if}

      {#if stemMatched}
        <!-- 🔴 조용히 다른 것을 주지 않는다. 어떻게 찾았는지 말한다. -->
        <div class="status ime-swap">{m.palette_stem_matched()}</div>
      {/if}

      {#if showContentBuildingHint}
        <div class="status">{m.palette_status_building()}</div>
      {:else if displayList.length === 0 && query}
        <div class="status">{m.palette_status_empty()}</div>
      {:else if displayList.length === 0}
        <div class="status hint">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html m.palette_hint_full()}
        </div>
      {/if}

      <!--
        저장된 검색. ⚠️ **질의가 비었을 때만** 보인다 — 치기 시작하면 결과가 자리를 써야
        하고, 둘이 같이 있으면 무엇이 검색 결과인지 안 읽힌다.
      -->
      {#if query.trim() === "" && $savedSearches.length > 0}
        <div class="saved">
          <div class="group-header">{m.palette_group_saved()}</div>
          {#each $savedSearches as sv (sv.query + sv.mode + (sv.scope ?? ""))}
            <div class="saved-row">
              <button
                type="button"
                class="saved-open"
                onclick={() => {
                  setPaletteMode(sv.mode);
                  setPaletteScope(sv.scope);
                  query = sv.query;
                  activeIndex = 0;
                }}
              >
                <span class="saved-name">{savedLabel(sv)}</span>
                {#if sv.scope}<span class="saved-scope">{sv.scope.replace(/\/$/, "")}</span>{/if}
              </button>
              <button
                type="button"
                class="saved-remove"
                title={m.palette_saved_remove()}
                onclick={() => removeSavedSearch(sv)}>×</button
              >
            </div>
          {/each}
        </div>
      {/if}

      <div class="results" bind:this={listEl}>
        <!--
          이름을 치기 시작한 명령은 **맨 위**. 아래 COMMANDS 그룹과 같은 마크업이지만
          자리가 다르다 — 헤더 라벨도 항상 COMMANDS다(빈 질의에서는 이 그룹이 비므로
          QUICK ACTIONS 분기가 필요 없다).
        -->
        {#if showTopCommands}
          <div class="group-header">{m.palette_group_commands()}</div>
          {#each groups.topCommands as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "command"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">{e.command.label}</div>
                {#if e.command.shortcut}
                  <div class="shortcut">{formatShortcut(e.command.shortcut)}</div>
                {/if}
              </button>
            {/if}
          {/each}
        {/if}
        {#if showRecents}
          <div class="group-header">{m.palette_group_recent()}</div>
          {#each groups.recents as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "recent"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">{e.label}</div>
                {#if e.subtitle}<div class="sub">{e.subtitle}</div>{/if}
              </button>
            {/if}
          {/each}
        {/if}

        <!--
          '최근 연 것'과 **따로** 낸다. 섞으면 어느 축인지 알 수 없고, 밖에서 바뀐 노트는
          열람 이력에 없어서 위 목록엔 절대 안 나온다 — vault를 쓰는 건 Lapis가 아니라
          바깥 도구들이다.
        -->
        {#if showChanged}
          <div class="group-header">{m.palette_group_changed()}</div>
          {#each groups.changed as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "changed"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">{e.label}</div>
                {#if e.subtitle}<div class="sub">{e.subtitle}</div>{/if}
              </button>
            {/if}
          {/each}
        {/if}

        {#if showNotes}
          <div class="group-header">{m.palette_group_notes()}</div>
          {#each groups.notes as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "note"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">{e.label}</div>
                {#if e.subtitle}<div class="sub">{e.subtitle}</div>{/if}
              </button>
            {/if}
          {/each}
        {/if}

        {#if showContent}
          <div class="group-header">{m.palette_group_content()}</div>
          {#each groups.content as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "content"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">
                  {e.name}
                  <span class="rel" title={m.palette_rel_title()}>
                    {relScore(r.score, topContentScore).toFixed(2)}
                  </span>
                </div>
                <div class="snippet">{e.snippet}</div>
              </button>
            {/if}
          {/each}
        {/if}

        {#if showTagsGroup}
          <div class="group-header">{m.palette_group_tags()}</div>
          {#each groups.tags as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "tag"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">
                  #{e.display}
                  {#if e.mode === "prefix"}<span class="badge">prefix</span>{/if}
                </div>
                <div class="sub">{e.count} notes</div>
              </button>
            {/if}
          {/each}
        {/if}

        {#if showFacets}
          <div class="group-header">{m.palette_group_facets()}</div>
          {#each groups.facets as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "facet"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">
                  <span class="facet-field">{e.field}:</span> {e.value}
                </div>
                <div class="sub">{e.count} notes</div>
              </button>
            {/if}
          {/each}
        {/if}

        {#if showCommands}
          <div class="group-header">{commandsHeaderLabel}</div>
          {#each groups.commands as r (entryKey(r.entry))}
            {@const e = r.entry}
            {#if e.kind === "command"}
              {@const gi = displayIndexOf(e)}
              <button
                type="button"
                class="result"
                class:active={gi === activeIndex}
                data-idx={gi}
                onclick={() => execute(gi)}
                onmouseenter={() => { if (!keyboardNavMode) activeIndex = gi; }}
              >
                <div class="title">{e.command.label}</div>
                {#if e.command.shortcut}
                  <div class="shortcut">{formatShortcut(e.command.shortcut)}</div>
                {/if}
              </button>
            {/if}
          {/each}
        {/if}
      </div>

      <!--
        미리보기 — 고른 항목의 앞부분. **노트류일 때만** 나온다.

        ⚠️ 없을 때 자리를 차지하면 팔레트가 늘 두 배로 커진다. 명령·태그·facet 을 고를
           때는 미리볼 것이 없다.
      -->
      {#if peekPath}
        <div class="peek" aria-hidden="true">
          <div class="peek-path">{peekPath.split("/").pop()}</div>
          <pre class="peek-body">{peekText}</pre>
        </div>
      {/if}

      <footer class="palette-foot">
        <span>{m.palette_key_navigate()}</span>
        <span>{m.palette_key_save()}</span>
        <span>{m.palette_key_mode()}</span>
        <span>{m.palette_key_run()}</span>
        <span>{m.palette_key_close()}</span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--backdrop);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    z-index: var(--z-modal);
  }

  /*
    미리보기 — 목록 아래. 옆이 아니라 아래인 이유는 팔레트 폭이 계측으로 맞춰져 있고,
    옆으로 넓히면 결과 글자가 줄어들기 때문이다.
  */
  .peek {
    flex: none;
    max-height: 22vh;
    overflow: hidden;
    border-top: 1px solid var(--border-subtle, var(--border-default));
    padding: var(--sp-3) var(--sp-5);
    background: var(--surface-sunken);
  }

  .peek-path {
    color: var(--text-muted);
    font-size: var(--fs-xs);
    margin-bottom: var(--sp-2);
  }

  .peek-body {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--fs-xs);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    /* 넘치는 부분은 잘린다 — 여기서 읽는 게 아니라 "이거 맞나"를 가리는 자리다. */
    overflow: hidden;
  }

  .modal {
    width: min(680px, 92vw);
    max-height: 75vh;
    display: flex;
    flex-direction: column;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
    color: var(--text-primary);
  }

  .palette-input {
    width: 100%;
    padding: 14px 18px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-default);
    color: var(--text-primary);
    font-size: 15px;
    font-family: inherit;
    outline: none;
  }

  .palette-input::placeholder {
    color: var(--text-muted);
  }

  /* === 모드 칩 === */

  .modes {
    display: flex;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border-subtle);
    flex: none;
  }

  .mode {
    padding: 0 var(--sp-3);
    height: var(--control-h-sm);
    background: none;
    border: none;
    border-radius: var(--r-sm);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--fs-xs);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--dur-1) var(--ease-standard),
      color var(--dur-1) var(--ease-standard);
  }

  .mode:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }

  .mode.active {
    background: var(--accent-bg-subtle);
    color: var(--accent-text);
  }

  /* === 폴더 칩 (전문 모드) === */

  .folders {
    display: flex;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border-subtle);
    flex: none;
    /* 경로가 길면 줄이지 말고 가로로 흘린다. */
    overflow-x: auto;
  }

  .folder {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    max-width: 220px;
    padding: 0 var(--sp-2);
    height: var(--control-h-sm);
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    color: var(--text-muted);
    font: inherit;
    font-size: var(--fs-xs);
    white-space: nowrap;
    cursor: pointer;
  }

  .folder:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }

  .folder-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder-count {
    color: var(--text-disabled);
  }

  /**
   * 걸린 스코프. ⚠️ 칩(고를 것)과 **다르게 생겨야** 한다 — 같아 보이면 무엇이 걸린
   * 상태인지 안 읽히고, 그게 "왜 안 나오지"의 원인이 된다.
   */
  .scope-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    background: var(--accent-bg-subtle);
    color: var(--accent-text);
    font-size: var(--fs-xs);
  }

  .scope-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scope-clear {
    flex: none;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .saved {
    border-bottom: 1px solid var(--border-subtle);
  }

  .saved-row {
    display: flex;
    align-items: center;
  }

  .saved-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    padding: var(--sp-2) var(--sp-4);
    background: none;
    border: none;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .saved-open:hover {
    background: var(--surface-hover);
  }

  .saved-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .saved-scope {
    flex: none;
    color: var(--text-disabled);
    font-size: var(--fs-xs);
  }

  .saved-remove {
    flex: none;
    padding: 0 var(--sp-3);
    background: none;
    border: none;
    color: var(--text-disabled);
    font: inherit;
    cursor: pointer;
  }

  .saved-remove:hover {
    color: var(--danger-text);
  }

  .status {
    padding: 18px;
    text-align: center;
    color: var(--text-muted);
    font-size: var(--fs-base);
  }

  /* ⚠️ `:global()` — 이 문구는 인라인 마크업이 있어 `{@html}`로 그린다.
     Svelte scoped CSS는 `{@html}` 주입 요소에 안 붙는다(스코프 클래스 미부착). */
  .status.ime-swap {
    color: var(--accent-text);
  }

  .status.hint :global(kbd) {
    background: var(--surface-overlay);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-xs);
    padding: 1px 5px;
    margin: 0 var(--sp-1);
    color: var(--text-secondary);
    font-family: "SF Mono", Menlo, monospace;
    font-size: var(--fs-xs);
  }

  .results {
    overflow-y: auto;
    flex: 1;
    padding-bottom: var(--sp-2);
  }

  .group-header {
    position: sticky;
    top: 0;
    background: var(--surface-overlay);
    padding: var(--sp-4) 18px var(--sp-2);
    font-size: 10px;
    letter-spacing: 0.01em;
    color: var(--accent-text);
    font-weight: 600;
    z-index: 1;
  }

  .result {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 7px 18px;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    position: relative;
  }

  .result.active {
    background: var(--accent-bg-subtle);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  /**
   * 결과 등장 — **앞 8행만** 24ms 씩 밀린다.
   *
   * 자리는 `data-idx` 로 잡는다. `:nth-child` 는 그룹 헤더까지 세기 때문에 화면의 몇
   * 번째 행인지와 어긋난다.
   *
   * ⚠️ 9행부터는 지연 0 이다. 전부 밀면 아래쪽 결과가 늦게 나타나는데, 스크롤해서
   * 내려간 사람 눈에는 **비어 있는 목록**으로 보인다.
   */
  @keyframes row-in {
    from {
      opacity: 0;
      transform: translateY(7px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* 160ms 는 `--dur-*` 넷에 없다. 모션 명세가 stagger 24ms 와 짝으로 정한 값이라
     척도를 늘리지 않고 여기서만 쓴다(`motion.ts` 의 `MOTION_ROW` 와 같은 값). */
  .result {
    animation: row-in 160ms var(--ease-out) both;
  }

  .result[data-idx="1"] { animation-delay: 24ms; }
  .result[data-idx="2"] { animation-delay: 48ms; }
  .result[data-idx="3"] { animation-delay: 72ms; }
  .result[data-idx="4"] { animation-delay: 96ms; }
  .result[data-idx="5"] { animation-delay: 120ms; }
  .result[data-idx="6"] { animation-delay: 144ms; }
  .result[data-idx="7"] { animation-delay: 168ms; }

  /**
   * 본문 결과의 질의 내 상대 점수. MCP·CLI 의 `rel` 과 같은 값이다.
   *
   * ⚠️ raw BM25 를 그대로 내면 안 된다 — 질의마다 스케일이 달라("63 vs 1,494") 읽는
   * 사람이 질의를 가로질러 비교하게 된다.
   */
  .rel {
    margin-left: var(--sp-2);
    color: var(--text-disabled);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }

  .result.active .rel {
    color: var(--text-muted);
  }

  .title {
    font-size: var(--fs-md);
    color: var(--text-primary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .sub {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .snippet {
    font-size: var(--fs-sm);
    color: var(--text-secondary);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.4;
  }

  .badge {
    background: var(--accent-bg-subtle);
    color: var(--accent-hover);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: var(--r-lg);
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
  }

  .facet-field {
    color: var(--text-muted);
    font-weight: 500;
  }

  .shortcut {
    position: absolute;
    right: 18px;
    top: 50%;
    transform: translateY(-50%);
    font-family: "SF Mono", Menlo, monospace;
    font-size: var(--fs-xs);
    color: var(--text-muted);
    background: var(--surface-overlay);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-xs);
    padding: 1px var(--sp-3);
  }

  .palette-foot {
    display: flex;
    gap: var(--sp-6);
    justify-content: flex-end;
    padding: var(--sp-4) 14px;
    background: var(--surface-overlay);
    border-top: 1px solid var(--border-default);
    font-size: var(--fs-xs);
    color: var(--text-muted);
  }
</style>
