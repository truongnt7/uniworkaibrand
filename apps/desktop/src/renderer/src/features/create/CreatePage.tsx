import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { translateError } from '@aps/i18n';
import type { JobRecord } from '@aps/shared';
import { CHANNELS, CHANNEL_LABELS, INDUSTRIES, INDUSTRY_LABELS, templatesFor, type Channel, type FieldSpec, type Industry, type PhotoSlot, type Template } from '@aps/templates';
import { useToast } from '../../app/Toast';
import { useServices } from '../../services';
import type { CreateService } from '../../services/create';
import {
  Check,
  Cloud,
  Cuboid,
  DoorOpen,
  FolderOpen,
  GraduationCap,
  HardHat,
  ImageIcon,
  LoaderCircle,
  Monitor,
  Music,
  Plus,
  RotateCcw,
  ShoppingBag,
  Trash2,
  TriangleAlert,
  Utensils,
  X,
  CircleX,
  Download,
  Copy,
} from '../../ui/Icon';
import { Button, PageHeader } from '../../ui/kit';
import { RuntimeBanner, useRuntimeInstall, type RuntimeInstallState } from './RuntimeInstall';
import { suggestedDraftName, templateSeconds, useCreateFlow } from './useCreateFlow';
import './create.css';

const INDUSTRY_ICON: Record<Industry, typeof ShoppingBag> = {
  'ban-hang-online': ShoppingBag,
  'nha-hang': Utensils,
  'nhom-kinh': DoorOpen,
  'xay-dung': HardHat,
  'ngoai-ngu': GraduationCap,
};

const ASPECT_ORDER = ['9:16', '4:5', '1:1', '16:9'] as const;

function useErrorText() {
  const { t } = useTranslation();
  return (code: string | null | undefined) => translateError((k) => t(k), code);
}

export function CreatePage() {
  const { t } = useTranslation();
  const { create: service } = useServices();
  if (!service.available()) {
    return (
      <div className="page create-page" data-testid="create-page">
        <PageHeader title={t('ui.create.title')} subtitle={t('ui.create.subtitle')} />
        <div className="cr-banner cr-banner-warn" role="alert" data-testid="create-no-bridge">
          <TriangleAlert size={20} />
          <span>{t('ui.create.noBridge')}</span>
        </div>
      </div>
    );
  }
  return <CreateScreen service={service} />;
}

