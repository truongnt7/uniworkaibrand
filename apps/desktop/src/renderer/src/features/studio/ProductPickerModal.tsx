import { useTranslation } from 'react-i18next';
import { useAsync } from '../../hooks';
import { useServices } from '../../services';
import type { Product } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { Modal } from '../../ui/kit';

export function ProductPickerModal({ currentId, onPick, onClose }: { currentId: string; onPick: (p: Product) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { products } = useServices();
  const list = useAsync(() => products.list({ pageSize: 100 }), [products]);
  return (
    <Modal title={t('ui.studio.pickProduct')} onClose={onClose} testId="product-picker">
      <ul className="picker">
        {(list.data?.items ?? []).map((p) => (
          <li key={p.id}>
            <button type="button" className={`picker-item${p.id === currentId ? ' picker-active' : ''}`} onClick={() => onPick(p)} data-testid="picker-item" data-id={p.id}>
              <ArtThumb art={p.art} className="picker-thumb" />
              <span>
                <strong>{p.name}</strong>
                <span className="muted small"> {p.sku} · {p.hasModel3d ? t('ui.products.badge3d') : t('ui.products.badgeImage')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
