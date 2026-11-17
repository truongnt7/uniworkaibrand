import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MockArt } from '../../art/MockArt';
import { useToast } from '../../app/Toast';
import { useServices } from '../../services';
import { IMAGE_ASPECTS, defaultImageScene, exportSize } from '../../services/timeline';
import type { AspectRatio, ArtScene, ExportRequest, ImageScene, Product, Template } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { BoxIcon, Camera, Eye, ImageIcon, Info, Pencil, Plus, Redo2, Send, Sparkles, Undo2, Upload, X, ZoomIn, ZoomOut } from '../../ui/Icon';
import { Select, Swatches, Toggle } from '../../ui/kit';
import { ProductPickerModal } from './ProductPickerModal';
import { StudioFrame } from './StudioFrame';
import { useHistory } from './useHistory';

const UNIT_MM = 'mm';
const PRESETS: ImageScene['preset'][] = ['studio', 'nature', 'minimal', 'luxury'];
const BACKGROUNDS = [
  { id: 'sage', color: '#b9c9a5' },
  { id: 'cream', color: '#f5efe2' },
  { id: 'white', color: '#ffffff' },
  { id: 'sand', color: '#ecd3b5' },
] as const;
const LIGHTS: ImageScene['light'][] = ['natural', 'soft', 'dramatic'];
const CAMERAS: ImageScene['camera'][] = ['front', 'angle', 'top'];
const ZOOMS = [75, 100, 125, 150];
const PRESET_BG: Record<ImageScene['preset'], string> = { studio: '#e7e4dd', nature: '#b9c9a5', minimal: '#f5efe2', luxury: '#ecd3b5' };

function sceneFromTemplate(template: Template | null): ImageScene {
  const base = defaultImageScene();
  if (!template || template.kind !== 'image') return base;
  const map: Partial<Record<ArtScene, ImageScene['preset']>> = { nature: 'nature', studio: 'studio', minimal: 'minimal', luxury: 'luxury', white: 'studio' };
  const preset = map[template.art.scene] ?? 'nature';
  return { ...base, preset, backgroundColor: PRESET_BG[preset], aspect: (['1:1', '4:5', '16:9'] as AspectRatio[]).includes(template.aspect) ? template.aspect : '1:1' };
}

