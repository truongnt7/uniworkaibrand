import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@aps/i18n';
import { JobForm } from './components/JobForm';
import { JobList } from './components/JobList';
import { RuntimePanel } from './components/RuntimePanel';
import { setLocale } from './i18n';
import { useJobs, useRuntime } from './store';

export function App() {
  const { t, i18n } = useTranslation();
  const jobs = useJobs();
  const runtime = useRuntime();

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.subtitle')}</p>
        </div>
        <label className="locale">
          <span>{t('app.language')}</span>
          <select value={i18n.language} onChange={(e) => setLocale(e.target.value as Locale)} data-testid="locale-select">
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`locale.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="layout">
        <section className="column">
          <RuntimePanel runtime={runtime} />
          <JobForm runtimeReady={runtime.status?.installed ?? false} />
        </section>
        <section className="column">
          <JobList jobs={jobs} />
        </section>
      </main>
    </div>
  );
}
