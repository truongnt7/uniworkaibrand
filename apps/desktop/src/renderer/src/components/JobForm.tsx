import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateError } from '@aps/i18n';
import type { RenderRequestInput } from '@aps/shared';
import { invoke } from '../api';

const RESOLUTIONS = ['640x360', '960x540', '1280x720', '1920x1080', '1080x1920'] as const;

function fileName(p: string | null): string | null {
  return p ? (p.split(/[\\/]/).pop() ?? p) : null;
}

export function JobForm({ runtimeReady }: { runtimeReady: boolean }) {
  const { t } = useTranslation();
  const [name, setName] = useState('Serum Aura');
  const [glb, setGlb] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [labelWidth, setLabelWidth] = useState('94');
  const [labelHeight, setLabelHeight] = useState('60');
  const [labelBottom, setLabelBottom] = useState('20');
  const [productHeight, setProductHeight] = useState('146');
  const [kind, setKind] = useState<'image' | 'video'>('video');
  const [motion, setMotion] = useState<'orbit' | 'spin360'>('orbit');
  const [duration, setDuration] = useState('4');
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>('960x540');
  const [engine, setEngine] = useState<'eevee' | 'cycles'>('cycles');
  const [samples, setSamples] = useState('16');
  const [error, setError] = useState<string | null>(null);

  const pick = async (what: 'glb' | 'image') => {
    const { path } = await invoke('dialog:pickFile', { kind: what });
    if (path) (what === 'glb' ? setGlb : setLabel)(path);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!glb) return setError('GLB_NOT_FOUND');
    if (!runtimeReady) return setError('RUNTIME_MISSING');
    const [w, h] = resolution.split('x').map(Number) as [number, number];
    const request: RenderRequestInput = {
      name,
      target: 'local',
      product: {
        glbPath: glb,
        sizeMm: { width: 60, depth: 60, height: Number(productHeight) },
        ...(label
          ? { label: { imagePath: label, mode: 'cylinder', widthMm: Number(labelWidth), heightMm: Number(labelHeight), bottomMm: Number(labelBottom) } }
          : {}),
      },
      output: { kind, motion, width: w, height: h, durationS: Number(duration), fps: 24, engine, samples: Number(samples), device: 'auto' },
    };
    try {
      await invoke('jobs:create', request);
    } catch (err) {
      setError((err as { code?: string }).code ?? 'UNKNOWN');
    }
  };

  return (
    <form className="card" onSubmit={(e) => void submit(e)} data-testid="job-form">
      <h2>{t('job.newTitle')}</h2>
      <label className="field">
        <span>{t('job.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>{t('job.glb')}</span>
        <div className="row">
          <button type="button" className="secondary" onClick={() => void pick('glb')} data-testid="pick-glb">
            {t('job.choose')}
          </button>
          <span className="muted" data-testid="glb-name">{fileName(glb) ?? t('job.noFile')}</span>
        </div>
      </div>
      <div className="field">
        <span>{t('job.label')}</span>
        <div className="row">
          <button type="button" className="secondary" onClick={() => void pick('image')} data-testid="pick-label">
            {t('job.choose')}
          </button>
          <span className="muted">{fileName(label) ?? t('job.noFile')}</span>
        </div>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>{t('job.labelWidth')}</span>
          <input type="number" value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('job.labelHeight')}</span>
          <input type="number" value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('job.labelBottom')}</span>
          <input type="number" value={labelBottom} onChange={(e) => setLabelBottom(e.target.value)} />
        </label>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>{t('job.productHeight')}</span>
          <input type="number" value={productHeight} onChange={(e) => setProductHeight(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('job.kind')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'image' | 'video')} data-testid="kind">
            <option value="video">{t('job.kindVideo')}</option>
            <option value="image">{t('job.kindImage')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('job.motion')}</span>
          <select value={motion} onChange={(e) => setMotion(e.target.value as 'orbit' | 'spin360')} disabled={kind === 'image'}>
            <option value="orbit">{t('job.motionOrbit')}</option>
            <option value="spin360">{t('job.motionSpin')}</option>
          </select>
        </label>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>{t('job.duration')}</span>
          <input type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={kind === 'image'} data-testid="duration" />
        </label>
        <label className="field">
          <span>{t('job.resolution')}</span>
          <select value={resolution} onChange={(e) => setResolution(e.target.value as (typeof RESOLUTIONS)[number])} data-testid="resolution">
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('job.engine')}</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value as 'eevee' | 'cycles')} data-testid="engine">
            <option value="eevee">EEVEE</option>
            <option value="cycles">Cycles</option>
          </select>
        </label>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>{t('job.samples')}</span>
          <input type="number" min={1} value={samples} onChange={(e) => setSamples(e.target.value)} data-testid="samples" />
        </label>
        <label className="field">
          <span>{t('job.target')}</span>
          <select value="local" disabled>
            <option value="local">{t('job.targetLocal')}</option>
            <option value="cloud">{t('job.targetCloud')}</option>
          </select>
        </label>
      </div>
      {error && <p className="error" data-testid="form-error">{translateError(t, error)}</p>}
      {!runtimeReady && <p className="warn">{t('job.needRuntime')}</p>}
      <div className="actions">
        <button type="submit" disabled={!runtimeReady} data-testid="create-job">
          {t('job.create')}
        </button>
      </div>
    </form>
  );
}
