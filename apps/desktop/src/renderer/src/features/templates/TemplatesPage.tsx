import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../app/Toast';
import { navigate } from '../../app/router';
import { useAsync, useDebounced } from '../../hooks';
import { useServices } from '../../services';
import type { AspectRatio, Template, TemplateStyle, TemplateTab } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { ArrowRight, BoxIcon, Clock, Heart, ImageIcon, Layers, Play, Sparkles, UserRound, Video } from '../../ui/Icon';
import { Button, Chip, EmptyState, IconButton, PageHeader, PanelHeader, Pagination, SearchInput, Select, Tabs } from '../../ui/kit';

const PAGE_SIZE = 6;
const STYLES: Array<TemplateStyle | 'all'> = ['all', 'minimal', 'nature', 'luxury', 'festive', 'white'];
const ASPECTS: AspectRatio[] = ['1:1', '4:5', '16:9', '9:16'];

function KindBadge({ tpl }: { tpl: Template }) {
  const { t } = useTranslation();
  return (
    <span className="badge" data-testid="template-badge">
      {tpl.kind === 'image' ? <ImageIcon size={12} /> : <Video size={12} />}
      {tpl.kind === 'image' ? t('ui.templates.kindImage') : t('ui.templates.kindVideo', { seconds: tpl.durationS ?? 0 })}
    </span>
  );
}

