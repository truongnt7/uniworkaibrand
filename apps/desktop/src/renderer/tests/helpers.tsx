import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { AppShell } from '../src/app/AppShell';
import { ToastProvider } from '../src/app/Toast';
import { i18n, setLocale } from '../src/i18n';
import { ServicesProvider, createServices } from '../src/services';
import type { Services } from '../src/services/types';

export function renderApp(hash = '#/products', overrides: Partial<Services> = {}) {
  setLocale('vi');
  window.location.hash = hash;
  const services: Services = { ...createServices({ useQueue: false, exportTickMs: 10 }), ...overrides };
  const user = userEvent.setup();
  const view = render(
    <I18nextProvider i18n={i18n}>
      <ServicesProvider services={services}>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </ServicesProvider>
    </I18nextProvider>,
  );
  return { ...view, user, services };
}
