import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MockArt } from '../../art/MockArt';
import { useToast } from '../../app/Toast';
import { useServices } from '../../services';
import { VIDEO_ASPECTS, DURATION_OPTIONS, EASINGS, SPEEDS, applyMotion, defaultTimeline, exportSize, formatClock, setDuration, toggleHidden, updateClip } from '../../services/timeline';
import type { AspectRatio, Clip, Easing, ExportRequest, MotionPreset, Product, SceneComponentId, Template, TimelineDoc } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { ArrowUp, BoxIcon, Camera, Check, Clapperboard, Eye, EyeOff, GripVertical, ImageIcon, Info, Layers, Maximize, Music, Pause, Pencil, Play, Plus, RefreshCw, Send, Settings, Sparkles, Volume2, VolumeOff } from '../../ui/Icon';
import { Select, Swatches, Toggle } from '../../ui/kit';
import { ProductPickerModal } from './ProductPickerModal';
import { StudioFrame } from './StudioFrame';
import { Timeline } from './Timeline';

const MOTIONS: Array<{ id: MotionPreset; icon: typeof BoxIcon; soon?: boolean }> = [
  { id: 'spin360', icon: RefreshCw },
  { id: 'orbit', icon: Clapperboard },
  { id: 'dollyIn', icon: Maximize },
  { id: 'lift', icon: ArrowUp, soon: true },
];

const COMPONENTS: Array<{ id: SceneComponentId; icon: typeof BoxIcon }> = [
  { id: 'product', icon: BoxIcon },
  { id: 'pedestal', icon: Layers },
  { id: 'leaves', icon: Sparkles },
  { id: 'logo', icon: ImageIcon },
];

