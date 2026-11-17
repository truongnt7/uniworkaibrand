import { DEFAULT_LOCALE, createI18n, isLocale, type Locale } from '@aps/i18n';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aps.locale') : null;
export const initialLocale: Locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
export const i18n = createI18n(initialLocale);

export function setLocale(locale: Locale): void {
  localStorage.setItem('aps.locale', locale);
  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}
