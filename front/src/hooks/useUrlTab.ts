import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Aba ativa guardada na URL (?aba=familia): o link abre direto na aba, atualizar a página não volta para a primeira
 * e o botão voltar do navegador funciona. A aba padrão não aparece na URL, e os outros parâmetros (ex.: mês/ano) são preservados.
 */
export function useUrlTab<T extends string>(allowed: readonly T[], fallback: T, key = 'aba'): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const tab = raw && (allowed as readonly string[]).includes(raw) ? raw as T : fallback;

  const setTab = useCallback((next: T) => setParams(prev => {
    const updated = new URLSearchParams(prev);
    if (next === fallback) updated.delete(key); else updated.set(key, next);
    return updated;
  }, { replace: true }), [setParams, fallback, key]);

  return [tab, setTab];
}