export function ImageStudio({
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
  const history = useHistory<ImageScene>(sceneFromTemplate(template));
  const scene = history.value;
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ideaIdx, setIdeaIdx] = useState(0);
  const [size, setSize] = useState({ width: product.sizeMm.width, height: product.sizeMm.height });
  const [colors, setColors] = useState(product.brandColors);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<ImageScene>, key?: string) => history.set({ ...scene, ...p }, key);
  const scenePreset = (preset: ImageScene['preset']) => patch({ preset, backgroundColor: PRESET_BG[preset] });
  const art = { product: product.art.product, scene: scene.preset as ArtScene };
  const bgId = BACKGROUNDS.find((b) => b.color === scene.backgroundColor)?.id ?? 'custom';
  const out = exportSize('image', scene.aspect);

  const buildRequest = (): ExportRequest => ({
    kind: 'image',
    product,
    name: `${product.name}_${t(`ui.studio.presets.${scene.preset}`)}`,
    width: out.width,
    height: out.height,
    durationS: null,
    lockLabel: scene.lockLabel,
    scene: scene.preset,
  });

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const res = await director.directImage(prompt, scene);
      history.set(res.scene);
      toast(t('ui.studio.director.applied'));
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    const ideas = await director.suggestIdeas();
    setPrompt(ideas[ideaIdx % ideas.length] ?? '');
    setIdeaIdx((i) => i + 1);
  };

  const cyclePreset = () => scenePreset(PRESETS[(PRESETS.indexOf(scene.preset) + 1) % PRESETS.length]!);
  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(scene.zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))]!;
    patch({ zoom: next });
  };
  const ar = (() => {
    const [w, h] = scene.aspect.split(':').map(Number) as [number, number];
    return w / h;
  })();

  return (
    <StudioFrame breadcrumb={t('ui.studio.imageTitle')} exportLabel={t('ui.studio.exportImage')} buildRequest={buildRequest} productId={product.id}>
      <section className="col col-left" aria-label={t('ui.studio.yourProduct')}>
        <h2 className="col-title">{t('ui.studio.yourProduct')}</h2>
        <button type="button" className="dropzone" onClick={() => fileRef.current?.click()} data-testid="upload-zone">
          <Upload size={20} />
          <span>{t('ui.studio.upload')}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,.glb"
          data-testid="upload-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setUploaded(f.name);
              toast(t('ui.studio.uploaded', { name: f.name }));
            }
          }}
        />
        {uploaded ? <p className="muted small ellipsis">{uploaded}</p> : null}
        <div className="asset-card">
          <ArtThumb art={product.art} ratio="4 / 3" className="asset-thumb" />
          <button type="button" className="close-dot" aria-label={t('ui.common.close')} onClick={() => setPickerOpen(true)}>
            <X size={12} />
          </button>
        </div>
        <div className="asset-name">
          <span data-testid="studio-product-name">{product.name}</span>
          <button type="button" className="icon-btn" aria-label={t('ui.studio.changeProduct')} onClick={() => setPickerOpen(true)} data-testid="change-product">
            <Pencil size={14} />
          </button>
        </div>
        <h3 className="sub-title">
          {t('ui.studio.productSize')} <Info size={13} />
        </h3>
        <label className="size-row">
          <span>{t('ui.studio.width')}</span>
          <input type="number" min={1} value={size.width} data-testid="size-width" onChange={(e) => setSize((s) => ({ ...s, width: Number(e.target.value) }))} />
          <span className="unit">{UNIT_MM}</span>
        </label>
        <label className="size-row">
          <span>{t('ui.studio.height')}</span>
          <input type="number" min={1} value={size.height} data-testid="size-height" onChange={(e) => setSize((s) => ({ ...s, height: Number(e.target.value) }))} />
          <span className="unit">{UNIT_MM}</span>
        </label>
        <h3 className="sub-title">{t('ui.studio.brandAssets')}</h3>
        <div className="muted small">{t('ui.studio.logo')}</div>
        <div className="logo-box">
          <span className="logo-text">{product.brand}</span>
          <Upload size={14} />
        </div>
        <div className="muted small">{t('ui.studio.brandColors')}</div>
        <div className="palette-row">
          <Swatches colors={colors} />
          <label className="swatch swatch-add" aria-label={t('ui.studio.addColor')}>
            <Plus size={14} />
            <input type="color" className="sr-only" onChange={(e) => setColors((c) => (c.includes(e.target.value) ? c : [...c, e.target.value].slice(0, 6)))} />
          </label>
        </div>
      </section>

      <section className="col col-center" aria-label={t('ui.studio.canvas')}>
        <div className="mode-tabs-wrap">{modeTabs}</div>
        <div className="canvas-area">
          <div className="canvas-frame" style={{ ['--ar' as string]: ar }} data-testid="image-canvas" data-aspect={scene.aspect} data-preset={scene.preset} data-zoom={scene.zoom}>
            <div className="canvas-inner" style={{ transform: `scale(${scene.zoom / 100})` }}>
              <MockArt art={art} tint={scene.backgroundColor} shadow={scene.shadow} light={scene.light} camera={scene.camera} hidden={scene.hidden} />
            </div>
            <button type="button" className="chip-3d" aria-pressed={previewing} onClick={() => setPreviewing((p) => !p)} data-testid="preview-toggle">
              <Eye size={13} /> {t('ui.studio.preview')}
            </button>
          </div>
        </div>
        <div className="canvas-tools">
          <div className="seg" role="group" aria-label={t('ui.studio.aspect')}>
            {IMAGE_ASPECTS.map((a) => (
              <button key={a} type="button" className={`seg-btn${scene.aspect === a ? ' seg-on' : ''}`} aria-pressed={scene.aspect === a} data-testid={`aspect-${a}`} onClick={() => patch({ aspect: a })}>
                <span className={`ar-icon ar-${a.replace(':', 'x')}`} /> {a}
              </button>
            ))}
          </div>
          <div className="zoom">
            <button type="button" className="icon-btn" aria-label={t('ui.studio.zoomOut')} onClick={() => zoomStep(-1)} data-testid="zoom-out">
              <ZoomOut size={16} />
            </button>
            <span className="zoom-value" data-testid="zoom-value">
              {scene.zoom}%
            </span>
            <button type="button" className="icon-btn" aria-label={t('ui.studio.zoomIn')} onClick={() => zoomStep(1)} data-testid="zoom-in">
              <ZoomIn size={16} />
            </button>
          </div>
          <div className="zoom">
            <button type="button" className="icon-btn" aria-label={t('ui.studio.undo')} disabled={!history.canUndo} onClick={history.undo} data-testid="undo">
              <Undo2 size={16} />
            </button>
            <button type="button" className="icon-btn" aria-label={t('ui.studio.redo')} disabled={!history.canRedo} onClick={history.redo} data-testid="redo">
              <Redo2 size={16} />
            </button>
          </div>
        </div>
        <div className="ask" data-testid="director">
          <div className="ask-title">
            <Sparkles size={15} /> {t('ui.studio.ask.title')}
          </div>
          <div className="ask-input">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void run()}
              placeholder={t('ui.studio.ask.placeholder')}
              aria-label={t('ui.studio.ask.title')}
              data-testid="director-input"
            />
            <button type="button" className="send" aria-label={t('ui.studio.director.send')} disabled={busy || !prompt.trim()} onClick={() => void run()} data-testid="director-send">
              <Send size={15} />
            </button>
          </div>
          <div className="chips chips-tight">
            <button type="button" className="chip" onClick={cyclePreset} data-testid="chip-scene">
              <ImageIcon size={14} /> {t('ui.studio.ask.changeScene')}
            </button>
            <button type="button" className="chip" disabled data-testid="chip-props">
              <BoxIcon size={14} /> {t('ui.studio.ask.addProps')} <span className="soon">{t('ui.common.soon')}</span>
            </button>
            <button type="button" className="chip" onClick={() => void suggest()} data-testid="chip-ideas">
              <Sparkles size={14} /> {t('ui.studio.ask.ideas')}
            </button>
          </div>
        </div>
      </section>

      <section className="col col-right" aria-label={t('ui.studio.sceneOptions')}>
        <h2 className="col-title">{t('ui.studio.sceneOptions')}</h2>
        <div className="preset-grid" role="radiogroup" aria-label={t('ui.studio.sceneOptions')}>
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={scene.preset === p} className={`preset${scene.preset === p ? ' preset-on' : ''}`} data-testid={`preset-${p}`} onClick={() => scenePreset(p)}>
              <ArtThumb art={{ product: product.art.product, scene: p as ArtScene }} ratio="3 / 4" />
              <span>{t(`ui.studio.presets.${p}`)}</span>
            </button>
          ))}
        </div>
        <label className="field-col">
          <span>{t('ui.studio.bgColor')}</span>
          <div className="select-swatch">
            <span className="swatch" style={{ background: scene.backgroundColor }} />
            <Select label={t('ui.studio.bgColor')} value={bgId} onChange={(e) => patch({ backgroundColor: BACKGROUNDS.find((b) => b.id === e.target.value)?.color ?? scene.backgroundColor })} data-testid="bg-select">
              {bgId === 'custom' ? <option value="custom">{t('ui.studio.bg.custom')}</option> : null}
              {BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {t(`ui.studio.bg.${b.id}`)}
                </option>
              ))}
            </Select>
          </div>
        </label>
        <label className="field-col">
          <span>{t('ui.studio.light')}</span>
          <Select label={t('ui.studio.light')} value={scene.light} onChange={(e) => patch({ light: e.target.value as ImageScene['light'] })} data-testid="light-select">
            {LIGHTS.map((l) => (
              <option key={l} value={l}>
                {t(`ui.studio.lights.${l}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-col">
          <span>{t('ui.studio.cameraAngle')}</span>
          <Select label={t('ui.studio.cameraAngle')} icon={<Camera size={14} />} value={scene.camera} onChange={(e) => patch({ camera: e.target.value as ImageScene['camera'] })} data-testid="camera-select">
            {CAMERAS.map((c) => (
              <option key={c} value={c}>
                {t(`ui.studio.angles.${c}`)}
              </option>
            ))}
          </Select>
        </label>
        <div className="field-col">
          <div className="slider-head">
            <span>{t('ui.studio.shadow')}</span>
            <span data-testid="shadow-value">{Math.round(scene.shadow * 100)}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min={0}
            max={100}
            value={Math.round(scene.shadow * 100)}
            aria-label={t('ui.studio.shadow')}
            data-testid="shadow-slider"
            onChange={(e) => patch({ shadow: Number(e.target.value) / 100 }, 'shadow')}
          />
        </div>
        <div className="lock-row">
          <span>
            {t('ui.studio.lockLabel')} <Info size={13} />
          </span>
          <Toggle checked={scene.lockLabel} onChange={(v) => patch({ lockLabel: v })} label={t('ui.studio.lockLabel')} testId="lock-label" />
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
