import React, { useState } from 'react';
import { Sparkles, Trash2, StickyNote, Plus } from 'lucide-react';
import { Button, IconButton, Textarea, Badge, EmptyState, ConfirmModal, useToast } from './ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { dateTimeLabel } from '../utils/format';

export interface NoteItem { id: string; title: string; body: string; source: 'ia' | 'manual'; createdBy?: string | null; createdAt: string; orderId?: string | null; quoteId?: string | null; customerId?: string | null; conversationId?: string | null }
interface Props { customerId?: string; quoteId?: string; orderId?: string; conversationId?: string; /** mostra o botão que gera as anotações da conversa com a IA */ canGenerate?: boolean; emptyHint?: string }

// *negrito* simples do texto (o mesmo que vai para o WhatsApp)
const Rich: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-[13px] text-slate-700 space-y-0.5">
    {text.split('\n').map((line, i) => (
      <p key={i} className="whitespace-pre-wrap break-words min-h-[1em]">
        {line.split(/(\*[^*]+\*)/g).map((part, j) => (/^\*[^*]+\*$/.test(part) ? <strong key={j} className="font-semibold text-slate-900">{part.slice(1, -1)}</strong> : <React.Fragment key={j}>{part}</React.Fragment>))}
      </p>
    ))}
  </div>
);

/** Anotações do atendimento: geradas pela IA a partir da conversa ou escritas à mão. */
export const NotesPanel: React.FC<Props> = ({ customerId, quoteId, orderId, conversationId, canGenerate, emptyHint }) => {
  const toast = useToast();
  const params = new URLSearchParams({ ...(customerId ? { customerId } : {}), ...(quoteId ? { quoteId } : {}), ...(orderId ? { orderId } : {}), ...(conversationId ? { conversationId } : {}) }).toString();
  const { data, loading, error, reload } = useLoad(() => api.get<NoteItem[]>(`/notes?${params}`), [params]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<NoteItem | null>(null);

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await api.post('/notes', { body: text.trim(), customerId, quoteId, orderId, conversationId }); setText(''); reload(true); toast.success('Anotação salva.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const generate = async () => {
    if (!conversationId || busy) return;
    setBusy(true);
    try { await api.post(`/wpp/conversations/${conversationId}/briefing`); reload(true); toast.success('Anotações geradas.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await api.del(`/notes/${removing.id}`); setRemoving(null); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Textarea aria-label="Nova anotação" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma anotação (ex.: gosta de verde, não gosta de cores fortes, precisa da arte até sexta)" />
        <div className="flex flex-wrap gap-2 justify-end">
          {canGenerate && <Button size="sm" variant="outline" loading={busy} iconLeft={<Sparkles size={14} />} onClick={generate}>Gerar com a IA</Button>}
          <Button size="sm" loading={busy} disabled={!text.trim()} iconLeft={<Plus size={14} />} onClick={add}>Salvar anotação</Button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading && !data && <p className="text-xs text-slate-500">Carregando…</p>}
      {data && data.length === 0 && <EmptyState icon={StickyNote} title="Nenhuma anotação" description={emptyHint ?? 'Quando um atendente assume uma conversa, a IA anota o que o cliente pediu, gosta e enviou.'} />}
      <ul className="space-y-2">
        {(data ?? []).map((n) => (
          <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-slate-800 truncate">{n.title}</span>
                {n.source === 'ia' && <Badge size="sm" color="info" icon={<Sparkles size={10} />}>IA</Badge>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-slate-500">{dateTimeLabel(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}</span>
                <IconButton variant="ghost" size="xs" aria-label="Excluir anotação" onClick={() => setRemoving(n)}><Trash2 /></IconButton>
              </div>
            </div>
            <Rich text={n.body} />
          </li>
        ))}
      </ul>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} variant="danger" title="Excluir anotação?" confirmLabel="Excluir" message="A anotação será apagada. Não dá para desfazer." />
    </div>
  );
};
