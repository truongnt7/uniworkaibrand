import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Product, ProductDraft } from '../../services/types';
import { Button, Modal } from '../../ui/kit';

export function ProductFormModal({
  product,
  categories,
  onSubmit,
  onClose,
}: {
  product: Product | null;
  categories: string[];
  onSubmit: (draft: ProductDraft) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [brand, setBrand] = useState(product?.brand ?? 'BOTANIC');
  const [category, setCategory] = useState(product?.category ?? categories[0] ?? '');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && sku.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), sku: sku.trim(), brand: brand.trim(), category: category.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={product ? t('ui.products.editTitle') : t('ui.products.addTitle')}
      onClose={onClose}
      testId="product-form-modal"
      footer={
        <>
          <Button onClick={onClose}>{t('ui.common.cancel')}</Button>
          <Button variant="dark" disabled={!valid || busy} form="product-form" type="submit" data-testid="product-form-submit">
            {product ? t('ui.common.save') : t('ui.products.create')}
          </Button>
        </>
      }
    >
      <form id="product-form" className="form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>{t('ui.products.fieldName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="product-name" autoFocus />
        </label>
        <div className="form-row">
          <label className="field">
            <span>{t('ui.products.fieldSku')}</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} data-testid="product-sku" />
          </label>
          <label className="field">
            <span>{t('ui.products.fieldBrand')}</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>{t('ui.products.fieldCategory')}</span>
          <input list="product-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="product-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <p className="muted small">{t('ui.products.addHint')}</p>
      </form>
    </Modal>
  );
}
