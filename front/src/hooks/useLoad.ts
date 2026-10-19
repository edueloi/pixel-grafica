import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../../api';

/** Carrega dados com proteção contra corrida (só a última requisição vale) e "tentar novamente". */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
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
  return { data, setData, loading, error, reload };
}
