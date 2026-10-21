import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../../api';
import { LIVE_EVENT } from './useLive';

/** Carrega dados com proteção contra corrida (só a última requisição vale) e "tentar novamente". */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { live?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const req = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback((silent = false) => {
    const id = ++req.current;
    if (!silent) setLoading(true);
    setError('');
    fnRef.current()
      .then((d) => { if (id === req.current) setData(d); })
      .catch((e) => { if (id === req.current) setError(errMsg(e)); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);

  // tempo real: recarrega em silêncio quando o servidor avisa de uma mudança (telas de edição passam live: false para não pisar no que está sendo digitado)
  const live = opts.live !== false;
  useEffect(() => {
    if (!live) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => { if (document.hidden) return; clearTimeout(t); t = setTimeout(() => reload(true), 300); };
    window.addEventListener(LIVE_EVENT, on);
    return () => { clearTimeout(t); window.removeEventListener(LIVE_EVENT, on); };
  }, [live, reload]);
  return { data, setData, loading, error, reload };
}
