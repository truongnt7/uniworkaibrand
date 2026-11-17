import { useCallback, useEffect, useState } from 'react';
import type { JobRecord, RuntimeProgress, RuntimeStatus } from '@aps/shared';
import { invoke, subscribe } from './api';

export function useJobs(): JobRecord[] {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  useEffect(() => {
    let alive = true;
    void invoke('jobs:list').then((list) => alive && setJobs(list));
    const off = subscribe('jobs:changed', (job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx === -1) return [job, ...prev];
        const next = prev.slice();
        next[idx] = job;
        return next;
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return jobs;
}

export interface RuntimeState {
  status: RuntimeStatus | null;
  progress: RuntimeProgress | null;
  error: string | null;
  install: () => Promise<void>;
  importFile: () => Promise<void>;
}

export function useRuntime(): RuntimeState {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void invoke('runtime:status').then(setStatus);
    return subscribe('runtime:progress', (p) => {
      setProgress(p);
      if (p.phase === 'error') setError(p.errorCode ?? 'UNKNOWN');
    });
  }, []);

  const run = useCallback(async (fn: () => Promise<RuntimeStatus>) => {
    setError(null);
    try {
      setStatus(await fn());
    } catch (err) {
      setError((err as { code?: string }).code ?? 'UNKNOWN');
      setStatus(await invoke('runtime:status'));
    }
  }, []);

  return {
    status,
    progress,
    error,
    install: () => run(() => invoke('runtime:install')),
    importFile: async () => {
      const { path } = await invoke('dialog:pickFile', { kind: 'runtime' });
      if (path) await run(() => invoke('runtime:importFile', { path }));
    },
  };
}
