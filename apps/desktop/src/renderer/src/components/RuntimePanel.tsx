import { useTranslation } from 'react-i18next';
import { formatBytes, translateError, type Locale } from '@aps/i18n';
import type { RuntimeState } from '../store';

export function RuntimePanel({ runtime }: { runtime: RuntimeState }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { status, progress, error } = runtime;
  const busy = status?.busy || (progress && !['done', 'error'].includes(progress.phase));
  const pct = progress && progress.totalBytes > 0 ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100) : 0;

  return (
    <div className="card" data-testid="runtime-panel">
      <h2>{t('runtime.title')}</h2>
      {status?.installed ? (
        <p className="ok" data-testid="runtime-installed">
          {t('runtime.installed', { version: status.version })}
        </p>
      ) : (
        <p className="muted">{t('runtime.notInstalled')}</p>
      )}
      {busy && progress && (
        <div className="progress-block" data-testid="runtime-progress">
          <div className="row">
            <strong>{t(`runtime.phase.${progress.phase}`)}</strong>
            {progress.phase === 'downloading' && (
              <span className="muted">
                {formatBytes(progress.receivedBytes, locale)} / {formatBytes(progress.totalBytes, locale)} ·{' '}
                {t('runtime.speed', { speed: formatBytes(progress.bytesPerSecond, locale) })}
              </span>
            )}
            {progress.phase === 'retrying' && <span className="warn">{t('runtime.attempt', { attempt: progress.attempt, max: progress.maxAttempts })}</span>}
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${progress.phase === 'downloading' ? pct : 100}%` }} />
          </div>
        </div>
      )}
      {error && <p className="error">{translateError(t, error)}</p>}
      <div className="actions">
        <button type="button" onClick={() => void runtime.install()} disabled={!!busy || status?.installed} data-testid="runtime-install">
          {busy ? t('runtime.installing') : t('runtime.install')}
        </button>
        <button type="button" className="secondary" onClick={() => void runtime.importFile()} disabled={!!busy} data-testid="runtime-import">
          {t('runtime.importFile')}
        </button>
      </div>
    </div>
  );
}
