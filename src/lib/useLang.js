import { useSyncExternalStore } from 'react';
import { getLang, subscribeLang } from './i18n';

export default function useLang() {
  return useSyncExternalStore(subscribeLang, getLang, () => 'en');
}
