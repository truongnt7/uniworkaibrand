import { useTranslation } from 'react-i18next';
import { navigate, type RoutePath } from '../../app/router';
import { useAsync } from '../../hooks';
import { useServices } from '../../services';
import { ArrowRight, ImageIcon, Layers, Package, Send, Sparkles } from '../../ui/Icon';
import { PageHeader } from '../../ui/kit';

/** Placeholder: dashboard chưa có trong thiết kế (xem plan mục 1.4), chỉ có số liệu nhanh và lối tắt. */
export function OverviewPage() {
  const { t } = useTranslation();
  const { products, library, workspaces } = useServices();
  const user = useAsync(() => workspaces.user(), [workspaces]);
  const pc = useAsync(() => products.counts(), [products]);
  const lc = useAsync(() => library.counts(), [library]);

  const stats: Array<{ key: string; value: number | undefined; to: RoutePath; icon: typeof Package }> = [
    { key: 'products', value: pc.data?.all, to: '/products', icon: Package },
    { key: 'images', value: lc.data?.image, to: '/library', icon: ImageIcon },
    { key: 'videos', value: lc.data?.video, to: '/library', icon: Sparkles },
  ];
  const shortcuts: Array<{ key: string; to: RoutePath; icon: typeof Package }> = [
    { key: 'studio', to: '/studio', icon: Sparkles },
    { key: 'templates', to: '/templates', icon: Layers },
    { key: 'publish', to: '/publish', icon: Send },
  ];

  return (
    <div className="page" data-testid="overview">
      <div className="page-main">
        <PageHeader title={t('ui.overview.title', { name: user.data?.name ?? '' })} subtitle={t('ui.overview.subtitle')} />
        <div className="grid cards-3">
          {stats.map((s) => (
            <button key={s.key} type="button" className="card stat" onClick={() => navigate(s.to)}>
              <s.icon size={20} />
              <span className="stat-value">{s.value ?? '–'}</span>
              <span className="muted">{t(`ui.overview.stats.${s.key}`)}</span>
            </button>
          ))}
        </div>
        <h3 className="group-title">{t('ui.overview.shortcuts')}</h3>
        <div className="grid cards-3">
          {shortcuts.map((s) => (
            <button key={s.key} type="button" className="card shortcut" onClick={() => navigate(s.to)}>
              <s.icon size={18} />
              <span className="grow">{t(`ui.nav.${s.key}`)}</span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
        <p className="note">{t('ui.overview.placeholder')}</p>
      </div>
    </div>
  );
}
