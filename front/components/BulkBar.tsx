import React, { useState } from 'react';
import { Trash2, Power, PowerOff, X } from 'lucide-react';
import { Button, ConfirmModal, useToast } from './ui';
import { api, errMsg } from '../api';

interface Props {
  resource: 'quotes' | 'orders' | 'customers' | 'products' | 'services';
  noun: string;            // plural, ex.: "orçamentos"
  ids: string[];
  names: (id: string) => string;
  totalCount: number;      // quantos há no filtro atual (para "selecionar todos")
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  deleteNote?: string;
  canToggleActive?: boolean;
}
type Result = { deleted: number; inactivated: number; skipped: { id: string; reason: string }[] };

/** Barra que aparece ao marcar linhas: excluir (com confirmação) e, quando existir, ativar/inativar. */
export const BulkBar: React.FC<Props> = ({ resource, noun, ids, names, totalCount, onSelectAll, onClear, onDone, deleteNote, canToggleActive }) => {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'delete' | 'inactivate' | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;

  const preview = ids.slice(0, 6).map(names);
  const run = async () => {
    if (busy || !confirm) return;
    setBusy(true);
    try {
      const r = await api.post<Result>(`/bulk/${resource}/delete`, { ids });
      const parts = [r.deleted && `${r.deleted} excluído(s)`, r.inactivated && `${r.inactivated} inativado(s) (têm histórico)`].filter(Boolean).join(' · ');
      if (r.skipped.length) toast.warning(`${parts || 'Nada foi excluído'}. ${r.skipped.length} mantido(s): ${[...new Set(r.skipped.map((s) => s.reason))].join('; ')}.`);
      else toast.success(parts || 'Concluído.');
      setConfirm(null); onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const setActive = async (active: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ updated: number }>(`/bulk/${resource}/active`, { ids, active });
      toast.success(`${r.updated} ${active ? 'ativado(s)' : 'inativado(s)'}.`);
      setConfirm(null); onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <div role="region" aria-label="Ações em massa" className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <span className="text-xs font-medium text-blue-900">{ids.length} selecionado(s)</span>
        {ids.length < totalCount && <Button variant="ghost" size="xs" onClick={onSelectAll}>Selecionar todos os {totalCount}</Button>}
        <span className="flex-1" />
        {canToggleActive && <Button variant="outline" size="xs" iconLeft={<Power size={12} />} loading={busy} onClick={() => setActive(true)}>Ativar</Button>}
        {canToggleActive && <Button variant="outline" size="xs" iconLeft={<PowerOff size={12} />} onClick={() => setConfirm('inactivate')}>Inativar</Button>}
        <Button variant="danger" size="xs" iconLeft={<Trash2 size={12} />} onClick={() => setConfirm('delete')}>Excluir</Button>
        <Button variant="ghost" size="xs" iconLeft={<X size={12} />} onClick={onClear}>Cancelar</Button>
      </div>

      <ConfirmModal isOpen={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={run} loading={busy} variant="danger"
        title={`Excluir ${ids.length} ${ids.length === 1 ? noun.replace(/s$/, '') : noun}?`} confirmLabel={`Excluir ${ids.length}`}
        message={<div className="space-y-2">
          <ul className="list-disc pl-4 text-xs text-slate-700">{preview.map((n, i) => <li key={i} className="truncate">{n}</li>)}{ids.length > preview.length && <li className="list-none -ml-4 text-slate-500">e mais {ids.length - preview.length}…</li>}</ul>
          <p>{deleteNote ?? 'Não dá para desfazer.'}</p>
        </div>} />
      <ConfirmModal isOpen={confirm === 'inactivate'} onClose={() => setConfirm(null)} onConfirm={() => setActive(false)} loading={busy} variant="primary"
        title={`Inativar ${ids.length} ${ids.length === 1 ? noun.replace(/s$/, '') : noun}?`} confirmLabel={`Inativar ${ids.length}`}
        message="Os inativos deixam de aparecer para escolher em orçamentos e ordens de serviço e a Pixel IA deixa de usá-los. Dá para ativar de novo quando quiser." />
    </>
  );
};
