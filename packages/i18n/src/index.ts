import i18next, { type i18n as I18nInstance } from 'i18next';
import vi from './locales/vi.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';
export const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function createI18n(locale: Locale = DEFAULT_LOCALE): I18nInstance {
  const instance = i18next.createInstance();
  void instance.init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
    showSupportNotice: false,
  });
  return instance;
}

/** Dịch mã lỗi ổn định (AppError.code); mã lạ rơi về UNKNOWN. */
export function translateError(t: (key: string) => string, code: string | null | undefined): string {
  const key = `errors.${code ?? 'UNKNOWN'}`;
  const out = t(key);
  return out === key ? t('errors.UNKNOWN') : out;
}

export function formatBytes(bytes: number, locale: Locale = DEFAULT_LOCALE): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

export function formatDateTime(epochMs: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(epochMs),
  );
}
