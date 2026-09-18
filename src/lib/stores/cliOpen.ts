import { logWarn } from "$lib/stores/usage";
import { get } from "svelte/store";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { takePendingOpen, onCliOpen, type PendingOpen } from "$lib/tauri/cliOpen";
import { openVault, restoreLastVault, selectNote, vaultPath } from "$lib/stores/vault";

/**
 * `lapis open <노트>` 의 창 쪽 처리.
 *
 * ## 누가 받을지는 Rust가 정한다
 *
 * 창은 **자기 vault를 말할 뿐** 판정하지 않는다. Rust가 둘 중 하나면 넘겨준다:
 *
 * - 그 창이 **이 요청 때문에 만들어졌다**(라벨로 판정 — 차가운 기동의 `main`, 또는 아무도
 *   안 받아갔을 때 띄운 새 창).
 * - 말한 vault가 담긴 것과 **정확히 일치**한다.
 *
 * ⚠️ `null`을 넘기는 건 "무엇이든 달라"가 **아니다.** 그렇게 해석하면 vault를 아직 안 연
 * 창이 남을 노트를 가로챈다 — 기동 직후엔 모든 창의 vault가 `null`이라 실제로 일어난다.
 * Rust가 라벨을 함께 보기 때문에 안전하다.
 *
 * 전체 설계는 `src-tauri/src/cliopen.rs` 모듈 주석에 있다.
 */

/** 테스트가 갈아끼울 수 있게 모아둔 의존. 기본값이 실제 구현이다. */
export interface CliOpenDeps {
  take(vault: string | null): Promise<PendingOpen | null>;
  openVault(path: string): Promise<void>;
  selectNote(path: string): Promise<void>;
  restoreVault(): Promise<void>;
  currentVault(): string | null;
  focus(): Promise<void>;
  warn(message: string, error: unknown): void;
}

const defaultDeps: CliOpenDeps = {
  take: takePendingOpen,
  openVault,
  selectNote: (p) => selectNote(p, { via: "cli" }),
  restoreVault: restoreLastVault,
  currentVault: () => get(vaultPath),
  focus: async () => {
    const w = getCurrentWindow();
    await w.unminimize().catch(() => {});
    await w.show().catch(() => {});
    await w.setFocus();
  },
  warn: (m, e) => logWarn("stores/cliOpen", m, e),
};

export type ClaimResult = "opened" | "not-mine" | "skipped";

async function apply(
  deps: CliOpenDeps,
  pending: PendingOpen,
  needVault: boolean,
): Promise<ClaimResult> {
  // ⚠️ vault를 **먼저** 연다. 노트를 먼저 열면 인덱스가 없는 상태에서 열게 되고,
  // 뒤이은 `openVault`가 탭을 자기 것으로 갈아치운다.
  if (needVault) await deps.openVault(pending.vault);
  await deps.selectNote(pending.path);

  // 🔴 여기부터는 **노트가 이미 열렸다.** 포커스가 실패했다고 예외를 위로 던지면
  // `startupCliOpen`의 catch가 `restoreVault()`로 떨어져 **방금 연 노트를 덮어쓴다.**
  // 실제로 그랬다 — `core:window:allow-set-focus` 선언이 빠져 ACL이 거부했고,
  // `lapis open`이 노트를 열었다가 지난 vault로 되돌아갔다(실사용 로그 5회).
  // 권한은 선언했지만, 다음에 다른 이유로 포커스가 실패해도 열기는 이미 성공한 것이다.
  try {
    await deps.focus();
  } catch (e) {
    deps.warn("[cli-open] 포커스 실패", e);
  }
  return "opened";
}

/**
 * 이미 vault를 연 창이 묻는다 — 앱이 떠 있는 동안 온 `lapis open`.
 *
 * ⚠️ **실패해도 던지지 않는다.** 이벤트 핸들러에서 불리므로 여기서 새는 예외는 아무도
 * 안 잡는다.
 */
export async function claimCliOpen(deps: CliOpenDeps = defaultDeps): Promise<ClaimResult> {
  const vault = deps.currentVault();
  if (!vault) return "skipped";
  try {
    const pending = await deps.take(vault);
    if (!pending) return "not-mine";
    // 이미 그 vault다 — 다시 열 이유가 없다.
    return await apply(deps, pending, false);
  } catch (e) {
    deps.warn("[cli-open] 처리 실패", e);
    return "not-mine";
  }
}

/**
 * 창이 뜰 때 한 번 — vault 복원과 **순서가 얽혀 있어** 여기서 함께 다룬다.
 *
 * 1. 먼저 `null`로 묻는다. Rust가 라벨로 "이 창은 그 요청 때문에 만들어졌다"를 알면
 *    준다. 받으면 **마지막 vault를 복원하지 않는다** — 복원하면 방금 연 vault를 곧바로
 *    덮어쓴다.
 * 2. 못 받았으면 평범한 창이다. 복원하고, 그 vault로 다시 묻는다(차가운 기동에서 알림은
 *    창이 생기기 전에 이미 지나갔으므로 **직접** 물어야 한다).
 *
 * ⚠️ 이건 기동 경로다. 예외가 새면 vault 복원 이후의 초기화가 통째로 멈춘다 — CLI로
 * 노트 하나 여는 편의 기능 때문에 앱이 안 뜨면 안 된다. **복원은 반드시 시도한다.**
 */
export async function startupCliOpen(deps: CliOpenDeps = defaultDeps): Promise<ClaimResult> {
  let mine: PendingOpen | null = null;
  try {
    mine = await deps.take(null);
  } catch (e) {
    deps.warn("[cli-open] 기동 질의 실패", e);
  }

  if (mine) {
    try {
      return await apply(deps, mine, true);
    } catch (e) {
      deps.warn("[cli-open] 기동 열기 실패", e);
      // 열지 못했으면 평범한 창처럼 복원해서 빈 창을 남기지 않는다.
    }
  }

  await deps.restoreVault();
  return mine ? "not-mine" : claimCliOpen(deps);
}

/**
 * 이 창이 살아 있는 동안 `cli:open`을 듣는다. 해제 함수를 돌려준다.
 */
export async function listenCliOpen(deps: CliOpenDeps = defaultDeps): Promise<() => void> {
  try {
    return await onCliOpen(async () => {
      await claimCliOpen(deps);
    });
  } catch (e) {
    deps.warn("[cli-open] 구독 실패", e);
    return () => {};
  }
}
