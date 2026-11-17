import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../app/router';
import { useToast } from '../../app/Toast';
import { useServices } from '../../services';
import type { ExportHandle, ExportRequest, LibraryItem } from '../../services/types';
import { Check, ChevronLeft, CircleCheck, Clock, Upload } from '../../ui/Icon';
import { Button } from '../../ui/kit';

type StepState = 'done' | 'active' | 'todo';

function Stepper({ productId, onStep }: { productId?: string; onStep: (n: number) => void }) {
  const { t } = useTranslation();
  const steps: Array<{ n: number; state: StepState }> = [
    { n: 1, state: 'done' },
    { n: 2, state: 'done' },
    { n: 3, state: 'active' },
    { n: 4, state: 'todo' },
  ];
  void productId;
  return (
    <ol className="stepper" aria-label={t('ui.studio.steps.label')} data-testid="stepper">
      {steps.map(({ n, state }) => (
        <li key={n} className={`step step-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
          <button type="button" className="step-btn" onClick={() => onStep(n)} data-testid={`step-${n}`}>
            <span className="step-dot">{state === 'done' ? <Check size={14} strokeWidth={3} /> : n}</span>
            <span className="step-label">{t(`ui.studio.steps.s${n}`)}</span>
          </button>
          {n < 4 ? <span className="step-line" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function ExportStatus({ handle }: { handle: ExportHandle }) {
  const { t } = useTranslation();
  const { library } = useServices();
  const [item, setItem] = useState<LibraryItem | null>(null);
  useEffect(() => {
    const load = () => void library.get(handle.libraryItemId).then(setItem);
    load();
    return library.subscribe(load);
  }, [library, handle.libraryItemId]);
  if (!item) return null;
  const pct = Math.round(item.progress * 100);
  return (
    <div className="export-status" data-testid="export-status" data-status={item.status} data-mode={handle.mode}>
      {item.status === 'done' ? <CircleCheck size={15} className="ok-text" /> : <Clock size={15} />}
      <span>
        {item.status === 'done' ? t('ui.studio.exportDone') : item.status === 'failed' ? t('ui.studio.exportFailed') : t('ui.library.exporting', { percent: pct })}
      </span>
      <span className="tag">{handle.mode === 'queue' ? t('ui.studio.modeQueue') : t('ui.studio.modeMock')}</span>
      <button type="button" className="link" onClick={() => navigate('/library', { item: item.id })} data-testid="view-in-library">
        {t('ui.studio.viewInLibrary')}
      </button>
    </div>
  );
}

export function StudioFrame({
  breadcrumb,
  exportLabel,
  buildRequest,
  exportDisabled,
  productId,
  children,
}: {
  breadcrumb: string;
  exportLabel: string;
  buildRequest: () => ExportRequest;
  exportDisabled?: boolean;
  productId?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { exporter } = useServices();
  const toast = useToast();
  const [handle, setHandle] = useState<ExportHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const exportedRef = useRef<ExportHandle | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      const h = await exporter.start(buildRequest());
      exportedRef.current = h;
      setHandle(h);
      toast(t('ui.studio.exportQueued'));
    } finally {
      setBusy(false);
    }
  };

  const onStep = (n: number) => {
    if (n === 1) navigate('/products', { product: productId });
    else if (n === 2) navigate('/templates', { product: productId });
    else if (n === 4) navigate('/publish', { item: exportedRef.current?.libraryItemId });
  };

  return (
    <div className="studio" data-testid="studio">
      <header className="studio-head">
        <button type="button" className="back" aria-label={t('ui.common.back')} onClick={() => window.history.back()} data-testid="studio-back">
          <ChevronLeft size={18} />
        </button>
        <div className="crumbs">
          <span className="muted">{t('ui.nav.studio')}</span>
          <span className="muted"> / </span>
          <strong data-testid="studio-title">{breadcrumb}</strong>
        </div>
        <div className="studio-actions">
          {handle ? <ExportStatus handle={handle} /> : null}
          <span className="saved" data-testid="saved-indicator">
            <CircleCheck size={15} className="ok-text" /> {t('ui.studio.saved')}
          </span>
          <Button variant="dark" className="export-btn" disabled={busy || exportDisabled} onClick={() => void start()} data-testid="export-button">
            <Upload size={15} /> {exportLabel}
          </Button>
        </div>
      </header>
      <Stepper productId={productId} onStep={onStep} />
      <div className="studio-grid">{children}</div>
    </div>
  );
}