type Quality = '1080' | '720';
const CAMERA_ANGLES = ['front', 'top', 'angle'] as const;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function VideoStudio({
  product,
  template,
  onProduct,
  modeTabs,
}: {
  product: Product;
  template: Template | null;
  onProduct: (p: Product) => void;
  modeTabs: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { director } = useServices();
  const toast = useToast();

  const [doc, setDoc] = useState<TimelineDoc>(() =>
    defaultTimeline({
      aspect: template?.kind === 'video' ? template.aspect : '16:9',
      durationS: template?.durationS ?? 15,
    }),
  );
  const [time, setTime] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>('1080');
  const [cameraAngle, setCameraAngle] = useState<(typeof CAMERA_ANGLES)[number]>('front');
  const [prompt, setPrompt] = useState('');
  const [directing, setDirecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colors, setColors] = useState(product.brandColors);
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (!playing) return;
    const speedK = 1;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const next = timeRef.current + ((now - last) / 1000) * speedK;
      last = now;
      if (next >= doc.durationS) {
        setTime(doc.durationS);
        setPlaying(false);
      } else setTime(next);
    }, 40);
    return () => clearInterval(id);
  }, [playing, doc.durationS]);

  const setAspect = (aspect: AspectRatio) => setDoc((d) => ({ ...d, aspect }));
  const clipsAt = useCallback((track: Clip['track']) => doc.clips.find((c) => c.track === track && time >= c.start && time <= c.end), [doc.clips, time]);

  const preview = useMemo(() => {
    const productClip = clipsAt('product');
    const cameraClip = clipsAt('camera');
    const logoClip = doc.clips.find((c) => c.track === 'logo');
    let spin = 0;
    if (productClip?.kind === 'spin360') spin += ((time - productClip.start) / Math.max(0.1, productClip.end - productClip.start)) * 360;
    if (cameraClip?.kind === 'orbit') spin += ((time - cameraClip.start) / Math.max(0.1, cameraClip.end - cameraClip.start)) * 120;
    let zoom = 1;
    if (cameraClip?.kind === 'dolly_in') zoom = 1 + 0.14 * clamp01((time - cameraClip.start) / Math.max(0.1, cameraClip.end - cameraClip.start));
    else if (doc.clips.some((c) => c.track === 'camera' && c.kind === 'dolly_in' && time > c.end)) zoom = 1.14;
    const logoOpacity = !logoClip ? 0 : clamp01((time - logoClip.start) / Math.max(0.1, logoClip.end - logoClip.start));
    const orbiting = cameraClip?.kind === 'orbit' || productClip?.kind === 'spin360';
    return { spin, zoom, logoOpacity, orbiting };
  }, [clipsAt, doc.clips, time]);

  const motionEase = useMemo(() => {
    const set = new Set(doc.clips.map((c) => c.ease));
    return set.size === 1 ? [...set][0]! : 'custom';
  }, [doc.clips]);

  const size = exportSize('video', doc.aspect);
  const scale = quality === '720' ? 720 / 1080 : 1;
  const hasModel = product.hasModel3d;

  const buildRequest = (): ExportRequest => ({
    kind: 'video',
    product,
    name: `${product.name}_${t(`ui.studio.motions.${doc.motion}`)}`,
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
    durationS: doc.durationS,
    lockLabel: doc.lockLabel,
    motion: doc.motion,
    scene: template?.art.scene,
  });

  const runDirector = async () => {
    if (!prompt.trim() || directing) return;
    setDirecting(true);
    try {
      const res = await director.directVideo(prompt, doc);
      setDoc(res.timeline);
      setSelectedClip(null);
      setTime(Math.min(timeRef.current, res.timeline.durationS));
      toast(t('ui.studio.director.applied'));
    } finally {
      setDirecting(false);
    }
  };

  const seek = (s: number) => {
    setPlaying(false);
    setTime(s);
  };

  const onAddColor = (hex: string) => setColors((c) => (c.includes(hex) ? c : [...c, hex].slice(0, 6)));

  return (
    <StudioFrame
      breadcrumb={t('ui.studio.videoTitle')}
      exportLabel={t('ui.studio.exportVideo')}
      buildRequest={buildRequest}
      exportDisabled={!hasModel}
      productId={product.id}
    >
      <section className="col col-left" aria-label={t('ui.studio.assets')}>
        <h2 className="col-title">{t('ui.studio.assets')}</h2>
        <div className="asset-card">
          <ArtThumb art={product.art} ratio="4 / 3" className="asset-thumb" />
        </div>
        <div className="asset-name">
          <span data-testid="studio-product-name">{product.name}</span>
          <button type="button" className="icon-btn" aria-label={t('ui.studio.changeProduct')} onClick={() => setPickerOpen(true)} data-testid="change-product">
            <Pencil size={14} />
          </button>
        </div>
        <h3 className="sub-title">
          {t('ui.studio.components')} <Info size={13} />
        </h3>
        <ul className="components" data-testid="components">
          {COMPONENTS.map(({ id, icon: Icon }) => {
            const on = !doc.hidden.includes(id);
            return (
              <li key={id} className={`component${on ? '' : ' component-off'}`} data-testid={`component-${id}`} data-visible={on}>
                <GripVertical size={14} className="grip" />
                <Icon size={14} />
                <span className="grow">{t(`ui.studio.comp.${id}`)}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t(on ? 'ui.studio.hideComponent' : 'ui.studio.showComponent', { name: t(`ui.studio.comp.${id}`) })}
                  aria-pressed={on}
                  data-testid={`toggle-${id}`}
                  onClick={() => setDoc((d) => ({ ...d, hidden: toggleHidden(d.hidden, id) }))}
                >
                  {on ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
        <h3 className="sub-title">{t('ui.studio.palette')}</h3>
        <div className="palette-row">
          <Swatches colors={colors} />
          <label className="swatch swatch-add" aria-label={t('ui.studio.addColor')}>
            <Plus size={14} />
            <input type="color" className="sr-only" onChange={(e) => onAddColor(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="col col-center" aria-label={t('ui.studio.canvas')}>
        <div className="mode-tabs-wrap">{modeTabs}</div>
        {!hasModel ? (
          <div className="notice" data-testid="no-model-notice">
            <Info size={14} /> {t('ui.studio.noModelNotice')}
          </div>
        ) : null}
        <div className="canvas-area">
          <div className="canvas-frame" style={{ ['--ar' as string]: arNumber(doc.aspect) }} data-testid="video-canvas" data-aspect={doc.aspect}>
            <div className="canvas-inner" style={{ transform: `scale(${preview.zoom})` }}>
              <MockArt art={template ? { product: product.art.product, scene: template.art.scene } : { product: product.art.product, scene: 'nature' }} hidden={doc.hidden} spin={preview.spin} camera={cameraAngle === 'angle' ? 'angle' : cameraAngle === 'top' ? 'top' : 'front'} />
            </div>
            {preview.orbiting && !doc.hidden.includes('product') ? (
              <svg className="orbit-ring" viewBox="0 0 200 100" aria-hidden>
                <ellipse cx="100" cy="50" rx="92" ry="22" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.8" />
              </svg>
            ) : null}
            {!doc.hidden.includes('logo') && preview.logoOpacity > 0 ? (
              <div className="scene-logo" style={{ opacity: preview.logoOpacity }} data-testid="scene-logo">
                {product.brand}
              </div>
            ) : null}
            <span className="chip-3d">
              <BoxIcon size={13} /> {t('ui.studio.preview3d')}
            </span>
          </div>
        </div>
        <div className="transport" data-testid="transport">
          <button type="button" className="play-btn" aria-label={playing ? t('ui.studio.pause') : t('ui.studio.play')} onClick={() => (time >= doc.durationS ? (setTime(0), setPlaying(true)) : setPlaying((p) => !p))} data-testid="play-button">
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <span className="time" data-testid="time-readout">
            {formatClock(time)} / {formatClock(doc.durationS)}
          </span>
          <button type="button" className="icon-btn" aria-label={muted ? t('ui.studio.unmute') : t('ui.studio.mute')} aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeOff size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            className="scrub"
            min={0}
            max={doc.durationS}
            step={0.1}
            value={time}
            aria-label={t('ui.studio.scrub')}
            data-testid="scrubber"
            onChange={(e) => seek(Number(e.target.value))}
          />
          <button type="button" className="icon-btn" aria-label={t('ui.studio.fullscreen')} disabled>
            <Maximize size={16} />
          </button>
          <div className="seg" role="group" aria-label={t('ui.studio.aspect')}>
            {VIDEO_ASPECTS.map((a) => (
              <button key={a} type="button" className={`seg-btn${doc.aspect === a ? ' seg-on' : ''}`} aria-pressed={doc.aspect === a} data-testid={`aspect-${a}`} onClick={() => setAspect(a)}>
                <span className={`ar-icon ar-${a.replace(':', 'x')}`} /> {a}
              </button>
            ))}
          </div>
        </div>
        <Timeline
          doc={doc}
          time={time}
          onSeek={seek}
          selectedId={selectedClip}
          onSelect={setSelectedClip}
          onUpdate={(id, patch) => setDoc((d) => updateClip(d, id, patch))}
        />
        <div className="director" data-testid="director">
          <span className="director-title">
            <Sparkles size={16} /> {t('ui.studio.director.title')}
          </span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runDirector()}
            placeholder={t('ui.studio.director.placeholderVideo')}
            aria-label={t('ui.studio.director.title')}
            data-testid="director-input"
          />
          <button type="button" className="send" aria-label={t('ui.studio.director.send')} disabled={directing || !prompt.trim()} onClick={() => void runDirector()} data-testid="director-send">
            <Send size={15} />
          </button>
        </div>
      </section>

      <section className="col col-right" aria-label={t('ui.studio.motion')}>
        <h2 className="col-title">{t('ui.studio.motion')}</h2>
        <div className="motion-grid" role="radiogroup" aria-label={t('ui.studio.motion')}>
          {MOTIONS.map(({ id, icon: Icon, soon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={doc.motion === id}
              disabled={soon}
              className={`motion${doc.motion === id ? ' motion-on' : ''}`}
              data-testid={`motion-${id}`}
              onClick={() => {
                setDoc((d) => applyMotion(d, id));
                setSelectedClip(null);
              }}
            >
              <span className="motion-icon">
                <Icon size={20} />
                {doc.motion === id ? <span className="motion-check"><Check size={11} strokeWidth={3.5} /></span> : null}
              </span>
              <span className="motion-label">{t(`ui.studio.motions.${id}`)}</span>
              {soon ? <span className="soon">{t('ui.common.soon')}</span> : null}
            </button>
          ))}
        </div>
        <label className="field-row">
          <span>{t('ui.studio.duration')}</span>
          <Select label={t('ui.studio.duration')} value={String(doc.durationS)} onChange={(e) => setDoc((d) => setDuration(d, Number(e.target.value)))} data-testid="duration-select">
            {[...new Set<number>([...DURATION_OPTIONS, doc.durationS])].sort((a, b) => a - b).map((s) => (
              <option key={s} value={s}>
                {t('ui.studio.seconds', { count: s })}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-row">
          <span>{t('ui.studio.speed')}</span>
          <Select label={t('ui.studio.speed')} value={doc.speed} onChange={(e) => setDoc((d) => ({ ...d, speed: e.target.value as TimelineDoc['speed'] }))} data-testid="speed-select">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {t(`ui.studio.speeds.${s}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-row">
          <span>{t('ui.studio.easingLabel')}</span>
          <Select
            label={t('ui.studio.easingLabel')}
            value={motionEase}
            onChange={(e) => setDoc((d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, ease: e.target.value as Easing })) }))}
            data-testid="easing-select"
          >
            {motionEase === 'custom' ? <option value="custom">{t('ui.studio.easing.custom')}</option> : null}
            {EASINGS.map((x) => (
              <option key={x} value={x}>
                {t(`ui.studio.easing.${x}`)}
              </option>
            ))}
          </Select>
        </label>
        <h3 className="sub-title with-icon">
          <Camera size={15} /> {t('ui.studio.camera')}
        </h3>
        <label className="field-row">
          <span>{t('ui.studio.cameraAngle')}</span>
          <Select label={t('ui.studio.cameraAngle')} value={cameraAngle} onChange={(e) => setCameraAngle(e.target.value as (typeof CAMERA_ANGLES)[number])} data-testid="camera-select">
            {CAMERA_ANGLES.map((a) => (
              <option key={a} value={a}>
                {t(`ui.studio.angles.${a}`)}
              </option>
            ))}
          </Select>
        </label>
        <h3 className="sub-title with-icon">
          <Music size={15} /> {t('ui.studio.audio')}
        </h3>
        <button type="button" className="btn btn-outline btn-block" disabled data-testid="add-music">
          <Plus size={15} /> {t('ui.studio.addMusic')} <span className="soon">{t('ui.common.soon')}</span>
        </button>
        <h3 className="sub-title with-icon">
          <Settings size={15} /> {t('ui.studio.quality')}
        </h3>
        <Select label={t('ui.studio.quality')} value={quality} onChange={(e) => setQuality(e.target.value as Quality)} data-testid="quality-select">
          <option value="1080">{t('ui.studio.q1080')}</option>
          <option value="720">{t('ui.studio.q720')}</option>
        </Select>
        <div className="lock-row">
          <span>
            {t('ui.studio.lockLabel')} <Info size={13} />
          </span>
          <Toggle checked={doc.lockLabel} onChange={(v) => setDoc((d) => ({ ...d, lockLabel: v }))} label={t('ui.studio.lockLabel')} testId="lock-label" />
        </div>
      </section>
      {pickerOpen ? (
        <ProductPickerModal
          currentId={product.id}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => {
            onProduct(p);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </StudioFrame>
  );
}

function arNumber(a: AspectRatio): number {
  const [w, h] = a.split(':').map(Number) as [number, number];
  return w / h;
}

