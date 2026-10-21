import { useCallback, useEffect, useMemo, useState } from 'react';

/** Seleção de várias linhas de uma lista. `pageIds` = linhas visíveis; `allIds` = todas as do filtro atual. */
export function useBulk(pageIds: string[], allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allKey = useMemo(() => allIds.join(','), [allIds]);

  // some da seleção o que saiu da lista (excluído, filtrado)
  useEffect(() => {
    const all = new Set(allKey ? allKey.split(',') : []);
    setSelected((s) => { const next = new Set([...s].filter((id) => all.has(id))); return next.size === s.size ? s : next; });
  }, [allKey]);

  const toggle = useCallback((id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const togglePage = useCallback(() => setSelected((s) => {
    const n = new Set(s);
    const every = pageIds.length > 0 && pageIds.every((id) => n.has(id));
    pageIds.forEach((id) => (every ? n.delete(id) : n.add(id)));
    return n;
  }), [pageIds]);
  const selectAll = useCallback(() => setSelected(new Set(allIds)), [allIds]);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, toggle, togglePage, selectAll, clear, count: selected.size, ids: [...selected] };
}
