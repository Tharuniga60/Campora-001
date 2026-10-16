// English source strings double as keys; Tamil lives in ./ta.js. Unknown keys fall back to English.
import TA from './ta.js';

let lang = localStorage.getItem('cl.lang') || 'en';
export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'ta' ? 'ta' : 'en';
  localStorage.setItem('cl.lang', lang);
  document.documentElement.lang = lang;
}
export function t(s) { return lang === 'ta' ? (TA[s] ?? s) : s; }
