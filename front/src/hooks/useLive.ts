import { useEffect } from 'react';
import { getToken } from '../../api';

export const LIVE_EVENT = 'pixel:change';

/** Mantém uma conexão de tempo real com o servidor e avisa as telas (evento LIVE_EVENT) quando algo muda. Usada uma vez, no layout. */
export function useLive() {
  useEffect(() => {
    const token = getToken();
    if (!token || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    const fire = () => window.dispatchEvent(new Event(LIVE_EVENT));
    es.addEventListener('change', fire);
    // ao voltar para a aba (ou reconectar) já atualiza, pois podem ter passado mudanças
    const onVisible = () => { if (!document.hidden) fire(); };
    document.addEventListener('visibilitychange', onVisible);
    es.addEventListener('open', fire);
    return () => { es.close(); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
}
