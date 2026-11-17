import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { AppShell } from './app/AppShell';
import { ToastProvider } from './app/Toast';
import { i18n, initialLocale } from './i18n';
import { ServicesProvider, createServices } from './services';
import './app.css';

document.documentElement.lang = initialLocale;
const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ServicesProvider services={createServices()}>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </ServicesProvider>
    </I18nextProvider>
  </StrictMode>,
);