function CreateScreen({ service }: { service: CreateService }) {
  const { t } = useTranslation();
  const toast = useToast();
  const flow = useCreateFlow(service);
  const { form, template } = flow;
  const hasIndustry = form.industry !== null;
  const ready = Boolean(template) && flow.missing.length === 0;
  const issueCount = flow.visibleIssues.length;
  const rt = useRuntimeInstall(service);
  const runtime = rt.runtime;
  const needFfmpeg = runtime !== null && !runtime.ffmpegPath;

  const onCreate = async () => {
    const ok = await flow.create();
    if (!ok) document.querySelector('[data-invalid="true"]')?.scrollIntoView?.({ block: 'center' });
  };

  return (
    <div className="page create-page" data-testid="create-page">
      <PageHeader title={t('ui.create.title')} subtitle={t('ui.create.subtitle')} />
      {needFfmpeg ? <RuntimeBanner state={rt} pkg="ffmpeg" message={t('ui.create.runtime.missing')} testId="runtime-banner" buttonTestId="runtime-install" /> : null}
      <div className="cr-layout">
        <div className="cr-form">
          <DraftBar flow={flow} />

          <Step n={1} title={t('ui.create.step1')} testId="step-industry">
            <div className="cr-industries" role="radiogroup" aria-label={t('ui.create.step1')}>
              {INDUSTRIES.map((id) => {
                const Icon = INDUSTRY_ICON[id];
                const active = form.industry === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={active} className={`cr-industry${active ? ' is-active' : ''}`} data-testid={`industry-${id}`} onClick={() => flow.setIndustry(id)}>
                    <Icon size={26} aria-hidden />
                    <span>{INDUSTRY_LABELS[id]}</span>
                  </button>
                );
              })}
            </div>
            {!hasIndustry ? (
              <p className="cr-hint cr-hint-strong" data-testid="empty-hint">
                {t('ui.create.step1Empty')}
              </p>
            ) : null}
          </Step>

          <div className={`cr-group${hasIndustry ? '' : ' cr-locked'}`} aria-disabled={!hasIndustry} inert={!hasIndustry}>
            <Step n={2} title={t('ui.create.step2')} testId="step-template">
              <div className="cr-templates" role="radiogroup" aria-label={t('ui.create.step2')}>
                {(form.industry ? templatesFor(form.industry) : []).map((tpl) => (
                  <TemplateCard key={tpl.id} tpl={tpl} active={form.templateId === tpl.id} onPick={() => flow.setTemplate(tpl.id)} />
                ))}
              </div>
            </Step>

            <Step n={3} title={t('ui.create.step3')} testId="step-info">
              {template ? (
                <>
                  <div className="cr-fields">
                    {template.fields.map((f) => (
                      <FieldInput key={f.key} spec={f} value={form.values[f.key] ?? ''} issue={flow.issueFor(f.key)?.message ?? null} warning={flow.validation.warnings.find((w) => w.field === f.key)?.message ?? null} onChange={(v) => flow.setValue(f.key, v)} onBlur={() => flow.blurValue(f.key)} />
                    ))}
                  </div>
                  <div className="cr-remember">
                    <Check size={15} aria-hidden />
                    <span>{t('ui.create.remembered')}</span>
                    <button type="button" className="cr-link" data-testid="forget-profile" onClick={() => void flow.forgetProfile().then(() => toast(t('ui.create.forgotten')))}>
                      {t('ui.create.forget')}
                    </button>
                  </div>
                </>
              ) : null}
            </Step>

            <Step n={4} title={t('ui.create.step4')} testId="step-photos">
              {template ? (
                <>
                  <div className="cr-photos">
                    {template.photos.map((slot) => (
                      <PhotoCard
                        key={slot.id}
                        slot={slot}
                        path={form.photos[slot.id] ?? null}
                        thumb={form.photos[slot.id] ? (flow.thumbs[form.photos[slot.id]!] ?? null) : null}
                        issue={flow.issueFor(`photo:${slot.id}`)?.message ?? (flow.photoErrors[slot.id] ? translateError((k) => t(k), flow.photoErrors[slot.id]) : null)}
                        converting={flow.converting.has(slot.id)}
                        converted={flow.converted.has(slot.id)}
                        caption={form.captions[slot.id] ?? ''}
                        onPick={() => void flow.pickPhoto(slot.id)}
                        onDrop={(file) => flow.dropPhoto(slot.id, file)}
                        onRemove={() => flow.setPhoto(slot.id, null)}
                        onCaption={(v) => flow.setCaption(slot.id, v)}
                      />
                    ))}
                  </div>
                  <div className="cr-extras">
                    <div className="cr-extra" data-testid="logo-box">
                      <span className="cr-label">{t('ui.create.logo')}</span>
                      {template.logo === 'none' ? (
                        <span className="cr-hint">{t('ui.create.logoUnavailable')}</span>
                      ) : (
                        <div className="cr-extra-row">
                          {form.logoPath && flow.thumbs[form.logoPath] ? <img className="cr-logo-thumb" src={flow.thumbs[form.logoPath]!} alt="" /> : <ImageIcon size={20} aria-hidden />}
                          <span className="cr-hint grow">{form.logoPath ? form.logoPath.split(/[\\/]/).pop() : t('ui.create.logoNone')}</span>
                          <Button className="btn-sm" onClick={() => void flow.pickLogo()} data-testid="logo-pick">
                            {form.logoPath ? t('ui.create.logoChange') : t('ui.create.logoAdd')}
                          </Button>
                          {form.logoPath ? (
                            <Button variant="ghost" className="btn-sm" onClick={() => void flow.removeLogo()} data-testid="logo-remove">
                              {t('ui.create.logoRemove')}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="cr-extra" data-testid="music-box">
                      <span className="cr-label">{t('ui.create.music')}</span>
                      {template.music === 'none' ? (
                        <span className="cr-hint">{t('ui.create.musicUnavailable')}</span>
                      ) : (
                        <>
                          <div className="cr-extra-row" role="radiogroup" aria-label={t('ui.create.music')}>
                            <label className="cr-radio">
                              <input type="radio" name="music" checked={!form.musicPath} onChange={flow.removeMusic} data-testid="music-none" />
                              <span>{t('ui.create.musicNone')}</span>
                            </label>
                            <label className="cr-radio">
                              <input type="radio" name="music" checked={Boolean(form.musicPath)} onChange={() => void flow.pickMusic()} data-testid="music-choose" />
                              <Music size={15} aria-hidden />
                              <span>{form.musicPath ? form.musicPath.split(/[\\/]/).pop() : t('ui.create.musicChoose')}</span>
                            </label>
                          </div>
                          <span className="cr-hint">{t('ui.create.musicNote')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="cr-aspects" role="radiogroup" aria-label={t('ui.create.aspect')}>
                    <span className="cr-label">{t('ui.create.aspect')}</span>
                    {ASPECT_ORDER.filter((a) => template.aspects.includes(a)).map((a) => {
                      const active = (form.aspect ?? template.defaultAspect) === a;
                      return (
                        <button key={a} type="button" role="radio" aria-checked={active} className={`cr-chip${active ? ' is-active' : ''}`} data-testid={`aspect-${a}`} onClick={() => flow.setAspect(a)}>
                          {t(`ui.create.aspects.${a.replace(':', 'x')}`)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </Step>

            <div className="cr-submit">
              <fieldset className="cr-target" data-testid="target-box">
                <legend className="cr-label">{t('ui.create.target')}</legend>
                <label className="cr-radio">
                  <input type="radio" name="target" checked readOnly data-testid="target-local" />
                  <Monitor size={15} aria-hidden />
                  <span>{t('ui.create.targetLocal')}</span>
                </label>
                <label className="cr-radio is-disabled">
                  <input type="radio" name="target" disabled data-testid="target-cloud" />
                  <Cloud size={15} aria-hidden />
                  <span>{t('ui.create.targetCloud')}</span>
                  <span className="cr-badge">{t('ui.create.soon')}</span>
                </label>
              </fieldset>
              <Button variant="dark" className="cr-create" disabled={!ready} onClick={() => void onCreate()} data-testid="create-button">
                {t('ui.create.createButton')}
              </Button>
              {hasIndustry && flow.missing.length > 0 ? (
                <p className="cr-hint cr-missing" data-testid="missing-list">
                  {t('ui.create.missing', { items: flow.missing.join(', ') })}
                </p>
              ) : null}
              {flow.submitted && issueCount > 0 ? (
                <p className="cr-error-text" role="alert" data-testid="fix-issues">
                  {t('ui.create.fixIssues', { count: issueCount })}
                </p>
              ) : null}
              {flow.submitted
                ? flow.visibleIssues
                    .filter((i) => i.field === 'photo' || i.field === 'aspect' || i.field.startsWith('caption:') || i.code === 'unknown_slot')
                    .map((i) => (
                      <p key={`${i.field}-${i.code}`} className="cr-error-text" role="alert">
                        {i.message}
                      </p>
                    ))
                : null}
              {flow.error ? (
                <p className="cr-error-text" role="alert" data-testid="create-error">
                  {flow.error.code === 'UNKNOWN' ? flow.error.message : <ErrorMessage code={flow.error.code} />}
                </p>
              ) : null}
            </div>
          </div>

          <Director3D service={service} rt={rt} />
        </div>

        <aside className="cr-side" aria-label={t('ui.create.preview.title')}>
          <PreviewPanel flow={flow} service={service} template={template} />
          <CaptionPanel flow={flow} service={service} ready={ready} />
          <QueuePanel jobs={flow.jobs} service={service} shownId={flow.shownJob?.id ?? null} onView={flow.view} />
        </aside>
      </div>
    </div>
  );
}

function ErrorMessage({ code }: { code: string }) {
  const text = useErrorText();
  return <>{text(code)}</>;
}

function DraftBar({ flow }: { flow: Flow }) {
  const { t, i18n } = useTranslation();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const others = flow.drafts.filter((d) => d.id !== flow.draftId);
  const suggested = suggestedDraftName(flow.form);
  const time = flow.draftSavedAt ? new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(flow.draftSavedAt) : '';
  const status =
    flow.draftStatus === 'saving'
      ? t('ui.create.draft.saving')
      : flow.draftStatus === 'saved'
        ? t('ui.create.draft.saved', { time })
        : flow.draftStatus === 'error'
          ? t('ui.create.draft.error')
          : t('ui.create.draft.idle');
  return (
    <section className="cr-drafts" data-testid="draft-bar" aria-label={t('ui.create.draft.title')}>
      <div className="cr-drafts-row">
        <label className="cr-field grow">
          <span className="cr-label">{t('ui.create.draft.name')}</span>
          <input type="text" value={flow.draftName} maxLength={120} placeholder={suggested || t('ui.create.draft.namePlaceholder')} onChange={(e) => flow.setDraftName(e.target.value)} data-testid="draft-name" />
        </label>
        <Button className="btn-sm" onClick={flow.newDraft} data-testid="draft-new">
          <Plus size={14} aria-hidden /> {t('ui.create.draft.new')}
        </Button>
      </div>
      <p className="cr-hint" role="status" data-testid="draft-status" data-state={flow.draftStatus}>
        {status}
      </p>
      {flow.missingFiles.length > 0 ? (
        <p className="cr-warn-text" role="alert" data-testid="draft-missing">
          {t('ui.create.draft.missing', { count: flow.missingFiles.length })}
        </p>
      ) : null}
      {others.length > 0 ? (
        <details className="cr-draft-list">
          <summary>{t('ui.create.draft.others', { count: others.length })}</summary>
          <ul data-testid="draft-list">
            {others.map((d) => (
              <li key={d.id} data-testid={`draft-item-${d.id}`}>
                <button type="button" className="cr-draft-open" onClick={() => void flow.openDraft(d.id)} data-testid={`draft-open-${d.id}`}>
                  <strong className="ellipsis">{d.name}</strong>
                  <span className="cr-hint">{t('ui.create.draft.photos', { count: d.photoCount })}</span>
                </button>
                {confirmId === d.id ? (
                  <Button
                    variant="ghost"
                    className="btn-sm"
                    onClick={() => {
                      setConfirmId(null);
                      void flow.removeDraft(d.id);
                    }}
                    data-testid={`draft-delete-confirm-${d.id}`}
                  >
                    {t('ui.create.draft.deleteConfirm')}
                  </Button>
                ) : (
                  <Button variant="ghost" className="btn-sm" onClick={() => setConfirmId(d.id)} data-testid={`draft-delete-${d.id}`} aria-label={`${t('ui.create.draft.delete')}: ${d.name}`}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Step({ n, title, testId, children }: { n: number; title: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="cr-step" data-testid={testId}>
      <h2 className="cr-step-title">
        <span className="cr-step-n" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function TemplateCard({ tpl, active, onPick }: { tpl: Template; active: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" role="radio" aria-checked={active} className={`cr-template${active ? ' is-active' : ''}`} data-testid={`template-${tpl.id}`} onClick={onPick}>
      <span className="cr-template-swatch" style={{ background: `linear-gradient(135deg, ${tpl.palette.primary}, ${tpl.palette.accent})` }} aria-hidden />
      <span className="cr-template-body">
        <strong>{tpl.name}</strong>
        <span className="cr-hint">{tpl.summary}</span>
        <span className="cr-hint">{t('ui.create.seconds', { n: templateSeconds(tpl) })}</span>
      </span>
      {active ? <Check size={18} aria-hidden /> : null}
    </button>
  );
}

function FieldInput({ spec, value, issue, warning, onChange, onBlur }: { spec: FieldSpec; value: string; issue: string | null; warning: string | null; onChange: (v: string) => void; onBlur: () => void }) {
  const { t } = useTranslation();
  const id = `field-${spec.key}`;
  const multiline = spec.key === 'detail' || spec.key === 'address';
  const common = {
    id,
    value,
    placeholder: spec.example,
    'aria-required': spec.required,
    'aria-invalid': Boolean(issue),
    'aria-describedby': `${id}-msg`,
    'data-testid': id,
    onBlur,
  };
  return (
    <div className="cr-field" data-invalid={issue ? 'true' : undefined}>
      <label htmlFor={id} className="cr-label">
        {spec.label}
        {spec.required ? <span className="cr-req" title={t('ui.create.required')}> *</span> : null}
      </label>
      {multiline ? (
        <textarea rows={2} {...common} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      <div id={`${id}-msg`}>
        {issue ? (
          <p className="cr-error-text" role="alert" data-testid={`${id}-error`}>
            {issue}
          </p>
        ) : spec.hint ? (
          <p className="cr-hint">{spec.hint}</p>
        ) : null}
        {warning && !issue ? (
          <p className="cr-warn-text" data-testid={`${id}-warning`}>
            {warning}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PhotoCard({ slot, path, thumb, issue, converting, converted, caption, onPick, onDrop, onRemove, onCaption }: { slot: PhotoSlot; path: string | null; thumb: string | null; issue: string | null; converting: boolean; converted: boolean; caption: string; onPick: () => void; onDrop: (f: File) => void; onRemove: () => void; onCaption: (v: string) => void }) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  };
  return (
    <div className={`cr-photo${over ? ' is-over' : ''}${issue ? ' has-issue' : ''}`} data-testid={`photo-${slot.id}`} data-invalid={issue ? 'true' : undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={handleDrop}>
      <div className="cr-photo-head">
        <span className="cr-label">{slot.label}</span>
        <span className={`cr-badge${slot.required ? ' is-req' : ''}`}>{slot.required ? t('ui.create.photoRequired') : t('ui.create.photoOptional')}</span>
      </div>
      <button type="button" className="cr-photo-drop" onClick={onPick} data-testid={`photo-pick-${slot.id}`} aria-label={path ? `${t('ui.create.changePhoto')}: ${slot.label}` : `${t('ui.create.addPhoto')}: ${slot.label}`}>
        {path && thumb ? (
          <img src={thumb} alt={slot.label} data-testid={`photo-thumb-${slot.id}`} />
        ) : path ? (
          <span className="cr-photo-file" data-testid={`photo-file-${slot.id}`}>
            <ImageIcon size={22} aria-hidden />
            <span className="ellipsis">{path.split(/[\\/]/).pop()}</span>
          </span>
        ) : (
          <span className="cr-photo-empty">
            <Plus size={22} aria-hidden />
            <span>{t('ui.create.dropHint')}</span>
          </span>
        )}
      </button>
      {converting ? (
        <p className="cr-hint cr-converting" role="status" data-testid={`photo-converting-${slot.id}`}>
          <LoaderCircle size={14} className="cr-spin" aria-hidden /> {t('ui.create.photoConverting')}
        </p>
      ) : null}
      {converted && !converting && !issue ? (
        <p className="cr-hint" role="status" data-testid={`photo-converted-${slot.id}`}>
          {t('ui.create.photoConverted')}
        </p>
      ) : null}
      {slot.hint && !issue ? <p className="cr-hint">{slot.hint}</p> : null}
      {issue ? (
        <p className="cr-error-text" role="alert" data-testid={`photo-error-${slot.id}`}>
          {issue}
        </p>
      ) : null}
      {path ? (
        <div className="cr-photo-actions">
          <Button variant="ghost" className="btn-sm" onClick={onPick}>
            {t('ui.create.changePhoto')}
          </Button>
          <Button variant="ghost" className="btn-sm" onClick={onRemove} data-testid={`photo-remove-${slot.id}`}>
            <Trash2 size={14} aria-hidden />
            {t('ui.create.removePhoto')}
          </Button>
        </div>
      ) : null}
      {slot.caption ? (
        <label className="cr-field">
          <span className="cr-hint">{slot.caption.label}</span>
          <input type="text" value={caption} maxLength={slot.caption.maxChars} placeholder={slot.caption.example} onChange={(e) => onCaption(e.target.value)} data-testid={`photo-caption-${slot.id}`} aria-label={`${t('ui.create.photoCaption')}: ${slot.label}`} />
        </label>
      ) : null}
    </div>
  );
}

type Flow = ReturnType<typeof useCreateFlow>;

function ProgressBar({ job }: { job: JobRecord }) {
  const pct = Math.round(job.progress * 100);
  return (
    <div className="cr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-testid="preview-progress">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const ACTIVE = new Set(['queued', 'preparing', 'rendering', 'encoding']);

function PreviewPanel({ flow, service, template }: { flow: Flow; service: CreateService; template: Template | null }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const toast = useToast();
  const finalBusy = flow.saving && flow.finalRecord && flow.finalRecord.status !== 'done';
  const job = finalBusy ? flow.finalRecord! : flow.shownJob;
  const status = job?.status ?? null;
  const [showDetails, setShowDetails] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  let state: 'empty' | 'running' | 'done' | 'failed' | 'canceled' = 'empty';
  if (job) {
    if (status === 'done') state = 'done';
    else if (status === 'failed' || status === 'needs_attention') state = 'failed';
    else if (status === 'canceled') state = 'canceled';
    else state = 'running';
  }
  const showVideo = Boolean(flow.shownJob && flow.shownJob.status === 'done' && !finalBusy);
  const onSave = async () => {
    await flow.save();
  };

  return (
    <section className="cr-panel" data-testid="preview-panel" data-state={state} data-stale={flow.stale ? 'true' : 'false'}>
      <h2 className="cr-panel-title">{t('ui.create.preview.title')}</h2>
      <div className={`cr-stage aspect-${(template?.aspects ? (flow.form.aspect ?? template.defaultAspect) : '9:16').replace(':', '-')}`}>
        {showVideo && flow.shownJob ? (
          <video ref={videoRef} key={flow.shownJob.id} src={service.videoUrl(flow.shownJob)} controls playsInline muted preload="auto" aria-label={t('ui.create.preview.videoLabel')} data-testid="preview-video" />
        ) : state === 'running' && job ? (
          <div className="cr-stage-msg" data-testid="preview-running">
            <LoaderCircle size={28} className="cr-spin" aria-hidden />
            <p>{status === 'queued' ? t('ui.create.preview.queued') : flow.saving ? t('ui.create.preview.runningFinal') : t('ui.create.preview.running')}</p>
            <ProgressBar job={job} />
            <p className="cr-hint">
              {Math.round(job.progress * 100)}%{job.estimateS ? ` · ${t('ui.create.preview.remaining', { n: job.estimateS })}` : ''}
            </p>
            <Button className="btn-sm" onClick={() => void service.cancel(job.id)} data-testid="preview-cancel">
              <X size={14} aria-hidden />
              {t('ui.create.preview.cancel')}
            </Button>
          </div>
        ) : state === 'failed' && job ? (
          <div className="cr-stage-msg cr-stage-error" role="alert" data-testid="preview-error">
            <TriangleAlert size={28} aria-hidden />
            <strong>{t('ui.create.preview.failed')}</strong>
            <p>{errorText(job.errorCode)}</p>
            <div className="cr-row">
              <Button variant="dark" className="btn-sm" onClick={() => void service.retry(job.id)} data-testid="preview-retry">
                <RotateCcw size={14} aria-hidden />
                {t('ui.create.preview.retry')}
              </Button>
              <button type="button" className="cr-link" onClick={() => setShowDetails((v) => !v)} data-testid="preview-details-toggle">
                {t('ui.create.preview.details')}
              </button>
            </div>
            {showDetails ? <pre className="cr-details" data-testid="preview-details">{job.errorCode}: {job.errorMessage}</pre> : null}
          </div>
        ) : state === 'canceled' && job ? (
          <div className="cr-stage-msg" data-testid="preview-canceled">
            <CircleX size={28} aria-hidden />
            <p>{t('ui.create.preview.canceled')}</p>
            <Button variant="dark" className="btn-sm" onClick={() => void service.retry(job.id)} data-testid="preview-retry">
              <RotateCcw size={14} aria-hidden />
              {t('ui.create.preview.retry')}
            </Button>
          </div>
        ) : (
          <div className="cr-stage-msg" data-testid="preview-empty">
            <ImageIcon size={28} aria-hidden />
            <p>{template ? t('ui.create.preview.empty') : t('ui.create.preview.emptyIndustry')}</p>
          </div>
        )}
      </div>
      {flow.stale ? (
        <p className="cr-stale" role="status" data-testid="preview-stale">
          <TriangleAlert size={15} aria-hidden /> {t('ui.create.preview.stale')}
        </p>
      ) : null}
      <div className="cr-save">
        <Button variant="lime" className="cr-save-btn" disabled={!showVideo || flow.saving} onClick={() => void onSave()} data-testid="save-button">
          <Download size={16} aria-hidden />
          {flow.saving ? t('ui.create.preview.runningFinal') : t('ui.create.save')}
        </Button>
        {flow.saved ? (
          <div className="cr-saved" role="status" data-testid="save-status">
            <Check size={16} aria-hidden />
            <span className="grow ellipsis" title={flow.saved.path}>{t('ui.create.saved', { name: flow.saved.name })}</span>
            <Button className="btn-sm" onClick={() => void service.reveal({ path: flow.saved!.path }).then((ok) => ok && toast(t('ui.create.openFolder')))} data-testid="open-folder">
              <FolderOpen size={14} aria-hidden />
              {t('ui.create.openFolder')}
            </Button>
          </div>
        ) : (
          <p className="cr-hint">{t('ui.create.saveHint')}</p>
        )}
        {flow.saveError ? (
          <p className="cr-error-text" role="alert" data-testid="save-error">
            {t('ui.create.saveFailed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CaptionPanel({ flow, service, ready }: { flow: Flow; service: CreateService; ready: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const channels = flow.captions.length > 0 ? flow.captions.map((c) => c.channel) : ([...CHANNELS] as Channel[]);
  const [active, setActive] = useState<Channel>('facebook');
  const [edits, setEdits] = useState<Record<string, { base: string; text: string }>>({});
  const current = flow.captions.find((c) => c.channel === active) ?? null;
  const edit = edits[active];
  const text = current ? (edit && edit.base === current.text ? edit.text : current.text) : '';
  const label = CHANNEL_LABELS[active];

  return (
    <section className="cr-panel" data-testid="caption-panel">
      <h2 className="cr-panel-title">{t('ui.create.caption.title')}</h2>
      <div role="tablist" aria-label={t('ui.create.caption.title')} className="cr-tabs">
        {channels.map((ch) => (
          <button key={ch} role="tab" type="button" aria-selected={active === ch} className={`cr-tab${active === ch ? ' is-active' : ''}`} data-testid={`caption-tab-${ch}`} onClick={() => setActive(ch)}>
            {CHANNEL_LABELS[ch]}
          </button>
        ))}
      </div>
      {current && ready ? (
        <>
          <textarea className="cr-caption" rows={7} value={text} aria-label={t('ui.create.caption.label', { channel: label })} data-testid="caption-text" onChange={(e) => setEdits((s) => ({ ...s, [active]: { base: current.text, text: e.target.value } }))} />
          <p className="cr-hint">{t('ui.create.caption.editHint')}</p>
          <Button variant="dark" onClick={() => void service.copyText(text).then(() => toast(t('ui.create.caption.copied', { channel: label })))} data-testid="caption-copy">
            <Copy size={15} aria-hidden />
            {t('ui.create.caption.copy')}
          </Button>
        </>
      ) : (
        <p className="cr-hint" data-testid="caption-empty">
          {t('ui.create.caption.empty')}
        </p>
      )}
    </section>
  );
}

function QueuePanel({ jobs, service, shownId, onView }: { jobs: JobRecord[]; service: CreateService; shownId: string | null; onView: (id: string | null) => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const list = jobs.slice(0, 8);
  return (
    <section className="cr-panel" data-testid="queue-panel">
      <h2 className="cr-panel-title">{t('ui.create.queue.title')}</h2>
      {list.length === 0 ? (
        <p className="cr-hint" data-testid="queue-empty">
          {t('ui.create.queue.empty')}
        </p>
      ) : (
        <ul className="cr-queue" data-testid="queue-list">
          {list.map((j) => {
            const active = ACTIVE.has(j.status);
            const cloudWaiting = j.status === 'queued' && j.target === 'cloud';
            return (
              <li key={j.id} className={`cr-job${shownId === j.id ? ' is-shown' : ''}`} data-testid="queue-item" data-status={j.status} data-pipeline={j.pipeline}>
                <div className="cr-job-head">
                  <span className="cr-job-name ellipsis" title={j.name}>
                    {j.pipeline === 'blender' ? <Cuboid size={14} aria-hidden /> : null} {j.name}
                  </span>
                  <span className={`cr-status cr-status-${j.status}`}>{cloudWaiting ? t('ui.create.queue.cloudWaiting') : t(`ui.create.jobStatus.${j.status}`)}</span>
                </div>
                {active ? (
                  <div className="cr-progress cr-progress-sm" role="progressbar" aria-valuenow={Math.round(j.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </div>
                ) : null}
                {j.status === 'failed' || j.status === 'needs_attention' ? <p className="cr-error-text">{errorText(j.errorCode)}</p> : null}
                <div className="cr-job-actions">
                  {j.status === 'done' ? (
                    <Button className="btn-sm" onClick={() => onView(j.id)} data-testid="queue-view">
                      {t('ui.create.queue.view')}
                    </Button>
                  ) : null}
                  {active ? (
                    <Button className="btn-sm" onClick={() => void service.cancel(j.id)} data-testid="queue-cancel">
                      {t('ui.create.queue.cancel')}
                    </Button>
                  ) : null}
                  {j.status === 'failed' || j.status === 'canceled' || j.status === 'needs_attention' ? (
                    <Button className="btn-sm" onClick={() => void service.retry(j.id)} data-testid="queue-retry">
                      <RotateCcw size={13} aria-hidden />
                      {t('ui.create.queue.retry')}
                    </Button>
                  ) : null}
                  {!['preparing', 'rendering', 'encoding'].includes(j.status) ? (
                    <Button variant="ghost" className="btn-sm" onClick={() => void service.remove(j.id)} data-testid="queue-remove" aria-label={`${t('ui.create.queue.remove')}: ${j.name}`}>
                      <Trash2 size={13} aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Director3D({ service, rt }: { service: CreateService; rt: RuntimeInstallState }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [glb, setGlb] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needRuntime = rt.runtime !== null && !rt.runtime.installed;

  const submit = async () => {
    setMsg(null);
    if (!glb) return setMsg(t('ui.create.d3.needModel'));
    if (!prompt.trim()) return setMsg(t('ui.create.d3.needPrompt'));
    setBusy(true);
    try {
      const res = await service.createFromPrompt({ prompt: prompt.trim(), product: { glbPath: glb } });
      toast(t('ui.create.d3.queued'));
      setMsg(t('ui.create.d3.directorNote', { source: res.director.source === 'llm' ? 'AI' : 'offline' }));
    } catch (e) {
      setMsg(translateError((k) => t(k), (e as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="cr-3d" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="d3-section">
      <summary>
        <Cuboid size={16} aria-hidden /> {t('ui.create.d3.title')}
      </summary>
      <p className="cr-hint">{t('ui.create.d3.hint')}</p>
      {needRuntime ? <RuntimeBanner state={rt} pkg="blender" message={t('ui.create.d3.needRuntime')} testId="d3-runtime-banner" buttonTestId="d3-runtime-install" compact /> : null}
      <label className="cr-field">
        <span className="cr-label">{t('ui.create.d3.prompt')}</span>
        <textarea rows={3} value={prompt} placeholder={t('ui.create.d3.placeholder')} onChange={(e) => setPrompt(e.target.value)} data-testid="d3-prompt" />
      </label>
      <div className="cr-extra-row">
        <ImageIcon size={18} aria-hidden />
        <span className="cr-hint grow ellipsis">{glb ? glb.split(/[\\/]/).pop() : t('ui.create.d3.noModel')}</span>
        <Button className="btn-sm" onClick={() => void service.pick('glb').then((p) => p && setGlb(p))} data-testid="d3-pick">
          {glb ? t('ui.create.d3.changeModel') : t('ui.create.d3.pickModel')}
        </Button>
      </div>
      <Button variant="dark" disabled={busy || needRuntime} onClick={() => void submit()} data-testid="d3-create">
        {t('ui.create.d3.create')}
      </Button>
      {msg ? (
        <p className="cr-hint" role="status" data-testid="d3-message">
          {msg}
        </p>
      ) : null}
    </details>
  );
}
