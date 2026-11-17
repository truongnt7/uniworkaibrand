import { useTranslation } from 'react-i18next';
import { navigate } from '../../app/router';
import type { Product } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { BoxIcon, ChevronRight, CircleCheck, ImageIcon, Pencil, ExternalLink, Play, Info } from '../../ui/Icon';
import { Button, PanelHeader, Swatches } from '../../ui/kit';

function ResourceRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="res-row">
      {icon}
      <span>{label}</span>
      <span className="res-value">{value}</span>
      <ChevronRight size={14} />
    </div>
  );
}

export function ProductDetail({ product, onClose, onEdit }: { product: Product; onClose: () => void; onEdit: () => void }) {
  const { t } = useTranslation();
  const none = t('ui.products.none');
  return (
    <aside className="panel" data-testid="product-detail" aria-label={t('ui.products.detailTitle')}>
      <PanelHeader title={t('ui.products.detailTitle')} onClose={onClose} />
      <div className="detail-top">
        <ArtThumb art={product.art} className="detail-thumb" />
        <div>
          <div className={`status ${product.hasModel3d ? 'status-ok' : 'status-warn'}`} data-testid="detail-status">
            {product.hasModel3d ? <CircleCheck size={14} /> : <Info size={14} />}
            <span>{product.hasModel3d ? t('ui.products.model3dReady') : t('ui.products.imageOnlyNote')}</span>
          </div>
          <h3 className="detail-name" data-testid="detail-name">
            {product.name}
          </h3>
          <p className="muted small">
            {product.brand} · {product.sku}
          </p>
        </div>
      </div>
      <h4 className="section-title">{t('ui.products.resources')}</h4>
      <div className="res-list">
        <ResourceRow icon={<ImageIcon size={15} />} label={t('ui.products.photos')} value={t('ui.products.photoCount', { count: product.imageCount })} />
        <ResourceRow icon={<BoxIcon size={15} />} label={t('ui.products.model3d')} value={product.modelFile ?? none} />
        <ResourceRow icon={<Pencil size={15} />} label={t('ui.products.label')} value={product.labelFile ?? none} />
      </div>
      <div className="kv">
        <span className="kv-k">
          <BoxIcon size={14} /> {t('ui.products.size')}
        </span>
        <span data-testid="detail-size">{`${product.sizeMm.width} × ${product.sizeMm.depth} × ${product.sizeMm.height} mm`}</span>
      </div>
      <div className="kv kv-top">
        <span className="kv-k">{t('ui.products.brandColors')}</span>
        <Swatches colors={product.brandColors} />
      </div>
      <h4 className="section-title">{t('ui.products.createdContent')}</h4>
      <div className="content-tiles">
        <button type="button" className="tile" onClick={() => navigate('/library', { product: product.id })}>
          <ArtThumb art={product.art} ratio="4 / 3" />
          <span className="tile-label">
            <ImageIcon size={13} /> {t('ui.products.imagesCount', { count: product.createdImages })}
          </span>
        </button>
        <button type="button" className="tile" onClick={() => navigate('/library', { product: product.id })}>
          <ArtThumb art={{ product: product.art.product, scene: 'luxury' }} ratio="4 / 3">
            <span className="play-dot">
              <Play size={14} fill="currentColor" />
            </span>
          </ArtThumb>
          <span className="tile-label">
            <BoxIcon size={13} /> {t('ui.products.videosCount', { count: product.createdVideos })}
          </span>
        </button>
      </div>
      <div className="panel-actions">
        <Button variant="dark" block onClick={() => navigate('/studio', { product: product.id })} data-testid="open-in-studio">
          <ExternalLink size={15} /> {t('ui.products.openInStudio')}
        </Button>
        <Button block onClick={onEdit} data-testid="edit-product">
          <Pencil size={15} /> {t('ui.products.edit')}
        </Button>
      </div>
    </aside>
  );
}
