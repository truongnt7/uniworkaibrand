import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../app/router';
import { useAsync } from '../../hooks';
import { useServices } from '../../services';
import type { Product } from '../../services/types';
import { BoxIcon, ImageIcon } from '../../ui/Icon';
import { ImageStudio } from './ImageStudio';
import { VideoStudio } from './VideoStudio';

type Mode = 'image' | 'video';

export function StudioPage({ params }: { params: Record<string, string> }) {
  // Đổi sản phẩm/mẫu/chế độ qua URL sẽ dựng lại Studio với trạng thái mới.
  const key = `${params.product ?? ''}|${params.template ?? ''}|${params.mode ?? ''}`;
  return <StudioLoader key={key} params={params} />;
}

function StudioLoader({ params }: { params: Record<string, string> }) {
  const { t } = useTranslation();
  const { products, templates } = useServices();
  const [mode, setMode] = useState<Mode>(params.mode === 'video' ? 'video' : 'image');
  const productId = params.product ?? 'bot-001';

  const loaded = useAsync(() => products.get(productId), [products, productId]);
  const tpl = useAsync(() => (params.template ? templates.get(params.template) : Promise.resolve(null)), [templates, params.template]);
  const product = loaded.data;

  if (!product || (params.template && tpl.loading)) return <div className="page" data-testid="studio-loading" />;

  const tabs = (
    <div role="tablist" className="mode-tabs" aria-label={t('ui.studio.mode')}>
      <button
        role="tab"
        type="button"
        aria-selected={mode === 'image'}
        className={`mode-tab${mode === 'image' ? ' mode-on' : ''}`}
        data-testid="mode-image"
        onClick={() => setMode('image')}
      >
        <ImageIcon size={15} /> {t('ui.studio.modeImage')}
      </button>
      <button
        role="tab"
        type="button"
        aria-selected={mode === 'video'}
        className={`mode-tab${mode === 'video' ? ' mode-on' : ''}`}
        data-testid="mode-video"
        onClick={() => setMode('video')}
      >
        <BoxIcon size={15} /> {t('ui.studio.modeVideo')}
      </button>
    </div>
  );

  const common = {
    product,
    template: tpl.data,
    modeTabs: tabs,
    onProduct: (p: Product) => navigate('/studio', { product: p.id, mode, template: params.template }),
  };

  return mode === 'video' ? <VideoStudio key="video" {...common} /> : <ImageStudio key="image" {...common} />;
}
