import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Pencil, Download, ExternalLink, MessageCircle, ClipboardList, Loader2, Eye, Paperclip, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { PageWrapper, ContentCard, Button, Badge, EmptyState, PanelCard, DetailField, Tabs, ConfirmModal, useToast } from '../components/ui';
import { FilesPanel } from '../components/FilesPanel';
import { BackBar } from '../components/BackBar';
import { SendWhatsappModal } from '../components/SendWhatsappModal';
import { api, errMsg, pdfUrl } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { useCompany } from '../src/hooks/useCompany';
import { useSettings } from '../src/hooks/useSettings';
import { brl, brlUnit, dateLabel, dateTimeLabel, maskPhone, quoteStatus } from '../utils/format';
import { quoteMessage } from '../utils/messages';
import type { Quote, QuoteStatus } from '../types';

const tabs = [{ id: 'resumo', label: 'Resumo', icon: FileText }, { id: 'arquivos', label: 'Arquivos', icon: Paperclip }, { id: 'documento', label: 'Documento (PDF)', icon: Eye }] as const;
const tabIds = tabs.map((t) => t.id);

const QuoteDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const company = useCompany();
  const settings = useSettings();
  const [tab, setTab] = useUrlTab(tabIds, 'resumo');
  const { data: q, loading, error, reload } = useLoad(() => api.get<Quote>(`/quotes/${id}`), [id]);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'order' | 'recusar' | null>(null);
  const [pdfKey, setPdfKey] = useState(0);

  if (loading && !q) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando orçamento…</div></PageWrapper>;
  if (error || !q) {
    return (
      <PageWrapper><div className="space-y-4"><BackBar to="/orcamentos" label="Voltar para orçamentos" />
        <ContentCard><EmptyState icon={FileText} title={error ? 'Não foi possível carregar o orçamento' : 'Orçamento não encontrado'} description={error ? 'Confira a conexão e tente novamente.' : 'Ele pode ter sido excluído.'}
          action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/orcamentos')}>Voltar para orçamentos</Button>{error && <Button onClick={() => reload()}>Tentar novamente</Button>}</div>} /></ContentCard></div></PageWrapper>
    );
  }

  const st = quoteStatus[q.status];
  const order = q.orders?.[0];
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast.success(ok); setConfirm(null); setPdfKey((k) => k + 1); reload(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const setStatus = (status: QuoteStatus, ok: string) => run(() => api.patch(`/quotes/${q.id}/status`, { status }), ok);

  const sendPdf = async (message: string) => {
    await api.post(`/quotes/${q.id}/send`, { message });
    toast.success('Orçamento enviado ao cliente pelo WhatsApp.');
    setSending(false); setPdfKey((k) => k + 1); reload(true);
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/orcamentos" label="Voltar para orçamentos">
          {!order && <Button variant="outline" size="sm" iconLeft={<Pencil size={14} />} onClick={() => navigate(`/orcamentos/${q.id}/editar`)}>Editar</Button>}
          <Button variant="outline" size="sm" iconLeft={<ExternalLink size={14} />} onClick={() => window.open(pdfUrl('quotes', q.id), '_blank')}>Abrir PDF</Button>
          <Button variant="outline" size="sm" iconLeft={<Download size={14} />} onClick={() => window.open(pdfUrl('quotes', q.id, true), '_blank')}>Baixar</Button>
          <Button size="sm" iconLeft={<MessageCircle size={14} />} onClick={() => setSending(true)}>Enviar por WhatsApp</Button>
        </BackBar>

        <ContentCard padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-14 w-14 rounded-lg border border-blue-100 bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><FileText size={24} /></span>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2 flex-wrap">Orçamento #{q.number}<Badge size="sm" dot color={st.color}>{st.label}</Badge></h1>
                <button className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1" onClick={() => navigate(`/clientes/${q.customer.id}`)}><UserIcon size={12} />{q.customer.name}{q.customer.company ? ` · ${q.customer.company}` : ''}</button>
                <p className="text-[11px] text-slate-400 mt-0.5">Criado em {dateLabel(q.createdAt)}{q.source === 'whatsapp' ? ' · veio do WhatsApp (Pixel IA)' : ''}{q.sentAt ? ` · enviado em ${dateTimeLabel(q.sentAt)}` : ''}</p>
              </div>
            </div>
            <div className="text-right"><p className="text-[11px] text-slate-500">Total</p><p className="text-xl font-semibold tabular-nums text-blue-700">{brl(q.total)}</p></div>
          </div>

          {!order && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 mr-1">Situação:</span>
              {q.status !== 'rascunho' && <Button size="xs" variant="outline" loading={busy} onClick={() => setStatus('rascunho', 'Voltou para rascunho.')}>Voltar para rascunho</Button>}
              {q.status === 'rascunho' && <Button size="xs" variant="outline" loading={busy} onClick={() => setStatus('enviado', 'Marcado como enviado.')}>Marcar como enviado</Button>}
              {q.status !== 'recusado' && <Button size="xs" variant="outline" loading={busy} onClick={() => setConfirm('recusar')}>Cliente recusou</Button>}
              {q.status !== 'recusado' && <Button size="xs" iconLeft={<ClipboardList size={12} />} loading={busy} onClick={() => setConfirm('order')}>Aprovar e gerar ordem de serviço</Button>}
            </div>
          )}
          {order && (
            <p className="mt-4 pt-3 border-t border-slate-100 text-xs flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" />Este orçamento virou a ordem de serviço #{order.number}.
              <button className="text-blue-600 hover:underline" onClick={() => navigate(`/pedidos/${order.id}`)}>Abrir ordem de serviço</button></p>
          )}
        </ContentCard>

        <Tabs<typeof tabs[number]['id']> items={tabs} value={tab} onChange={setTab} label="Detalhes do orçamento">
          {tab === 'resumo' && (
            <div className="space-y-3">
              <PanelCard title="Itens">
                <ul className="divide-y divide-slate-100">
                  {q.items.map((i, k) => (
                    <li key={k} className="py-2 flex justify-between gap-3 text-[13px]">
                      <span className="min-w-0 break-words">{i.description}<span className="block text-[11px] text-slate-500">{i.quantity} × {brlUnit(i.unitPrice)}</span></span>
                      <span className="tabular-nums font-medium whitespace-nowrap">{brl(i.total)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-100 pt-2 mt-1 text-xs space-y-1">
                  {q.discount > 0 && <div className="flex justify-between text-slate-500"><span>Desconto</span><span>- {brl(q.discount)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold"><span>Total</span><span className="text-blue-700 tabular-nums">{brl(q.total)}</span></div>
                </div>
              </PanelCard>
              <PanelCard title="Cliente e condições">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <DetailField label="Cliente" value={q.customer.name} />
                  <DetailField label="WhatsApp" value={maskPhone(q.customer.phone)} />
                  <DetailField label="Válido até" value={dateLabel(q.validUntil)} />
                  <DetailField label="Observações" value={q.notes ?? ''} />
                </dl>
              </PanelCard>
            </div>
          )}
          {tab === 'arquivos' && <ContentCard padding="md"><FilesPanel quoteId={q.id} kind="quote" pickFromCustomerId={q.customer.id} emptyHint="Anexe o que o cliente mandou (logo, arte, referência), enviando um arquivo ou escolhendo entre os que ele já enviou pelo WhatsApp." /></ContentCard>}
          {tab === 'documento' && (
            <ContentCard padding="none" className="overflow-hidden">
              <iframe key={pdfKey} title={`PDF do orçamento ${q.number}`} src={`${pdfUrl('quotes', q.id)}#toolbar=0&navpanes=0`} className="w-full h-[78vh] bg-slate-100" />
            </ContentCard>
          )}
        </Tabs>
      </div>

      {sending && <SendWhatsappModal title="Enviar orçamento por WhatsApp" customerName={q.customer.name} phone={q.customer.phone} fileName={`Orcamento-${String(q.number).padStart(4, '0')}-Pixel.pdf`}
        defaultMessage={quoteMessage(q, company?.name ?? 'Pixel Gráfica', settings)} onSend={sendPdf} onClose={() => setSending(false)} />}
      <ConfirmModal isOpen={confirm === 'order'} onClose={() => setConfirm(null)} variant="primary" loading={busy} title="Aprovar e gerar a ordem de serviço?" confirmLabel="Gerar ordem de serviço"
        message="O orçamento fica como aprovado e a ordem de serviço é criada com os mesmos itens e valores. Depois disso o orçamento não pode mais ser editado."
        onConfirm={() => run(async () => { const o = await api.post<{ id: string }>(`/quotes/${q.id}/order`); navigate(`/pedidos/${o.id}`); }, 'Ordem de serviço criada.')} />
      <ConfirmModal isOpen={confirm === 'recusar'} onClose={() => setConfirm(null)} variant="danger" loading={busy} title="Marcar como recusado?" confirmLabel="Marcar como recusado"
        message="O orçamento fica como recusado pelo cliente. Você ainda pode voltar para rascunho depois." onConfirm={() => setStatus('recusado', 'Orçamento marcado como recusado.')} />
    </PageWrapper>
  );
};

export default QuoteDetail;
