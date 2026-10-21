import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Pencil, Download, ExternalLink, MessageCircle, Loader2, Eye, User as UserIcon, Flame, Wallet, Paperclip, History, Check, Send, ArrowRight, StickyNote } from 'lucide-react';
import { PageWrapper, ContentCard, Button, Badge, EmptyState, PanelCard, DetailField, Tabs, Select, Input, Textarea, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { SendWhatsappModal } from '../components/SendWhatsappModal';
import { PaymentsPanel } from '../components/PaymentsPanel';
import { FilesPanel } from '../components/FilesPanel';
import { api, errMsg, pdfUrl } from '../api';
import { NotesPanel } from '../components/NotesPanel';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { useCompany } from '../src/hooks/useCompany';
import { useSettings } from '../src/hooks/useSettings';
import { cn } from '../src/lib/utils';
import { brl, brlUnit, dateLabel, dateTimeLabel, maskPhone, orderStages, stageOf } from '../utils/format';
import { orderDocMessage, stageMessage, notifyByDefault } from '../utils/messages';
import type { Order, OrderStatus } from '../types';

const tabs = [
  { id: 'resumo', label: 'Resumo', icon: ClipboardList }, { id: 'pagamentos', label: 'Pagamentos', icon: Wallet }, { id: 'arquivos', label: 'Arquivos', icon: Paperclip }, { id: 'anotacoes', label: 'Anotações', icon: StickyNote },
  { id: 'documento', label: 'Documento (PDF)', icon: Eye }, { id: 'historico', label: 'Histórico', icon: History },
] as const;
const tabIds = tabs.map((t) => t.id);
const flow = orderStages.filter((s) => s.id !== 'cancelado');
const prevOf = (s: OrderStatus): OrderStatus | null => { const i = flow.findIndex((x) => x.id === s); return i > 0 ? flow[i - 1].id : null; };
const nextOf = (s: OrderStatus): OrderStatus | null => { const i = flow.findIndex((x) => x.id === s); return i >= 0 && i < flow.length - 1 ? flow[i + 1].id : null; };

/** Linha do tempo das etapas, para ver de relance em que ponto está o pedido. */
const Stepper: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const at = flow.findIndex((s) => s.id === status);
  if (status === 'cancelado') return <Badge color="danger" dot>Ordem de serviço cancelada</Badge>;
  return (
    <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1" aria-label="Etapas da ordem de serviço">
      {flow.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1 shrink-0" aria-current={i === at ? 'step' : undefined}>
          <span className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]', i < at ? 'border-blue-200 bg-blue-50 text-blue-700' : i === at ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-400')}>
            {i < at && <Check size={11} />}{s.label}
          </span>
          {i < flow.length - 1 && <span className={cn('w-3 h-px', i < at ? 'bg-blue-300' : 'bg-slate-200')} />}
        </li>
      ))}
    </ol>
  );
};

const OrderDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const company = useCompany();
  const settings = useSettings();
  const [tab, setTab] = useUrlTab(tabIds, 'resumo');
  const { data: o, loading, error, reload } = useLoad(() => api.get<Order>(`/orders/${id}`), [id]);
  const [stage, setStage] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState('');
  const [moving, setMoving] = useState(false);
  const [dialog, setDialog] = useState<'os' | 'aviso' | null>(null);
  const [pdfKey, setPdfKey] = useState(0);
  const name = company?.name ?? 'Pixel Gráfica';

  // ao escolher a etapa, já sugere o aviso (e a mensagem) para o cliente
  useEffect(() => {
    if (!o || !stage) return;
    setNotify(notifyByDefault.has(stage));
    setMessage(stageMessage(o, stage, name, settings));
  }, [stage, o?.id, name, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !o) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando ordem de serviço…</div></PageWrapper>;
  if (error || !o) {
    return (
      <PageWrapper><div className="space-y-4"><BackBar to="/pedidos" label="Voltar para ordens de serviço" />
        <ContentCard><EmptyState icon={ClipboardList} title={error ? 'Não foi possível carregar a ordem de serviço' : 'Ordem de serviço não encontrada'} description={error ? 'Confira a conexão e tente novamente.' : 'Ela pode ter sido excluída.'}
          action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate('/pedidos')}>Voltar para ordens de serviço</Button>{error && <Button onClick={() => reload()}>Tentar novamente</Button>}</div>} /></ContentCard></div></PageWrapper>
    );
  }

  const st = stageOf(o.status);
  const remaining = Math.max(0, o.total - o.paid);
  const next = nextOf(o.status);
  const prev = prevOf(o.status);
  const refresh = () => { reload(true); setPdfKey((k) => k + 1); };

  const move = async (to: OrderStatus, withNotify: boolean, msg: string) => {
    if (moving) return;
    setMoving(true);
    try {
      const r = await api.patch<Order & { notified: boolean | null; notifyError: string | null }>(`/orders/${o.id}/status`, { status: to, note, notify: withNotify, message: msg });
      toast.success(`Movido para "${stageOf(to).label}".`);
      if (r.notified) toast.success('Cliente avisado pelo WhatsApp.');
      if (r.notified === false) toast.warning(`Etapa alterada, mas o aviso não foi enviado: ${r.notifyError}`);
      setStage(''); setNote(''); setNotify(false); setMessage(''); refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setMoving(false); }
  };

  const sendOs = async (msg: string) => { await api.post(`/orders/${o.id}/send`, { message: msg }); toast.success('Ordem de serviço enviada ao cliente pelo WhatsApp.'); setDialog(null); refresh(); };
  const sendNotice = async (msg: string) => { await api.post(`/orders/${o.id}/notify`, { message: msg }); toast.success('Cliente avisado pelo WhatsApp.'); setDialog(null); refresh(); };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/pedidos" label="Voltar para ordens de serviço">
          <Button variant="outline" size="sm" iconLeft={<Pencil size={14} />} onClick={() => navigate(`/pedidos/${o.id}/editar`)}>Editar</Button>
          <Button variant="outline" size="sm" iconLeft={<ExternalLink size={14} />} onClick={() => window.open(pdfUrl('orders', o.id), '_blank')}>Abrir PDF</Button>
          <Button variant="outline" size="sm" iconLeft={<Download size={14} />} onClick={() => window.open(pdfUrl('orders', o.id, true), '_blank')}>Baixar</Button>
          <Button variant="outline" size="sm" iconLeft={<Send size={14} />} onClick={() => setDialog('aviso')}>Avisar cliente</Button>
          <Button size="sm" iconLeft={<MessageCircle size={14} />} onClick={() => setDialog('os')}>Enviar OS por WhatsApp</Button>
        </BackBar>

        <ContentCard padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-14 w-14 rounded-lg border border-blue-100 bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><ClipboardList size={24} /></span>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2 flex-wrap">Ordem de serviço #{o.number}
                  <Badge size="sm" dot color={st.color}>{st.label}</Badge>{o.priority === 'urgente' && <Badge size="sm" color="danger" icon={<Flame size={11} />}>Urgente</Badge>}</h1>
                <button className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1" onClick={() => navigate(`/clientes/${o.customer.id}`)}><UserIcon size={12} />{o.customer.name}{o.customer.company ? ` · ${o.customer.company}` : ''}</button>
                <p className="text-[11px] text-slate-400 mt-0.5">Aberta em {dateLabel(o.createdAt)}{o.dueDate ? ` · entrega ${dateLabel(o.dueDate)}` : ''}{o.quote ? ` · do orçamento #${o.quote.number}` : ''}</p>
              </div>
            </div>
            <div className="text-right"><p className="text-[11px] text-slate-500">Total</p><p className="text-xl font-semibold tabular-nums text-blue-700">{brl(o.total)}</p>
              <p className={cn('text-[11px]', remaining > 0 ? 'text-amber-700' : 'text-emerald-700')}>{remaining > 0 ? `Falta receber ${brl(remaining)}` : 'Quitado'}</p></div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><Stepper status={o.status} /></div>
        </ContentCard>

        <Tabs<typeof tabs[number]['id']> items={tabs} value={tab} onChange={setTab} label="Detalhes da ordem de serviço">
          {tab === 'resumo' && (
            <div className="space-y-3">
              {o.status !== 'cancelado' && (
                <PanelCard title="Andamento" description="Mova a ordem de serviço de etapa e, se quiser, avise o cliente pelo WhatsApp.">
                  <div className="space-y-3">
                    {!stage && (next || prev) && (
                      <div className="flex flex-wrap gap-2">
                        {prev && <Button size="sm" variant="outline" loading={moving} onClick={() => setStage(prev)}>← Voltar para “{stageOf(prev).label}”</Button>}
                        {next && <Button size="sm" loading={moving} iconRight={<ArrowRight size={14} />} onClick={() => setStage(next)}>Avançar para “{stageOf(next).label}”</Button>}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select label="Mover para" value={stage} onChange={(e) => setStage(e.target.value as OrderStatus)} placeholder="Escolha a etapa" options={orderStages.filter((s) => s.id !== o.status).map((s) => ({ value: s.id, label: s.label }))} />
                      <Input label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    {stage && (
                      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-blue-600" />Avisar o cliente pelo WhatsApp{!o.customer.phone && <span className="text-amber-700"> (cliente sem WhatsApp)</span>}</label>
                        {notify && <Textarea aria-label="Mensagem para o cliente" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />}
                        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setStage('')}>Cancelar</Button><Button size="sm" loading={moving} onClick={() => move(stage, notify, message)}>Mover para “{stageOf(stage).label}”</Button></div>
                      </div>
                    )}
                  </div>
                </PanelCard>
              )}
              <PanelCard title="Itens">
                <ul className="divide-y divide-slate-100">
                  {o.items.map((i, k) => (
                    <li key={k} className="py-2 flex justify-between gap-3 text-[13px]">
                      <span className="min-w-0 break-words">{i.description}<span className="block text-[11px] text-slate-500">{i.quantity} × {brlUnit(i.unitPrice)}</span></span>
                      <span className="tabular-nums font-medium whitespace-nowrap">{brl(i.total)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-slate-100 pt-2 mt-1 flex justify-between text-sm font-semibold"><span>Total</span><span className="text-blue-700 tabular-nums">{brl(o.total)}</span></div>
              </PanelCard>
              <PanelCard title="Entrega e contato">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <DetailField label="Entrega prevista" value={dateLabel(o.dueDate)} />
                  <DetailField label="Forma" value={o.deliveryType === 'entrega' ? 'Entrega' : 'Retirada na loja'} />
                  <DetailField label="WhatsApp do cliente" value={maskPhone(o.customer.phone)} />
                  <DetailField label="Observações" value={o.notes ?? ''} />
                </dl>
              </PanelCard>
            </div>
          )}
          {tab === 'pagamentos' && <PaymentsPanel order={o} company={name} settings={settings} onChanged={refresh} />}
          {tab === 'anotacoes' && <ContentCard padding="md"><NotesPanel orderId={o.id} emptyHint="Aqui ficam as anotações do atendimento: o que o cliente pediu, gosta, não gosta e enviou." /></ContentCard>}
          {tab === 'arquivos' && <ContentCard padding="md"><FilesPanel orderId={o.id} kind="order" pickFromCustomerId={o.customer.id} emptyHint="Anexe a arte, o PDF final ou o arquivo enviado pelo cliente." /></ContentCard>}
          {tab === 'documento' && (
            <ContentCard padding="none" className="overflow-hidden">
              <iframe key={pdfKey} title={`PDF da ordem de serviço ${o.number}`} src={`${pdfUrl('orders', o.id)}#toolbar=0&navpanes=0`} className="w-full h-[78vh] bg-slate-100" />
            </ContentCard>
          )}
          {tab === 'historico' && (
            <ContentCard padding="md">
              <ul className="divide-y divide-slate-100">
                {(o.events ?? []).map((ev) => (
                  <li key={ev.id} className="py-2 text-[13px]">
                    <div className="flex items-center justify-between gap-2"><Badge size="sm" color={stageOf(ev.status).color}>{stageOf(ev.status).label}</Badge><span className="text-[11px] text-slate-500">{dateTimeLabel(ev.createdAt)}</span></div>
                    {(ev.note || ev.userName) && <p className="text-xs text-slate-600 mt-1">{[ev.note, ev.userName && `por ${ev.userName}`].filter(Boolean).join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            </ContentCard>
          )}
        </Tabs>
      </div>

      {dialog === 'os' && <SendWhatsappModal title="Enviar ordem de serviço por WhatsApp" customerName={o.customer.name} phone={o.customer.phone} fileName={`OS-${String(o.number).padStart(4, '0')}-Pixel.pdf`}
        defaultMessage={orderDocMessage(o, name, settings)} onSend={sendOs} onClose={() => setDialog(null)} />}
      {dialog === 'aviso' && <SendWhatsappModal title="Avisar o cliente" sendLabel="Enviar aviso" customerName={o.customer.name} phone={o.customer.phone}
        defaultMessage={stageMessage(o, o.status, name, settings)} onSend={sendNotice} onClose={() => setDialog(null)} />}
    </PageWrapper>
  );
};

export default OrderDetail;
