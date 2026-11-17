import { useCallback, useRef, useState } from 'react';

export interface History<T> {
  value: T;
  set: (next: T, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (value: T) => void;
}

/** Undo/redo đơn giản; các thay đổi liên tiếp cùng khoá (vd. kéo thanh trượt) gộp thành một bước. */
export function useHistory<T>(initial: T, coalesceMs = 600): History<T> {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key: string; at: number } | null>(null);

  const set = useCallback(
    (next: T, key?: string) => {
      const now = Date.now();
      const coalesce = key !== undefined && last.current?.key === key && now - last.current.at < coalesceMs;
      last.current = key !== undefined ? { key, at: now } : null;
      setState((s) => (coalesce ? { ...s, present: next, future: [] } : { past: [...s.past, s.present].slice(-50), present: next, future: [] }));
    },
    [coalesceMs],
  );
  const undo = useCallback(() => {
    last.current = null;
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1]!, future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    last.current = null;
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((value: T) => {
    last.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  return { value: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, reset };
}
