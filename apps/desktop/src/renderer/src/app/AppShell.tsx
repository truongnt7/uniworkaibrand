import { useEffect } from 'react';
import { App as PocConsole } from '../App';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { PublishPage } from '../features/publish/PublishPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { StudioPage } from '../features/studio/StudioPage';
import { TemplatesPage } from '../features/templates/TemplatesPage';
import pocCssUrl from '../styles.css?url';
import { Sidebar } from './Sidebar';
import { useRoute } from './router';

/** Console PoC giữ nguyên giao diện tối riêng; chỉ nạp stylesheet của nó khi mở route #/poc để không rò vào UI mới. */
function PocRoute() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = pocCssUrl;
    link.dataset.poc = 'true';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
  return (
    <div className="poc-page" data-testid="poc-page">
      <PocConsole />
    </div>
  );
}

export function AppShell() {
  const route = useRoute();
  const page = (() => {
    switch (route.path) {
      case '/products':
        return <ProductsPage key={route.params.product ?? ''} initialSelectedId={route.params.product} />;
      case '/studio':
        return <StudioPage params={route.params} />;
      case '/templates':
        return <TemplatesPage productId={route.params.product} />;
      case '/library':
        return <LibraryPage params={route.params} />;
      case '/publish':
        return <PublishPage itemId={route.params.item} />;
      case '/poc':
        return <PocRoute />;
      default:
        return <OverviewPage />;
    }
  })();
  return (
    <div className="shell">
      <Sidebar />
      <main className="main" data-testid={`page-${route.path === '/' ? 'overview' : route.path.slice(1)}`}>
        {page}
      </main>
    </div>
  );
}
