import { useEffect, useRef, useState } from "react";

const IDLE_HIDE_DELAY_MS = 2000;

// 全屏时无操作 2 秒自动隐藏工具栏；拖动过程中（isDragging）暂停隐藏，避免拖到一半淡出。
export function useFullscreenIdleHide(enabled: boolean, isDragging: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    function resetTimer() {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setHidden(false);
      if (isDragging) return;
      timerRef.current = window.setTimeout(() => setHidden(true), IDLE_HIDE_DELAY_MS);
    }

    resetTimer();
    window.addEventListener("pointermove", resetTimer);
    window.addEventListener("pointerdown", resetTimer);
    window.addEventListener("keydown", resetTimer);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener("pointermove", resetTimer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [enabled, isDragging]);

  return enabled && hidden;
}
