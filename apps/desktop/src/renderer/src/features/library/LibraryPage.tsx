import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes, type Locale } from '@aps/i18n';
import { useToast } from '../../app/Toast';
import { navigate } from '../../app/router';
import { useAsync, useDebounced } from '../../hooks';
import { useServices } from '../../services';
import type { LibraryItem, LibrarySort, LibraryTab } from '../../services/types';
import { formatClock } from '../../services/timeline';
import { ArtThumb } from '../../ui/ArtThumb';
import { ArrowUpDown, BoxIcon, CircleCheck, Clock, Download, ExternalLink, Folder, Heart, ImageIcon, LayoutGrid, List, Pencil, Play, Plus, Send } from '../../ui/Icon';
import { Button, EmptyState, IconButton, PageHeader, PanelHeader, Pagination, SearchInput, Select, Tabs } from '../../ui/kit';
import { FolderModal, MoveModal, RenameModal } from './LibraryModals';

const PAGE_SIZE = 6;
const DAY = 24 * 3_600_000;

export function resolutionLabel(item: LibraryItem): string {
  return item.kind === 'video' ? `${Math.min(item.width, item.height)}p` : `${item.width} × ${item.height}`;
}

function ItemCard({ item, selected, onSelect, onFavorite, view }: { item: LibraryItem; selected: boolean; onSelect: () => void; onFavorite: () => void; view: 'grid' | 'list' }) {
  const { t } = useTranslation();
  const exporting = item.status === 'exporting';
  const pct = Math.round(item.progress * 100);
  return (
    <article
      className={`card lib-card${selected ? ' card-selected' : ''}${view === 'list' ? ' card-row' : ''}`}
      data-testid="library-card"
      data-id={item.id}
      data-status={item.status}
      aria-selected={selected}
      onClick={onSelect}
    >
      <ArtThumb art={item.art} ratio={view === 'grid' ? '4 / 3' : '1 / 1'} className="card-art">
        {exporting ? (
          <span className="badge badge-lime" data-testid="exporting-badge">
            <Clock size={12} /> {t('ui.library.exporting', { percent: pct })}
          </span>
        ) : selected ? (
          <span className="check-dot" aria-hidden>
            <CircleCheck size={18} fill="currentColor" stroke="#fff" />
          </span>
        ) : null}
        <IconButton
          label={item.favorite ? t('ui.library.unfavorite') : t('ui.library.favorite')}
          className={`fav${item.favorite ? ' fav-on' : ''}`}
          aria-pressed={item.favorite}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
        >
          <Heart size={14} fill={item.favorite ? 'currentColor' : 'none'} />
        </IconButton>
        {item.kind === 'video' && !exporting ? (
          <>
            <span className="play-dot play-center">
              <Play size={18} fill="currentColor" />
            </span>
            <span className="duration">{formatClock(item.durationS ?? 0)}</span>
          </>
        ) : null}
        {exporting ? (
          <span className="progress progress-overlay" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} data-testid="export-progress">
            <span style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </ArtThumb>
      <div className="card-body">
        <div className="card-title with-status">
          {exporting ? <Clock size={14} className="muted" /> : <CircleCheck size={14} className="ok-text" fill="currentColor" stroke="#fff" />}
          <span className="ellipsis" title={item.name}>
            {item.name}
          </span>
        </div>
        <div className="muted small">
          {item.format} · {resolutionLabel(item)}
        </div>
      </div>
    </article>
  );
}

export function LibraryPage({ params }: { params: Record<string, string> }) {
  const { t, i18n } = useTranslation();
  const { library, products, files } = useServices();
  const toast = useToast();
  const locale = (i18n.language === 'en' ? 'en' : 'vi') as Locale;
  const [tab, setTab] = useState<LibraryTab>('all');
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState(params.product ?? '');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(params.item ?? null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [now] = useState(() => Date.now());
  const [modal, setModal] = useState<'rename' | 'move' | 'folder' | null>(null);
  const q = useDebounced(search, 120);

  const counts = useAsync(() => library.counts(), [library]);
  const folders = useAsync(() => library.folders(), [library]);
  const productList = useAsync(() => products.list({ pageSize: 100 }), [products]);
  const list = useAsync(
    () => library.list({ tab, search: q, productId: productId || undefined, folderId, sort, page, pageSize: PAGE_SIZE }),
    [library, tab, q, productId, folderId, sort, page],
  );
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selectedId = selected ?? items[0]?.id ?? null;
  const detail = useAsync(() => (selectedId && panelOpen ? library.get(selectedId) : Promise.resolve(null)), [library, selectedId, panelOpen]);
  const item = detail.data;
  const { reload: reloadCounts } = counts;
  const { reload: reloadList } = list;
  const { reload: reloadDetail } = detail;
  const { reload: reloadFolders } = folders;

  useEffect(
    () =>
      library.subscribe(() => {
        reloadCounts();
        reloadList();
        reloadDetail();
        reloadFolders();
      }),
    [library, reloadCounts, reloadList, reloadDetail, reloadFolders],
  );

  const groups = useMemo(() => {
    const cutoff = now - DAY;
    return {
      today: items.filter((i) => i.createdAt >= cutoff),
      earlier: items.filter((i) => i.createdAt < cutoff),
    };
  }, [items, now]);

  const c = counts.data;
  const tabs = [
    { id: 'all' as const, label: t('ui.library.tabAll'), count: c?.all ?? 0, icon: <LayoutGrid size={14} /> },
    { id: 'image' as const, label: t('ui.library.tabImage'), count: c?.image ?? 0, icon: <ImageIcon size={14} /> },
    { id: 'video' as const, label: t('ui.library.tabVideo'), count: c?.video ?? 0, icon: <Play size={14} /> },
    { id: 'favorite' as const, label: t('ui.library.tabFavorite'), icon: <Heart size={14} /> },
  ];

  const download = async () => {
    if (!item) return;
    const { fileName } = await files.download(item);
    toast(t('ui.library.downloadStarted', { name: fileName }));
  };

  const folderName = (id: string | null) => folders.data?.find((f) => f.id === id)?.name ?? t('ui.library.noFolder');

  const renderGroup = (title: string, list: LibraryItem[], key: string) =>
    list.length ? (
      <section key={key} className="group" data-testid={`group-${key}`}>
        <h3 className="group-title">{title}</h3>
        <div className={view === 'grid' ? 'grid cards-3' : 'rows'}>
          {list.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              view={view}
              selected={selectedId === i.id}
              onSelect={() => {
                setSelected(i.id);
                setPanelOpen(true);
              }}
              onFavorite={() => void library.toggleFavorite(i.id)}
            />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className={`page with-panel${item ? ' panel-open' : ''}`}>
      <div className="page-main">
        <PageHeader
          title={t('ui.library.title')}
          subtitle={t('ui.library.subtitle')}
          actions={
            <Button variant="dark" onClick={() => navigate('/studio')} data-testid="create-content-top">
              <Plus size={16} /> {t('ui.library.create')}
            </Button>
          }
        />
        <Tabs variant="pill" label={t('ui.library.title')} items={tabs} value={tab} onChange={(v) => {
            setTab(v);
            setPage(1);
          }} />
        <div className="toolbar">
          <SearchInput value={search} onChange={(v) => {
              setSearch(v);
              setPage(1);
            }} placeholder={t('ui.library.searchPlaceholder')} label={t('ui.library.search')} testId="library-search" />
          <Select label={t('ui.library.product')} icon={<BoxIcon size={14} />} value={productId} onChange={(e) => {
              setProductId(e.target.value);
              setPage(1);
            }} data-testid="product-filter">
            <option value="">{t('ui.library.allProducts')}</option>
            {(productList.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label={t('ui.library.sort')} icon={<ArrowUpDown size={14} />} value={sort} onChange={(e) => {
              setSort(e.target.value as LibrarySort);
              setPage(1);
            }} data-testid="sort-select">
            <option value="newest">{t('ui.library.sortNewest')}</option>
            <option value="oldest">{t('ui.library.sortOldest')}</option>
            <option value="name">{t('ui.library.sortName')}</option>
          </Select>
          <div className="view-toggle" role="group" aria-label={t('ui.common.view')}>
            <IconButton label={t('ui.common.grid')} className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              <LayoutGrid size={16} />
            </IconButton>
            <IconButton label={t('ui.common.list')} className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <List size={16} />
            </IconButton>
          </div>
        </div>
        <div className="folders" role="group" aria-label={t('ui.library.folders')} data-testid="folders">
          <button type="button" className={`folder${folderId === null ? ' folder-active' : ''}`} aria-pressed={folderId === null} onClick={() => {
              setFolderId(null);
              setPage(1);
            }} data-testid="folder-all">
            <Folder size={15} /> {t('ui.library.allContent')}
          </button>
          {(folders.data ?? []).map((f) => (
            <button key={f.id} type="button" className={`folder${folderId === f.id ? ' folder-active' : ''}`} aria-pressed={folderId === f.id} onClick={() => {
                setFolderId(f.id);
                setPage(1);
              }} data-testid="folder">
              <Folder size={15} /> {f.name}
            </button>
          ))}
          <button type="button" className="folder folder-add" onClick={() => setModal('folder')} data-testid="folder-new">
            <Plus size={15} /> {t('ui.library.newFolder')}
          </button>
        </div>

        {items.length === 0 && !list.loading ? (
          <EmptyState>{t('ui.library.empty')}</EmptyState>
        ) : (
          <div data-testid="library-list" data-view={view}>
            {renderGroup(t('ui.library.today'), groups.today, 'today')}
            {renderGroup(t('ui.library.earlier'), groups.earlier, 'earlier')}
          </div>
        )}
        <Pagination
          page={list.data?.page ?? 1}
          total={list.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          shownLabel={t('ui.library.shown', { shown: items.length, total: list.data?.total ?? 0 })}
        />
      </div>

      {item ? (
        <aside className="panel" data-testid="library-detail" aria-label={t('ui.library.detailTitle')}>
          <PanelHeader title={t('ui.library.detailTitle')} onClose={() => setPanelOpen(false)} />
          <ArtThumb art={item.art} ratio="4 / 3" className="preview-art" />
          <div className="detail-name-row">
            <h3 className="detail-name ellipsis" title={item.name} data-testid="detail-file-name">
              {item.name}
            </h3>
            <span className={`status-pill ${item.status === 'done' ? 'pill-ok' : 'pill-lime'}`} data-testid="detail-status">
              {item.status === 'done' ? <CircleCheck size={13} /> : <Clock size={13} />}
              {item.status === 'done' ? t('ui.library.statusDone') : item.status === 'failed' ? t('ui.library.statusFailed') : t('ui.library.exporting', { percent: Math.round(item.progress * 100) })}
            </span>
          </div>
          <div className="kv"><span className="kv-k"><BoxIcon size={14} /> {t('ui.library.fieldProduct')}</span><span>{item.productName}</span></div>
          <div className="kv"><span className="kv-k"><ImageIcon size={14} /> {t('ui.library.fieldFormat')}</span><span>{item.format}</span></div>
          <div className="kv"><span className="kv-k"><Clock size={14} /> {t('ui.library.fieldSize')}</span><span>{`${item.width} × ${item.height} px`}</span></div>
          <div className="kv"><span className="kv-k"><Download size={14} /> {t('ui.library.fieldBytes')}</span><span>{item.sizeBytes ? formatBytes(item.sizeBytes, locale) : '—'}</span></div>
          <div className="kv"><span className="kv-k"><Pencil size={14} /> {t('ui.library.fieldVersion')}</span><span>V{item.version}</span></div>
          <div className="kv"><span className="kv-k"><Folder size={14} /> {t('ui.library.fieldFolder')}</span><span data-testid="detail-folder">{folderName(item.folderId)}</span></div>
          <h4 className="section-title">{t('ui.library.tags')}</h4>
          <div className="chips chips-tight">
            {item.tags.length ? item.tags.map((tag) => <span key={tag} className="tag tag-lime">{tag}</span>) : <span className="muted small">{t('ui.library.noTags')}</span>}
          </div>
          <div className="panel-actions">
            <Button variant="dark" block disabled={item.status !== 'done'} onClick={() => void download()} data-testid="download">
              <Download size={15} /> {t('ui.library.download')}
            </Button>
            <Button block onClick={() => navigate('/studio', { product: item.productId, mode: item.kind })} data-testid="reopen-studio">
              <ExternalLink size={15} /> {t('ui.library.reopen')}
            </Button>
            <Button block disabled={item.status !== 'done'} onClick={() => navigate('/publish', { item: item.id })} data-testid="to-publish">
              <Send size={15} /> {t('ui.library.toPublish')}
            </Button>
            <div className="split">
              <Button variant="ghost" onClick={() => setModal('rename')} data-testid="rename">
                <Pencil size={14} /> {t('ui.library.rename')}
              </Button>
              <Button variant="ghost" onClick={() => setModal('move')} data-testid="move">
                <Folder size={14} /> {t('ui.library.move')}
              </Button>
            </div>
          </div>
        </aside>
      ) : null}

      {modal === 'rename' && item ? (
        <RenameModal
          name={item.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await library.rename(item.id, name);
            toast(t('ui.library.renamed'));
            setModal(null);
          }}
        />
      ) : null}
      {modal === 'move' && item ? (
        <MoveModal
          folders={folders.data ?? []}
          current={item.folderId}
          onClose={() => setModal(null)}
          onSubmit={async (id) => {
            await library.move(item.id, id);
            toast(t('ui.library.moved'));
            setModal(null);
          }}
        />
      ) : null}
      {modal === 'folder' ? (
        <FolderModal
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const f = await library.createFolder(name);
            setFolderId(f.id);
            setPage(1);
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}
