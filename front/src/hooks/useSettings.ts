import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Settings } from '../../types';

let cache: Settings | null = null;

/** Preferências do sistema (prazos, categorias, modelos de mensagem). Em memória: um pedido por sessão, renovado ao salvar. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(cache);
  useEffect(() => {
    if (cache) return;
    api.get<Settings>('/settings').then((s) => { cache = s; setSettings(s); }).catch(() => {});
  }, []);
  return settings;
}

export const setSettingsCache = (s: Settings | null) => { cache = s; };
