import { DEFAULT_LOCALE, SUPPORTED_LOCALES, createI18n, isLocale, type Locale } from '@aps/i18n';
import en from './locales/ui.en.json' with { type: 'json' };
import vi from './locales/ui.vi.json' with { type: 'json' };

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aps.locale') : null;
export const initialLocale: Locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
export const i18n = createI18n(initialLocale);

// Chuỗi của UI shell nằm ở renderer/src/locales (khoá `ui.*`), gộp vào bộ chuỗi chung của @aps/i18n.
const uiBundles = { vi, en } as const;
for (const lng of SUPPORTED_LOCALES) i18n.addResourceBundle(lng, 'translation', uiBundles[lng], true, false);

export function setLocale(locale: Locale): void {
  localStorage.setItem('aps.locale', locale);
  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}
