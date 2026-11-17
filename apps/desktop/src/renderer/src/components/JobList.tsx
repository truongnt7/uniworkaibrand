import { useTranslation } from 'react-i18next';
import { formatDateTime, translateError, type Locale } from '@aps/i18n';
import type { JobRecord } from '@aps/shared';
import { invoke } from '../api';

function JobItem({ job }: { job: JobRecord }) {
  const { t, i18n } = useTranslation();
  const active = ['preparing', 'rendering', 'encoding'].includes(job.status);
  const canCancel = job.status === 'queued' || active;
  const canRetry = job.status === 'failed' || job.status === 'canceled';

  return (
    <li className={`job job-${job.status}`} data-testid="job-item" data-status={job.status}>
      <div className="row between">
        <div>
          <strong>{job.name}</strong>
          <span className={`badge badge-${job.status}`} data-testid="job-status">
            {t(`status.${job.status}`)}
          </span>
          <span className="badge badge-target">{job.target === 'local' ? t('job.targetLocal') : t('job.targetCloud')}</span>
        </div>
        <span className="muted small">{formatDateTime(job.createdAt, i18n.language as Locale)}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} data-testid="job-progress" />
      </div>
      <div className="row between muted small">
        <span>{t('job.frames', { frame: job.frame, total: job.totalFrames })}</span>
        {job.estimateS != null && active && <span>{t('job.estimate', { seconds: job.estimateS })}</span>}
        {job.deviceInfo && <span>{t('job.device', { device: job.deviceInfo })}</span>}
      </div>
      {job.errorCode && <p className="error" data-testid="job-error">{translateError(t, job.errorCode)}</p>}
      {job.status === 'done' && (
        <div className="preview" data-testid="job-preview">
          {job.kind === 'video' ? (
            <video src={`asset://job/${job.id}/output`} poster={`asset://job/${job.id}/poster`} controls loop muted data-testid="job-video" />
          ) : (
            <img src={`asset://job/${job.id}/output`} alt={job.name} data-testid="job-image" />
          )}
        </div>
      )}
      <div className="actions">
        {canCancel && (
          <button type="button" className="secondary" onClick={() => void invoke('jobs:cancel', { id: job.id })} data-testid="job-cancel">
            {t('job.cancel')}
          </button>
        )}
        {canRetry && (
          <button type="button" className="secondary" onClick={() => void invoke('jobs:retry', { id: job.id })} data-testid="job-retry">
            {t('job.retry')}
          </button>
        )}
        {!active && (
          <button type="button" className="ghost" onClick={() => void invoke('jobs:remove', { id: job.id })}>
            {t('job.remove')}
          </button>
        )}
      </div>
    </li>
  );
}

export function JobList({ jobs }: { jobs: JobRecord[] }) {
  const { t } = useTranslation();
  return (
    <div className="card" data-testid="job-list">
      <h2>{t('job.listTitle')}</h2>
      {jobs.length === 0 ? (
        <p className="muted">{t('job.empty')}</p>
      ) : (
        <ul className="jobs">
          {jobs.map((j) => (
            <JobItem key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  );
}
