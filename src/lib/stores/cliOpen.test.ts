import { describe, it, expect, vi } from "vitest";
import { claimCliOpen, startupCliOpen, type CliOpenDeps } from "./cliOpen";
import type { PendingOpen } from "$lib/tauri/cliOpen";

function deps(over: Partial<CliOpenDeps> = {}) {
  const calls = {
    take: [] as (string | null)[],
    openVault: [] as string[],
    selectNote: [] as string[],
    restored: 0,
    focus: 0,
    warned: [] as string[],
    order: [] as string[],
  };
  const base: CliOpenDeps = {
    take: async () => null,
    openVault: async (p) => {
      calls.openVault.push(p);
      calls.order.push(`vault:${p}`);
    },
    selectNote: async (p) => {
      calls.selectNote.push(p);
      calls.order.push(`note:${p}`);
    },
    restoreVault: async () => {
      calls.restored++;
      calls.order.push("restore");
    },
    currentVault: () => "/v",
    focus: async () => {
      calls.focus++;
    },
    warn: (m) => {
      calls.warned.push(m);
    },
  };
  const merged: CliOpenDeps = { ...base, ...over };
  // ⚠️ 기록은 오버라이드 **바깥**에서 감싼다. 안에 두면 `take`를 갈아끼운 테스트에서
  // 호출 기록이 통째로 사라져, "무엇으로 물었나"를 보는 단언이 빈 배열끼리 비교하며
  // 조용히 통과한다.
  const take = merged.take;
  merged.take = async (v) => {
    calls.take.push(v);
    return take(v);
  };
  return { deps: merged, calls };
}

const pending: PendingOpen = { path: "/v/a.md", vault: "/v" };

describe("claimCliOpen — 앱이 떠 있을 때", () => {
  it("자기 vault로 물어 받으면 연다", async () => {
    const { deps: d, calls } = deps({ take: async () => pending });
    expect(await claimCliOpen(d)).toBe("opened");
    expect(calls.take).toEqual(["/v"]);
    expect(calls.selectNote).toEqual(["/v/a.md"]);
    // 이미 그 vault다 — 다시 열 이유가 없다.
    expect(calls.openVault).toEqual([]);
    expect(calls.focus).toBe(1);
  });

  it("자기 것이 아니면 아무것도 안 한다", async () => {
    const { deps: d, calls } = deps();
    expect(await claimCliOpen(d)).toBe("not-mine");
    expect(calls.selectNote).toEqual([]);
    expect(calls.focus).toBe(0);
  });

  it("vault가 없으면 묻지도 않는다", async () => {
    const { deps: d, calls } = deps({ currentVault: () => null });
    expect(await claimCliOpen(d)).toBe("skipped");
    expect(calls.take).toEqual([]);
  });

  it("실패해도 던지지 않는다", async () => {
    const { deps: d, calls } = deps({
      take: async () => {
        throw new Error("IPC 끊김");
      },
    });
    await expect(claimCliOpen(d)).resolves.toBe("not-mine");
    expect(calls.warned).toHaveLength(1);
  });
});