export function TemplatesPage({ productId }: { productId?: string }) {
  const { t } = useTranslation();
  const { templates, products } = useServices();
  const toast = useToast();
  const [tab, setTab] = useState<TemplateTab>('all');
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [aspect, setAspect] = useState<AspectRatio | ''>('');
  const [style, setStyle] = useState<TemplateStyle | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [applyTo, setApplyTo] = useState(productId ?? '');
  const [panelOpen, setPanelOpen] = useState(true);
  const q = useDebounced(search, 120);

  const industries = useAsync(() => templates.industries(), [templates]);
  const saved = useAsync(() => templates.savedCount(), [templates]);
  const productList = useAsync(() => products.list({ pageSize: 100 }), [products]);
  const list = useAsync(
    () => templates.list({ tab, search: q, industry: industry || undefined, aspect, style, page, pageSize: PAGE_SIZE }),
    [templates, tab, q, industry, aspect, style, page],
  );
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selectedId = items.some((i) => i.id === selected) ? selected : (items[0]?.id ?? null);
  const applyToId = applyTo || productList.data?.items[0]?.id || '';

  const detail = useAsync(() => (selectedId && panelOpen ? templates.get(selectedId) : Promise.resolve(null)), [templates, selectedId, panelOpen, list.data]);
  const tpl = detail.data;
  const product = productList.data?.items.find((p) => p.id === applyToId) ?? null;

  const toggleFavorite = async (id: string) => {
    await templates.toggleFavorite(id);
    list.reload();
    detail.reload();
  };

  const toggleSaved = async () => {
    if (!tpl) return;
    await templates.setSaved(tpl.id, !tpl.saved);
    toast(tpl.saved ? t('ui.templates.unsavedToast') : t('ui.templates.savedToast'));
    list.reload();
    detail.reload();
    saved.reload();
  };

  const tabs = [
    { id: 'all' as const, label: t('ui.templates.tabAll') },
    { id: 'image' as const, label: t('ui.templates.tabImage'), icon: <ImageIcon size={14} /> },
    { id: 'video' as const, label: t('ui.templates.tabVideo'), icon: <BoxIcon size={14} /> },
    { id: 'mine' as const, label: t('ui.templates.tabMine'), icon: <UserRound size={14} /> },
  ];

  const useTemplate = () => {
    if (!tpl) return;
    navigate('/studio', { product: applyToId || undefined, template: tpl.id, mode: tpl.kind === 'video' ? 'video' : 'image' });
  };

  return (
    <div className={`page with-panel${panelOpen && tpl ? ' panel-open' : ''}`}>
      <div className="page-main">
        <PageHeader
          title={t('ui.templates.title')}
          subtitle={t('ui.templates.subtitle')}
          actions={
            <Button onClick={() => {
                setTab('mine');
                setPage(1);
              }} data-testid="saved-button">
              <Heart size={15} /> {t('ui.templates.savedButton')}
              {saved.data ? <span className="count-pill">{saved.data}</span> : null}
            </Button>
          }
        />
        <Tabs variant="pill" label={t('ui.templates.title')} items={tabs} value={tab} onChange={(v) => {
            setTab(v);
            setPage(1);
          }} />
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('ui.templates.searchPlaceholder')}
            label={t('ui.templates.search')}
            testId="template-search"
          />
          <Select label={t('ui.templates.industry')} value={industry} onChange={(e) => {
              setIndustry(e.target.value);
              setPage(1);
            }} data-testid="industry-select">
            <option value="">{t('ui.templates.allIndustries')}</option>
            {(industries.data ?? []).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select label={t('ui.templates.aspect')} value={aspect} onChange={(e) => {
              setAspect(e.target.value as AspectRatio | '');
              setPage(1);
            }} data-testid="aspect-select">
            <option value="">{t('ui.templates.allAspects')}</option>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="chips" role="group" aria-label={t('ui.templates.style')}>
          {STYLES.map((s) => (
            <Chip key={s} active={style === s} onClick={() => {
                setStyle(s);
                setPage(1);
              }} data-testid={`style-${s}`}>
              {t(`ui.templates.styles.${s}`)}
            </Chip>
          ))}
        </div>

        {items.length === 0 && !list.loading ? (
          <EmptyState>{tab === 'mine' ? t('ui.templates.emptyMine') : t('ui.templates.empty')}</EmptyState>
        ) : (
          <div className="grid cards-3" data-testid="template-list">
            {items.map((x) => (
              <article
                key={x.id}
                className={`card template-card${selectedId === x.id ? ' card-selected' : ''}`}
                data-testid="template-card"
                data-id={x.id}
                aria-selected={selectedId === x.id}
                onClick={() => {
                  setSelected(x.id);
                  setPanelOpen(true);
                }}
              >
                <ArtThumb art={x.art} ratio="5 / 4" className="card-art">
                  <KindBadge tpl={x} />
                  <IconButton
                    label={x.favorite ? t('ui.templates.unfavorite') : t('ui.templates.favorite')}
                    className={`fav${x.favorite ? ' fav-on' : ''}`}
                    aria-pressed={x.favorite}
                    data-testid="favorite"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite(x.id);
                    }}
                  >
                    <Heart size={15} fill={x.favorite ? 'currentColor' : 'none'} />
                  </IconButton>
                  {x.kind === 'video' ? (
                    <span className="play-dot play-center">
                      <Play size={18} fill="currentColor" />
                    </span>
                  ) : null}
                </ArtThumb>
                <div className="card-body">
                  <div className="card-title">{x.name}</div>
                  <span className="tag">
                    {x.industry} · {x.aspect}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pagination
          page={list.data?.page ?? 1}
          total={list.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          shownLabel={t('ui.templates.shown', { shown: items.length, total: list.data?.total ?? 0 })}
        />
      </div>

      {tpl ? (
        <aside className="panel" data-testid="template-preview" aria-label={t('ui.templates.previewTitle')}>
          <PanelHeader title={t('ui.templates.previewTitle')} onClose={() => setPanelOpen(false)} />
          <ArtThumb art={tpl.art} ratio="1 / 1" className="preview-art" />
          <h3 className="detail-name" data-testid="preview-name">
            {tpl.name}
          </h3>
          <p className="muted small">{tpl.description}</p>
          <div className="kv">
            <span className="kv-k">
              <Layers size={14} /> {t('ui.templates.contentType')}
            </span>
            <span>{tpl.kind === 'image' ? t('ui.templates.typeImage') : t('ui.templates.typeVideo')}</span>
          </div>
          <div className="kv">
            <span className="kv-k">
              <Clock size={14} /> {t('ui.templates.ratio')}
            </span>
            <span>{tpl.aspect}</span>
          </div>
          <div className="kv">
            <span className="kv-k">
              <Sparkles size={14} /> {t('ui.templates.suitable')}
            </span>
            <span className="kv-wrap">{tpl.suitableFor}</span>
          </div>
          <h4 className="section-title">{t('ui.templates.customizable')}</h4>
          <div className="chips chips-tight">
            {tpl.customizable.map((k) => (
              <span key={k} className="tag tag-outline">
                {t(`ui.templates.custom.${k}`)}
              </span>
            ))}
          </div>
          <h4 className="section-title">{t('ui.templates.applyTo')}</h4>
          <Select label={t('ui.templates.applyTo')} value={applyToId} onChange={(e) => setApplyTo(e.target.value)} data-testid="apply-product">
            {(productList.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} • {p.brand}
              </option>
            ))}
          </Select>
          {product && !product.hasModel3d && tpl.kind === 'video' ? <p className="hint warn-text">{t('ui.templates.needs3d')}</p> : null}
          <div className="panel-actions">
            <Button variant="dark" block onClick={useTemplate} data-testid="use-template">
              {t('ui.templates.use')} <ArrowRight size={15} />
            </Button>
            <Button block onClick={() => void toggleSaved()} data-testid="save-template" aria-pressed={tpl.saved}>
              <Heart size={15} fill={tpl.saved ? 'currentColor' : 'none'} /> {tpl.saved ? t('ui.templates.saved') : t('ui.templates.save')}
            </Button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
