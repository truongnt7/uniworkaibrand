import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes, translateError, type Locale } from '@aps/i18n';
import type { RuntimePackageId, RuntimeProgress, RuntimeStatus } from '@aps/shared';
import type { CreateService } from '../../services/create';
import { Download, TriangleAlert } from '../../ui/Icon';
import { Button } from '../../ui/kit';

export type InstallPhase = 'idle' | 'busy' | 'failed';

export interface RuntimeInstallState {
  runtime: RuntimeStatus | null;
  phase: InstallPhase;
  /** Gói đang cài (để chỉ banner của gói đó hiện tiến độ). */
  active: RuntimePackageId | null;
  progress: RuntimeProgress | null;
  errorCode: string | null;
  /** Gói của lần cài vừa lỗi (chỉ banner của gói đó hiện lỗi). */
  failedPkg: RuntimePackageId | null;
  install: (pkg: RuntimePackageId) => Promise<void>;
}

/** Trạng thái runtime + cài theo gói (ffmpeg nhẹ trước, blender chỉ khi cần video 3D) với tiến độ từ sự kiện `runtime:progress`. */
export function useRuntimeInstall(service: CreateService): RuntimeInstallState {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [phase, setPhase] = useState<InstallPhase>('idle');
  const [active, setActive] = useState<RuntimePackageId | null>(null);
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [failedPkg, setFailedPkg] = useState<RuntimePackageId | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void service
      .runtimeStatus()
      .then((s) => alive.current && setRuntime(s))
      .catch(() => undefined);
    const off = service.onRuntimeProgress((p) => alive.current && setProgress(p));
    return () => {
      alive.current = false;
      off();
    };
  }, [service]);

  const install = useCallback(
    async (pkg: RuntimePackageId) => {
      setPhase('busy');
      setActive(pkg);
      setErrorCode(null);
      setFailedPkg(null);
      setProgress(null);
      try {
        const next = await service.runtimeInstall([pkg]);
        if (!alive.current) return;
        setRuntime(next);
        setPhase('idle');
      } catch (e) {
        if (!alive.current) return;
        setErrorCode((e as { code?: string }).code ?? 'UNKNOWN');
        setFailedPkg(pkg);
        setPhase('failed');
        void service
          .runtimeStatus()
          .then((s) => alive.current && setRuntime(s))
          .catch(() => undefined);
      } finally {
        if (alive.current) setActive(null);
      }
    },
    [service],
  );

  return { runtime, phase, active, progress, errorCode, failedPkg, install };
}

/** Câu tiếng Việt cho từng giai đoạn cài đặt (không có từ kỹ thuật như checksum/sha256). */
export function progressLine(t: (k: string, o?: Record<string, unknown>) => string, p: RuntimeProgress, locale: Locale): string {
  const name = t(`ui.create.runtime.name.${p.component}`);
  const stepText = p.steps && p.steps > 1 ? t('ui.create.runtime.step', { step: p.step, steps: p.steps }) : '';
  switch (p.phase) {
    case 'downloading': {
      const pct = p.totalBytes > 0 ? Math.min(100, Math.floor((p.receivedBytes / p.totalBytes) * 100)) : 0;
      return t('ui.create.runtime.downloading', {
        name,
        step: stepText,
        received: formatBytes(p.receivedBytes, locale),
        total: formatBytes(p.totalBytes, locale),
        pct,
        speed: p.bytesPerSecond > 0 ? t('ui.create.runtime.speed', { speed: formatBytes(p.bytesPerSecond, locale) }) : '',
      });
    }
    case 'retrying':
      return t('ui.create.runtime.retrying', { attempt: p.attempt, max: p.maxAttempts });
    case 'verifying':
      return t('ui.create.runtime.verifying', { name });
    case 'extracting':
      return t('ui.create.runtime.extracting', { name });
    case 'smoke-test':
      return t('ui.create.runtime.testing', { name });
    case 'activating':
      return t('ui.create.runtime.activating');
    case 'done':
      return t('ui.create.runtime.done');
    default:
      return t('ui.create.runtime.installing');
  }
}

export function RuntimeBanner({
  state,
  pkg,
  message,
  testId,
  buttonTestId,
  compact = false,
}: {
  state: RuntimeInstallState;
  pkg: RuntimePackageId;
  message: string;
  testId?: string;
  buttonTestId?: string;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const busy = state.phase === 'busy' && state.active === pkg;
  const failed = state.phase === 'failed' && state.errorCode !== null && state.failedPkg === pkg;
  const p = busy ? state.progress : null;
  const pct = p && p.phase === 'downloading' && p.totalBytes > 0 ? Math.min(100, (p.receivedBytes / p.totalBytes) * 100) : null;

  return (
    <div className="cr-banner cr-banner-info cr-runtime" data-testid={testId}>
      {failed ? <TriangleAlert size={20} /> : <Download size={20} />}
      <div className="grow cr-runtime-body">
        <span>{failed ? t('ui.create.runtime.failed') : message}</span>
        {failed ? (
          <span className="cr-hint" data-testid="runtime-error">
            {translateError((k) => t(k), state.errorCode)} {t('ui.create.runtime.resumeHint')}
          </span>
        ) : null}
        {busy ? (
          <div role="status" aria-live="polite" data-testid="runtime-progress">
            <div className="cr-hint">{p ? progressLine(t, p, locale) : t('ui.create.runtime.installing')}</div>
            <div
              className="cr-runtime-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              {...(pct !== null ? { 'aria-valuenow': Math.round(pct) } : {})}
            >
              <div className={`cr-runtime-bar-fill${pct === null ? ' is-indeterminate' : ''}`} style={{ width: pct === null ? '35%' : `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <Button variant="dark" className={compact ? 'btn-sm' : ''} disabled={busy || state.phase === 'busy'} onClick={() => void state.install(pkg)} data-testid={buttonTestId}>
        {busy ? t('ui.create.runtime.installing') : failed ? t('ui.create.runtime.resume') : t('ui.create.runtime.install')}
      </Button>
    </div>
  );
}