describe("startupCliOpen — 창이 뜰 때", () => {
  /**
   * ⚠️ 순서가 계약이다. 복원을 먼저 하면 방금 열 vault를 덮어쓰고, 노트를 먼저 열면
   * 인덱스 없는 상태에서 열게 된다.
   */
  it("이 요청 때문에 뜬 창이면 복원하지 않고 vault→노트 순으로 연다", async () => {
    const { deps: d, calls } = deps({ take: async (v) => (v === null ? pending : null) });
    expect(await startupCliOpen(d)).toBe("opened");
    expect(calls.order).toEqual(["vault:/v", "note:/v/a.md"]);
    expect(calls.restored).toBe(0);
  });

  it("평범한 창이면 복원한 뒤 자기 vault로 다시 묻는다", async () => {
    const { deps: d, calls } = deps({ take: async (v) => (v === "/v" ? pending : null) });
    expect(await startupCliOpen(d)).toBe("opened");
    expect(calls.take).toEqual([null, "/v"]);
    expect(calls.order).toEqual(["restore", "note:/v/a.md"]);
  });

  it("아무것도 없으면 복원만 하고 끝난다", async () => {
    const { deps: d, calls } = deps();
    expect(await startupCliOpen(d)).toBe("not-mine");
    expect(calls.restored).toBe(1);
    expect(calls.selectNote).toEqual([]);
  });

  /**
   * ⚠️ 기동 경로다. 여기서 예외가 새면 초기화가 통째로 멈춘다 — CLI로 노트 하나 여는
   * 편의 기능 때문에 앱이 안 뜨면 안 된다.
   */
  it("첫 질의가 실패해도 복원은 한다", async () => {
    const { deps: d, calls } = deps({
      take: async (v) => {
        if (v === null) throw new Error("IPC 끊김");
        return null;
      },
    });
    await expect(startupCliOpen(d)).resolves.toBe("not-mine");
    expect(calls.restored).toBe(1);
    expect(calls.warned).toHaveLength(1);
  });

  it("열기가 실패해도 빈 창을 남기지 않는다 — 복원으로 되돌아간다", async () => {
    const { deps: d, calls } = deps({
      take: async (v) => (v === null ? pending : null),
      openVault: async () => {
        throw new Error("사라진 vault");
      },
    });
    await expect(startupCliOpen(d)).resolves.toBe("not-mine");
    expect(calls.restored).toBe(1);
    expect(calls.warned).toHaveLength(1);
  });

  /**
   * 🔴 focus 실패는 앞의 둘과 성격이 다르다 — **노트는 이미 열렸다.**
   *
   * 실사용 로그에서 `set_focus` 가 ACL 로 거부돼 5회 터졌고, 그때마다 catch 가 아래로
   * 떨어져 `restoreVault()` 가 **방금 연 노트를 덮어썼다.** 권한은 선언했지만, 다음에
   * 다른 이유로 포커스가 실패해도 노트를 잃으면 안 된다.
   */
  it("포커스가 실패해도 이미 연 노트는 지키고 복원하지 않는다", async () => {
    const { deps: d, calls } = deps({
      take: async (v) => (v === null ? pending : null),
      focus: async () => {
        throw new Error("Command plugin:window|set_focus not allowed by ACL");
      },
    });
    await expect(startupCliOpen(d)).resolves.toBe("opened");
    expect(calls.selectNote).toEqual(["/v/a.md"]);
    expect(calls.restored).toBe(0);
    expect(calls.warned).toHaveLength(1);
  });

  it("앱이 떠 있을 때도 포커스 실패가 열기를 무르지 않는다", async () => {
    const { deps: d, calls } = deps({
      take: async (v) => (v === "/v" ? pending : null),
      focus: async () => {
        throw new Error("ACL");
      },
    });
    await expect(claimCliOpen(d)).resolves.toBe("opened");
    expect(calls.selectNote).toEqual(["/v/a.md"]);
    expect(calls.warned).toHaveLength(1);
  });
});

describe("두 창이 동시에 물을 때", () => {
  it("Rust가 원자적으로 하나에만 준다는 전제를 지킨다", async () => {
    // 꺼내기를 한 번만 성공시키는 가짜 — 실제 `take_pending_open`의 계약이다.
    let left: PendingOpen | null = pending;
    const take = vi.fn(async (v: string | null) => {
      if (!left || v !== left.vault) return null;
      const got = left;
      left = null;
      return got;
    });
    const a = deps({ take });
    const b = deps({ take });
    const [ra, rb] = await Promise.all([claimCliOpen(a.deps), claimCliOpen(b.deps)]);
    expect([ra, rb].filter((r) => r === "opened")).toHaveLength(1);
  });
});
