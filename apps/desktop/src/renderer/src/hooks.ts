import { useCallback, useEffect, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | null;
  /** true khi kết quả hiện có chưa ứng với phụ thuộc mới nhất (lần đầu hoặc đang tải lại) */
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

interface Settled<T> {
  data: T | null;
  error: Error | null;
  deps: readonly unknown[];
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Tải dữ liệu bất đồng bộ từ service; giữ dữ liệu cũ trong lúc tải lại, bỏ kết quả của yêu cầu đã lỗi thời. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const all = [...deps, tick];

  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setSettled({ data, error: null, deps: all }),
      (e: unknown) => alive && setSettled({ data: null, error: e instanceof Error ? e : new Error(String(e)), deps: all }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, all);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return {
    data: settled?.data ?? null,
    loading: !settled || !sameDeps(settled.deps, all),
    error: settled?.error ?? null,
    reload,
  };
}

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
