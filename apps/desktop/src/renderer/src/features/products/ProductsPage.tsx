import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../app/Toast';
import { navigate } from '../../app/router';
import { useAsync, useDebounced } from '../../hooks';
import { useServices } from '../../services';
import type { Product, ProductDraft, ProductFilter } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { ArrowRight, BoxIcon, CircleCheck, ImageIcon, LayoutGrid, List, Plus } from '../../ui/Icon';
import { Button, EmptyState, IconButton, PageHeader, Pagination, SearchInput, Select, Tabs } from '../../ui/kit';
import { ProductDetail } from './ProductDetail';
import { ProductFormModal } from './ProductFormModal';

const PAGE_SIZE = 6;

function ProductBadge({ product }: { product: Product }) {
  const { t } = useTranslation();
  return (
    <span className="badge" data-testid="product-badge">
      {product.hasModel3d ? <BoxIcon size={12} /> : <ImageIcon size={12} />}
      {product.hasModel3d ? t('ui.products.badge3d') : t('ui.products.badgeImage')}
    </span>
  );
}

export function ProductsPage({ initialSelectedId }: { initialSelectedId?: string }) {
  const { t } = useTranslation();
  const { products } = useServices();
  const toast = useToast();
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const q = useDebounced(search, 120);

  const counts = useAsync(() => products.counts(), [products]);
  const facets = useAsync(() => products.facets(), [products]);
  const list = useAsync(
    () => products.list({ filter, search: q, category: category || undefined, brand: brand || undefined, page, pageSize: PAGE_SIZE }),
    [products, filter, q, category, brand, page],
  );
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selectedId = selected ?? items[0]?.id ?? null;

  const detail = useAsync(() => (selectedId ? products.get(selectedId) : Promise.resolve(null)), [products, selectedId, counts.data]);
  const product = detail.data;

  const refresh = () => {
    counts.reload();
    list.reload();
    facets.reload();
    detail.reload();
  };

  const submit = async (draft: ProductDraft) => {
    if (modal === 'edit' && product) {
      await products.update(product.id, draft);
      toast(t('ui.products.updated'));
    } else {
      const created = await products.create(draft);
      setSelected(created.id);
      setPanelOpen(true);
      toast(t('ui.products.created'));
    }
    setModal(null);
    refresh();
  };

  const c = counts.data;
  const tabs = [
    { id: 'all' as const, label: t('ui.products.tabAll'), count: c?.all ?? 0 },
    { id: 'model3d' as const, label: t('ui.products.tab3d'), count: c?.model3d ?? 0 },
    { id: 'imageOnly' as const, label: t('ui.products.tabImage'), count: c?.imageOnly ?? 0 },
  ];

  return (
    <div className={`page with-panel${panelOpen && product ? ' panel-open' : ''}`}>
      <div className="page-main">
        <PageHeader
          title={t('ui.products.title')}
          subtitle={t('ui.products.subtitle')}
          actions={
            <Button variant="dark" onClick={() => setModal('add')} data-testid="add-product">
              <Plus size={16} /> {t('ui.products.add')}
            </Button>
          }
        />
        <Tabs variant="underline" label={t('ui.products.title')} items={tabs} value={filter} onChange={(f) => { setFilter(f); setPage(1); }} />
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('ui.products.searchPlaceholder')}
            label={t('ui.products.search')}
            testId="product-search"
          />
          <Select label={t('ui.products.category')} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} data-testid="category-select">
            <option value="">{t('ui.products.allCategories')}</option>
            {(facets.data?.categories ?? []).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select label={t('ui.products.brand')} value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} data-testid="brand-select">
            <option value="">{t('ui.products.allBrands')}</option>
            {(facets.data?.brands ?? []).map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <div className="view-toggle" role="group" aria-label={t('ui.common.view')}>
            <IconButton label={t('ui.common.grid')} className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')} data-testid="view-grid">
              <LayoutGrid size={16} />
            </IconButton>
            <IconButton label={t('ui.common.list')} className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')} data-testid="view-list">
              <List size={16} />
            </IconButton>
          </div>
        </div>

        {items.length === 0 && !list.loading ? (
          <EmptyState>{t('ui.products.empty')}</EmptyState>
        ) : (
          <div className={view === 'grid' ? 'grid cards-3' : 'rows'} data-testid="product-list" data-view={view}>
            {items.map((p) => (
              <article
                key={p.id}
                className={`card product-card${selectedId === p.id ? ' card-selected' : ''}${view === 'list' ? ' card-row' : ''}`}
                data-testid="product-card"
                data-id={p.id}
                aria-selected={selectedId === p.id}
                onClick={() => {
                  setSelected(p.id);
                  setPanelOpen(true);
                }}
              >
                <ArtThumb art={p.art} ratio={view === 'grid' ? '4 / 3' : '1 / 1'} className="card-art">
                  <ProductBadge product={p} />
                  {selectedId === p.id ? (
                    <span className="check-dot" aria-hidden>
                      <CircleCheck size={18} fill="currentColor" stroke="#fff" />
                    </span>
                  ) : null}
                </ArtThumb>
                <div className="card-body">
                  <div className="card-title">{p.name}</div>
                  <div className="muted small">
                    {t('ui.products.sku')}: {p.sku}
                  </div>
                </div>
                <Button
                  className="card-cta"
                  data-testid="create-content"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/studio', { product: p.id });
                  }}
                >
                  <span>{t('ui.products.createContent')}</span>
                  <ArrowRight size={14} />
                </Button>
              </article>
            ))}
          </div>
        )}
        <Pagination
          page={list.data?.page ?? 1}
          total={list.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          shownLabel={t('ui.products.shown', { shown: items.length, total: list.data?.total ?? 0 })}
        />
      </div>
      {panelOpen && product ? (
        <ProductDetail product={product} onClose={() => setPanelOpen(false)} onEdit={() => setModal('edit')} />
      ) : null}
      {modal ? (
        <ProductFormModal
          product={modal === 'edit' ? product : null}
          categories={facets.data?.categories ?? []}
          onSubmit={submit}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}
