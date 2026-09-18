/**
 * Svelte 의 `transition:` 은 `element.animate` 를 부른다. dom 테스트에서 모달처럼
 * 트랜지션을 쓰는 컴포넌트를 닫으려면 **끝났다고 알려 주는** 구현이 있어야 한다.
 *
 * ⚠️ **전역 setup 에 두지 않는다.** 이 저장소가 `resolve.conditions: ["browser"]` 를
 * 전역에 안 두는 것과 같은 이유다 — 어느 테스트가 무엇에 기대는지가 안 보이게 된다.
 * 필요한 파일이 명시적으로 부른다.
 *
 * ⚠️ **끝났다고 알려 줘야 한다.** 객체만 돌려주면 아웃트로가 영영 안 끝나고 닫힌 모달의
 * 노드가 DOM 에 남는다. 그러면 "모달이 안 닫힌다"는 **틀린 결론**이 나온다 — 이 저장소가
 * 프리뷰 계측에서 이미 한 번 헛짚은 자리다(숨겨진 탭에서 트랜지션이 안 끝나던 것).
 *
 * ## 🔴 환경이 주는 구현에 양보하지 않는다
 *
 * 예전엔 머리에 *"happy-dom 에는 Web Animations API 가 없다"* 고 적고
 * `if (Element.prototype.animate) return;` 로 **있으면 비켜섰다.** happy-dom 20.14.5 가
 * `animate` 를 갖게 되자 스텁이 조용히 물러났고, 그 구현은 `onfinish` 를 안 알려 줘서
 * 아웃트로가 안 끝났다 — `LinkRewritePreviewModal.dom.test.ts` 가
 * **"닫아도 모달이 안 사라진다"** 로 빨개졌다. 앱은 멀쩡한데 하네스가 꺼진 것이다.
 *
 * 그래서 **항상 덮어쓴다.** 테스트가 기대는 것은 "환경이 무엇을 주든"이 아니라
 * **이 스텁의 계약**이다. 환경의 애니메이션 충실도에 테스트를 매달면, 다음 업그레이드가
 * 또 에러 없이 결론을 뒤집는다.
 */
export function installAnimateStub(): void {
  (Element.prototype as unknown as { animate: () => unknown }).animate = () => {
    let onfinish: (() => void) | null = null;
    const a = {
      cancel() {},
      finish() {
        onfinish?.();
      },
      currentTime: 0,
      playState: "finished",
      finished: Promise.resolve(),
      addEventListener(_: string, cb: () => void) {
        setTimeout(cb, 0);
      },
      removeEventListener() {},
    };
    Object.defineProperty(a, "onfinish", {
      get: () => onfinish,
      set: (fn: (() => void) | null) => {
        onfinish = fn;
        if (fn) setTimeout(fn, 0);
      },
    });
    return a;
  };
}

/** 마이크로태스크와 타이머가 도는 틈. 트랜지션 아웃트로가 끝나야 노드가 사라진다. */
export const flushFrames = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
