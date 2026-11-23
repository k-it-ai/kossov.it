import en from './en.json';
import de from './de.json';
import ru from './ru.json';

export const SITE = 'https://kossov.it';
export const LANGS = ['en', 'de', 'ru'];
const dict = { en, de, ru };

const lookup = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Returns a translate function for a language, falling back to English. */
export function useT(lang) {
  return (key) => lookup(dict[lang], key) ?? lookup(en, key) ?? key;
}

/** URL prefix for a language: '' for English, '/de' or '/ru' otherwise. */
export const prefix = (lang) => (lang === 'en' ? '' : `/${lang}`);

/**
 * Base path the site is served from: '' on kossov.it, '/kossov.it' on the
 * github.io preview URL (set at build time from the Pages configuration).
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Path to a file in public/, e.g. asset('/favicon.svg'). */
export const asset = (path) => `${BASE}${path}`;

/** Internal link to a page in a language, e.g. link('de', '/privacy/'). */
export const link = (lang, path) => `${BASE}${prefix(lang)}${path}`;

/** Absolute URL of a page (path without language prefix, e.g. '/' or '/privacy/'). */
export const urlFor = (lang, path) => `${SITE}${prefix(lang)}${path}`;
