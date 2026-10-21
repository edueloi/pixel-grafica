import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Send, Paperclip, Plus, ArrowLeft, UserCheck, XCircle, Shuffle, Link2, Bot, Loader2, QrCode, Power, FileText, FolderInput, Clock, NotebookPen } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, IconButton, Modal, ModalFooter, ConfirmModal, Input, Textarea, Select, Badge, EmptyState, Alert, FilterLineSegmented, useToast,
} from '../components/ui';
import { NotesPanel } from '../components/NotesPanel';
import { api, errMsg, fileUrl } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { cn } from '../src/lib/utils';
import { dateTimeLabel, digits, fileSize, initials, maskPhone, timeLabel } from '../utils/format';
import { whatsappTabs } from '../components/navigation';
import type { ChatMessage, Conversation, ConversationDetail, Customer, Order, Sector, User, WppSession } from '../types';

type ListTab = typeof whatsappTabs[number]['id'];
const apiTab: Record<ListTab, string> = { fila: 'waiting', meus: 'mine', abertos: 'open', bot: 'bot', encerrados: 'closed' };
const emptyText: Record<ListTab, string> = {
  fila: 'Ninguém esperando atendimento agora.', meus: 'Você não está com nenhum atendimento. Assuma um da Fila.',
  abertos: 'Nenhuma conversa aberta.', bot: 'Nenhum cliente conversando só com o bot agora.', encerrados: 'Nenhuma conversa encerrada ainda.',
};

const statusBadge: Record<Conversation['status'], { label: string; color: 'warning' | 'success' | 'info' | 'default' }> = {
  waiting: { label: 'Na fila', color: 'warning' }, active: { label: 'Em atendimento', color: 'success' }, bot: { label: 'Com o bot', color: 'info' }, closed: { label: 'Encerrada', color: 'default' },
};
const label = (c: Pick<Conversation, 'clientName' | 'clientPhone'>) => c.clientName || (digits(c.clientPhone).length >= 10 ? maskPhone(c.clientPhone) : 'Cliente');

/** Poll que não empilha requisições e para quando a aba fica escondida. */
function usePoll(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => { if (!document.hidden) ref.current(); }, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

// ── Conexão (QR) ─────────────────────────────────────────────────────────────
const ConnectModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const toast = useToast();
  const { data, reload } = useLoad(() => api.get<WppSession>('/wpp/status'), []);
  const [busy, setBusy] = useState(false);
  usePoll(() => reload(true), 2500);
  const s = data?.status ?? 'disconnected';

  const act = async (path: string, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await api.post(path); toast.success(ok); reload(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm" title="Conexão do WhatsApp" footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
      {s === 'connected' ? <Button variant="danger" size="sm" loading={busy} iconLeft={<Power size={14} />} onClick={() => act('/wpp/disconnect', 'WhatsApp desconectado.')}>Desconectar</Button>
        : <Button size="sm" loading={busy} iconLeft={<QrCode size={14} />} onClick={() => act('/wpp/connect', 'Gerando o QR Code…')}>{s === 'qr_pending' ? 'Gerar novo QR' : 'Conectar'}</Button>}
    </ModalFooter>}>
      <div className="space-y-3 text-center">
        {s === 'connected' && <><Badge dot color="success">Conectado</Badge><p className="text-sm text-slate-700">Número: <b>{maskPhone(data?.phone)}</b></p><p className="text-xs text-slate-500">O bot e o atendimento estão usando este número.</p></>}
        {s === 'qr_pending' && (data?.qrDataUrl
          ? <><img src={data.qrDataUrl} alt="QR Code para conectar o WhatsApp" className="mx-auto w-56 h-56" /><p className="text-xs text-slate-500">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para este código.</p></>
          : <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Gerando QR Code…</div>)}
        {s === 'connecting' && <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Conectando…</div>}
        {(s === 'disconnected' || s === 'not_configured') && <><Badge dot>Desconectado</Badge><p className="text-xs text-slate-500">Clique em Conectar e leia o QR Code com o WhatsApp da gráfica.</p></>}
      </div>
    </Modal>
  );
};

// ── Modais auxiliares ────────────────────────────────────────────────────────
const NewConversationModal: React.FC<{ sectors: Sector[]; onClose: () => void; onStarted: (id: string) => void }> = ({ sectors, onClose, onStarted }) => {
  const toast = useToast();
  const [f, setF] = useState({ phone: '', name: '', message: '', sectorId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (saving) return;
    if (digits(f.phone).length < 10) { setError('Informe o telefone com DDD.'); return; }
    if (!f.message.trim()) { setError('Escreva a primeira mensagem.'); return; }
    setSaving(true); setError('');
    try { const r = await api.post<{ id: string }>('/wpp/start', f); toast.success('Mensagem enviada.'); onStarted(r.id); }
    catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="md" title="Nova conversa"
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} iconLeft={<Send size={14} />} onClick={send}>Enviar</Button></ModalFooter>}>
      <div className="grid gap-3">
        <Input label="WhatsApp do cliente" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} inputMode="tel" placeholder="(15) 99999-9999" autoFocus />
        <Input label="Nome (opcional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Select label="Setor (opcional)" value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })} placeholder="Sem setor" options={sectors.map((s) => ({ value: s.id, label: s.name }))} />
        <Textarea label="Mensagem" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={4} />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

const TransferModal: React.FC<{ convId: string; sectors: Sector[]; current?: string | null; currentAttendantId?: string | null; onClose: () => void; onDone: () => void }> = ({ convId, sectors, current, currentAttendantId, onClose, onDone }) => {
  const toast = useToast();
  const people = useLoad(() => api.get<{ id: string; name: string; role: string; hasWhatsapp: boolean }[]>('/wpp/attendants'), []);
  const [mode, setMode] = useState<'pessoa' | 'setor'>('pessoa');
  const [userId, setUserId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [saving, setSaving] = useState(false);
  const target = mode === 'pessoa' ? userId : sectorId;
  const go = async () => {
    if (!target || saving) return;
    setSaving(true);
    try {
      const r = await api.post<{ to?: string }>(`/wpp/conversations/${convId}/transfer`, mode === 'pessoa' ? { userId } : { sectorId });
      toast.success(mode === 'pessoa' ? `Transferido para ${r.to}.` : 'Conversa transferida para o setor.');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  const chosen = people.data?.find((p) => p.id === userId);
  return (
    <Modal isOpen onClose={onClose} size="sm" title="Transferir atendimento"
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" disabled={!target} loading={saving} onClick={go}>Transferir</Button></ModalFooter>}>
      <div className="space-y-3">
        <FilterLineSegmented<string> size="sm" value={mode} onChange={(v) => setMode(v as 'pessoa' | 'setor')} options={[{ value: 'pessoa', label: 'Para uma pessoa' }, { value: 'setor', label: 'Para um setor' }]} />
        {mode === 'pessoa' ? (
          <>
            <Select label="Quem vai atender" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={people.loading ? 'Carregando…' : 'Escolha a pessoa'}
              options={(people.data ?? []).filter((p) => p.id !== currentAttendantId).map((p) => ({ value: p.id, label: p.name }))} />
            <p className="text-xs text-slate-500">A pessoa assume na hora, sem passar pela fila.{chosen && !chosen.hasWhatsapp ? ' Ela não tem WhatsApp cadastrado: verá a conversa só no painel.' : ' Se tiver WhatsApp cadastrado, recebe o aviso e pode responder por lá.'}</p>
            {people.error && <p className="text-xs text-red-600">{people.error}</p>}
          </>
        ) : (
          <>
            <Select label="Setor" value={sectorId} onChange={(e) => setSectorId(e.target.value)} placeholder="Escolha o setor" options={sectors.filter((s) => s.isActive && s.id !== current).map((s) => ({ value: s.id, label: s.name }))} />
            <p className="text-xs text-slate-500">O cliente volta para a fila do setor e os atendentes dele são avisados.</p>
          </>
        )}
      </div>
    </Modal>
  );
};

const LinkCustomerModal: React.FC<{ conv: ConversationDetail; onClose: () => void; onDone: () => void }> = ({ conv, onClose, onDone }) => {
  const toast = useToast();
  const { data } = useLoad(() => api.get<Customer[]>('/customers'), []);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);
  const go = async (create: boolean) => {
    if (saving) return;
    setSaving(true);
    try { await api.post(`/wpp/conversations/${conv.id}/customer`, create ? { name: conv.clientName } : { customerId }); toast.success(create ? 'Cliente cadastrado e vinculado.' : 'Cliente vinculado.'); onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="sm" title="Vincular a um cliente"
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" disabled={!customerId} loading={saving} onClick={() => go(false)}>Vincular</Button></ModalFooter>}>
      <div className="space-y-3">
        <Select label="Cliente já cadastrado" value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Escolha o cliente" options={(data ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${maskPhone(c.phone)}` : ''}` }))} />
        <div className="border-t border-slate-100 pt-3"><Button variant="outline" size="sm" fullWidth loading={saving} onClick={() => go(true)}>Cadastrar {label(conv)} como novo cliente</Button></div>
      </div>
    </Modal>
  );
};

const ToOrderModal: React.FC<{ attachmentId: string; onClose: () => void }> = ({ attachmentId, onClose }) => {
  const toast = useToast();
  const { data } = useLoad(() => api.get<Order[]>('/orders?status=abertos'), []);
  const [orderId, setOrderId] = useState('');
  const [saving, setSaving] = useState(false);
  const go = async () => {
    if (!orderId || saving) return;
    setSaving(true);
    try { await api.post(`/wpp/attachments/${attachmentId}/to-order`, { orderId }); toast.success('Arquivo guardado no pedido.'); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="sm" title="Guardar arquivo em um pedido"
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" disabled={!orderId} loading={saving} onClick={go}>Guardar</Button></ModalFooter>}>
      <Select label="Pedido em aberto" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Escolha o pedido" options={(data ?? []).map((o) => ({ value: o.id, label: `#${o.number} · ${o.customer.name}` }))} />
    </Modal>
  );
};

// ── Conversa ─────────────────────────────────────────────────────────────────
/** Texto do WhatsApp: *negrito*, _itálico_, ~riscado~ e links clicáveis. */
const waFormat = (text: string, linkClass: string): React.ReactNode[] => {
  const re = /(https?:\/\/[^\s]+)|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  const out: React.ReactNode[] = [];
  let last = 0, n = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = n++;
    if (m[1]) out.push(<a key={k} href={m[1]} target="_blank" rel="noreferrer" className={cn('underline break-all', linkClass)}>{m[1]}</a>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>);
    else out.push(<s key={k}>{m[4]}</s>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const dayKey = (v: string) => new Date(v).toDateString();
const dayLabel = (v: string) => {
  const d = new Date(v), today = new Date();
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

/** Anexo dentro da conversa: imagem aparece (e amplia), áudio e vídeo tocam, PDF abre aqui, o resto baixa. */
const AttachmentView: React.FC<{ a: NonNullable<ChatMessage['attachment']>; dark: boolean }> = ({ a, dark }) => {
  const [open, setOpen] = useState(false);
  const url = fileUrl(a.id);
  const isImg = a.mime.startsWith('image/'), isAudio = a.mime.startsWith('audio/'), isVideo = a.mime.startsWith('video/'), isPdf = a.mime.includes('pdf');
  const link = cn('underline-offset-2 hover:underline', dark ? 'text-white' : 'text-blue-700');
  return (
    <div className="space-y-1">
      {isImg && (
        <button type="button" className="block" onClick={() => setOpen(true)} aria-label={`Ampliar ${a.name}`}>
          <img src={url} alt={a.name} loading="lazy" className="max-h-60 max-w-full rounded-lg object-cover" />
        </button>
      )}
      {isAudio && <audio controls preload="none" src={url} className="h-9 w-64 max-w-full" aria-label={`Áudio ${a.name}`} />}
      {isVideo && <video controls preload="metadata" src={url} className="max-h-60 max-w-full rounded-lg" aria-label={`Vídeo ${a.name}`} />}
      <div className="flex items-center gap-2 text-[12px]">
        {!isImg && !isAudio && !isVideo && <FileText size={16} className="shrink-0" />}
        <span className="break-all">{isAudio ? 'Áudio' : a.name}</span>
        <span className="text-[11px] opacity-70 whitespace-nowrap">{fileSize(a.size)}</span>
        {isPdf && <button type="button" className={link} onClick={() => setOpen(true)}>Ver</button>}
        <a href={fileUrl(a.id, true)} className={link} download>Baixar</a>
        {!isPdf && !isImg && !isAudio && !isVideo && <a href={url} target="_blank" rel="noreferrer" className={link}>Abrir</a>}
      </div>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} size="xl" title={a.name} footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Fechar</Button><a href={fileUrl(a.id, true)} download><Button size="sm" variant="outline">Baixar</Button></a></ModalFooter>}>
          {isImg ? <img src={url} alt={a.name} className="mx-auto max-h-[70vh] max-w-full object-contain" /> : <iframe title={a.name} src={url} className="w-full h-[70vh] bg-slate-100 rounded" />}
        </Modal>
      )}
    </div>
  );
};

const Bubble: React.FC<{ m: ChatMessage; first: boolean; onToOrder: (id: string) => void }> = ({ m, first, onToOrder }) => {
  if (m.fromRole === 'system') return <div className="text-center py-1"><span className="inline-block text-[11px] text-slate-500 bg-white/90 border border-slate-200 rounded-full px-3 py-1">{m.body}</span></div>;
  const mine = m.fromRole !== 'client';
  const dark = m.fromRole === 'attendant';
  const tone = m.fromRole === 'client' ? 'bg-white border-slate-200 text-slate-800' : m.fromRole === 'bot' ? 'bg-blue-50 border-blue-100 text-slate-800' : 'bg-blue-600 border-blue-600 text-white';
  const radius = mine ? cn('rounded-2xl', first && 'rounded-tr-sm') : cn('rounded-2xl', first && 'rounded-tl-sm');
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start', first ? 'mt-2' : 'mt-0.5')}>
      <div className={cn('bubble px-3 py-1.5 text-[13px] leading-relaxed border shadow-[0_1px_0_rgba(15,23,42,0.04)]', radius, tone)}>
        {first && m.fromRole === 'bot' && <p className="flex items-center gap-1 text-[10px] font-medium text-blue-600 mb-0.5"><Bot size={10} />Pixel IA</p>}
        {first && m.fromRole === 'attendant' && <p className="text-[10px] font-medium text-blue-100 mb-0.5">Atendente</p>}
        {m.attachment ? (
          <div className="space-y-1">
            <AttachmentView a={m.attachment} dark={dark} />
            {(() => {
              // legenda do cliente/atendente e transcrição do áudio (o texto "📎 nome" automático não precisa repetir)
              const text = m.body.replace(`📎 ${m.attachment!.name}`, '').replace(/^🎤 Áudio$/, '').trim();
              return text ? <p className={cn('whitespace-pre-wrap break-words', text.startsWith('🎤') && 'italic opacity-90')}>{waFormat(text, dark ? 'text-white' : 'text-blue-700')}</p> : null;
            })()}
            {m.fromRole === 'client' && !m.attachment.orderId && <button className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600" onClick={() => onToOrder(m.attachment!.id)}><FolderInput size={11} />Guardar em um pedido</button>}
          </div>
        ) : <span>{waFormat(m.body, dark ? 'text-white' : 'text-blue-700')}</span>}
        <span className={cn('float-right ml-3 mt-1.5 text-[10px] leading-none', dark ? 'text-blue-100' : 'text-slate-400')}>{timeLabel(m.sentAt)}</span>
        <span className="clear-both block" />
      </div>
    </div>
  );
};

const Chat: React.FC<{ id: string; user: User; sectors: Sector[]; onBack: () => void; onChanged: () => void }> = ({ id, user, sectors, onBack, onChanged }) => {
  const toast = useToast();
  const { data: c, loading, error, reload } = useLoad(() => api.get<ConversationDetail>(`/wpp/conversations/${id}`), [id]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState<'transfer' | 'link' | 'close' | 'notes' | null>(null);
  const [toOrder, setToOrder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  usePoll(() => reload(true), 4000);
  useEffect(() => { setText(''); }, [id]);
  const count = c?.messages.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [count, id]);

  const mine = c?.status === 'active' && (!c.attendantId || c.attendantId === user.id);
  const refresh = () => { reload(true); onChanged(); };

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try { await api.post(`/wpp/conversations/${id}/messages`, { text: t }); setText(''); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };
  const sendFile = async (f: File | undefined) => {
    if (!f || sending) return;
    setSending(true);
    try { const form = new FormData(); form.append('file', f); await api.post(`/wpp/conversations/${id}/files`, form); toast.success('Arquivo enviado.'); refresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setSending(false); if (file.current) file.current.value = ''; }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); toast.success(ok); setModal(null); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (loading && !c) return <div role="status" className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando conversa…</div>;
  if (error || !c) return <div className="flex-1 flex items-center justify-center"><EmptyState icon={MessageCircle} title="Não foi possível abrir a conversa" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /></div>;

  const st = statusBadge[c.status];
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
        <IconButton variant="ghost" size="sm" className="md:hidden" aria-label="Voltar para a lista" onClick={onBack}><ArrowLeft /></IconButton>
        <span className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center shrink-0">{initials(label(c))}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-900 truncate">{label(c)}</p>
          <p className="text-[11px] text-slate-500 truncate">{[digits(c.clientPhone).length >= 10 ? maskPhone(c.clientPhone) : '', c.sector?.name, c.attendantName && `com ${c.attendantName}`].filter(Boolean).join(' · ')}</p>
        </div>
        <Badge size="sm" dot color={st.color}>{st.label}</Badge>
        <div className="flex gap-1 flex-wrap">
          {(c.status === 'waiting' || c.status === 'bot') && <Button size="xs" iconLeft={<UserCheck size={12} />} loading={busy} onClick={() => run(() => api.post(`/wpp/conversations/${id}/accept`), 'Você assumiu o atendimento.')}>Assumir</Button>}
          <Button size="xs" variant="outline" iconLeft={<NotebookPen size={12} />} onClick={() => setModal('notes')}>Anotações</Button>
          {c.status !== 'closed' && <Button size="xs" variant="outline" iconLeft={<Shuffle size={12} />} onClick={() => setModal('transfer')}>Transferir</Button>}
          {c.status === 'active' && mine && <Button size="xs" variant="outline" iconLeft={<XCircle size={12} />} onClick={() => setModal('close')}>Encerrar</Button>}
        </div>
      </header>

      <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
        {c.customer
          ? <span>Cliente: <b className="font-medium text-slate-800">{c.customer.name}</b></span>
          : <><span>Contato ainda não é um cliente cadastrado.</span><button className="flex items-center gap-1 text-blue-600 hover:underline" onClick={() => setModal('link')}><Link2 size={11} />Vincular</button></>}
        {c.subject && <span className="text-slate-500">· Assunto: {c.subject}</span>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto chat-bg p-3" role="log" aria-live="polite" aria-label="Mensagens da conversa">
        {c.messages.map((m, i) => {
          const prev = c.messages[i - 1];
          const newDay = !prev || dayKey(prev.sentAt) !== dayKey(m.sentAt);
          const first = newDay || !prev || prev.fromRole !== m.fromRole || prev.fromRole === 'system';
          return (
            <React.Fragment key={m.id}>
              {newDay && <div className="text-center py-2 sticky top-0 z-[1]"><span className="inline-block text-[11px] font-medium text-slate-600 bg-white/95 border border-slate-200 rounded-full px-3 py-0.5 shadow-sm capitalize">{dayLabel(m.sentAt)}</span></div>}
              <Bubble m={m} first={first} onToOrder={setToOrder} />
            </React.Fragment>
          );
        })}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-slate-200 bg-white p-2">
        {mine ? (
          <div className="flex items-end gap-2">
            <input ref={file} type="file" className="hidden" aria-label="Escolher arquivo para enviar" onChange={(e) => sendFile(e.target.files?.[0])} />
            <IconButton variant="outline" size="md" aria-label="Anexar arquivo" disabled={sending} onClick={() => file.current?.click()}><Paperclip /></IconButton>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} aria-label="Mensagem" placeholder="Escreva uma mensagem…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              className="flex-1 min-h-[34px] max-h-32 resize-y rounded-md border border-zinc-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10" />
            <Button size="md" loading={sending} disabled={!text.trim()} iconLeft={<Send size={14} />} onClick={send}>Enviar</Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-1.5 flex items-center justify-center gap-1.5">
            <Clock size={12} />{c.status === 'closed' ? 'Conversa encerrada.' : c.status === 'active' ? `Atendimento de ${c.attendantName}.` : 'Assuma o atendimento para responder.'}
          </p>
        )}
      </footer>

      {modal === 'transfer' && <TransferModal convId={id} sectors={sectors} current={c.sector?.id} currentAttendantId={c.attendantId} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {modal === 'notes' && (
        <Modal isOpen onClose={() => setModal(null)} size="lg" title={`Anotações · ${label(c)}`} footer={<ModalFooter align="left"><Button variant="ghost" size="sm" onClick={() => setModal(null)}>Fechar</Button></ModalFooter>}>
          <NotesPanel conversationId={id} customerId={c.customerId ?? undefined} canGenerate />
        </Modal>
      )}
      {modal === 'link' && <LinkCustomerModal conv={c} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {toOrder && <ToOrderModal attachmentId={toOrder} onClose={() => { setToOrder(null); reload(true); }} />}
      <ConfirmModal isOpen={modal === 'close'} onClose={() => setModal(null)} loading={busy} variant="primary" title="Encerrar atendimento?" confirmLabel="Encerrar"
        message="O cliente recebe um aviso de encerramento e volta para o menu do bot na próxima mensagem." onConfirm={() => run(() => api.post(`/wpp/conversations/${id}/close`), 'Atendimento encerrado.')} />
    </div>
  );
};

// ── Tela ─────────────────────────────────────────────────────────────────────
const Whatsapp: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const tab: ListTab = (whatsappTabs.some((t) => t.id === tabParam) ? tabParam : 'fila') as ListTab;
  const tabInfo = whatsappTabs.find((t) => t.id === tab)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => api.get<{ items: Conversation[]; counts: { waiting: number; active: number; bot: number } }>(`/wpp/conversations?tab=${apiTab[tab]}`), [tab]);
  useEffect(() => { setSelected(null); }, [tab]); // trocou de submenu: fecha a conversa aberta
  const status = useLoad(() => api.get<WppSession>('/wpp/status'), []);
  const sectors = useLoad(() => api.get<Sector[]>('/bot/sectors'), []);
  const refresh = useCallback(() => { list.reload(true); }, [list]);
  usePoll(() => { list.reload(true); status.reload(true); }, 5000);

  const items = list.data?.items ?? [];
  const counts = list.data?.counts;
  const disconnected = status.data && status.data.status !== 'connected';

  return (
    <PageWrapper>
      <div className="space-y-3">
        <SectionTitle title={`WhatsApp · ${tabInfo.name}`} icon={MessageCircle} description={counts ? `${counts.waiting} na fila · ${counts.active} em atendimento · ${counts.bot} com o bot` : 'Atendimento dos clientes'}
          action={<div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" iconLeft={<QrCode size={14} />} onClick={() => setConnect(true)}>Conexão</Button>
            <Button size="sm" iconLeft={<Plus size={14} />} disabled={!!disconnected} title={disconnected ? 'Conecte o WhatsApp primeiro' : ''} onClick={() => setCreating(true)}>Nova conversa</Button>
          </div>} />
        {disconnected && <Alert variant="warning" title="WhatsApp desconectado">O bot e o atendimento estão parados. <button className="underline font-medium" onClick={() => setConnect(true)}>Conectar agora</button>.</Alert>}

        <ContentCard padding="none" className="overflow-hidden">
          <div className="flex h-[calc(100dvh-17rem)] min-h-[420px]">
            <aside className={cn('w-full md:w-80 md:border-r border-slate-200 flex-col min-h-0 shrink-0', selected ? 'hidden md:flex' : 'flex')}>
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><tabInfo.icon size={14} className="text-blue-600" />{tabInfo.name}</h3>
                <span className="text-[11px] text-slate-400">{items.length} conversa(s)</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {list.loading && !list.data && <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando…</div>}
                {list.error && <EmptyState icon={MessageCircle} title="Não foi possível carregar" description={list.error} action={<Button size="sm" onClick={() => list.reload()}>Tentar novamente</Button>} />}
                {list.data && items.length === 0 && <EmptyState icon={MessageCircle} title="Nenhuma conversa" description={emptyText[tab]} />}
                <ul>
                  {items.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => setSelected(c.id)} className={cn('w-full text-left px-3 py-2.5 flex gap-2.5 border-b border-slate-100 hover:bg-slate-50', selected === c.id && 'bg-blue-50/60')}>
                        <span className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center shrink-0">{initials(label(c))}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium text-slate-900 truncate">{label(c)}</span><span className="text-[10px] text-slate-400 whitespace-nowrap">{c.last ? timeLabel(c.last.sentAt) : ''}</span></span>
                          <span className="block text-[11px] text-slate-500 truncate">{c.last ? `${c.last.fromRole === 'client' ? '' : 'Você: '}${c.last.body}` : c.firstMessage}</span>
                          <span className="flex gap-1 mt-1">{c.sector && <Badge size="sm">{c.sector.name}</Badge>}<Badge size="sm" dot color={statusBadge[c.status].color}>{statusBadge[c.status].label}</Badge></span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
            <section className={cn('flex-1 min-w-0 flex-col', selected ? 'flex' : 'hidden md:flex')}>
              {selected
                ? <Chat key={selected} id={selected} user={user} sectors={sectors.data ?? []} onBack={() => setSelected(null)} onChanged={refresh} />
                : <div className="flex-1 flex items-center justify-center"><EmptyState icon={MessageCircle} title="Escolha uma conversa" description="Selecione um cliente na lista para ver as mensagens e responder." /></div>}
            </section>
          </div>
        </ContentCard>
      </div>
      {connect && <ConnectModal onClose={() => { setConnect(false); status.reload(true); }} />}
      {creating && <NewConversationModal sectors={sectors.data ?? []} onClose={() => setCreating(false)} onStarted={(id) => { setCreating(false); if (tab !== 'abertos' && tab !== 'meus') navigate('/whatsapp/meus'); setSelected(id); refresh(); }} />}
    </PageWrapper>
  );
};

export default Whatsapp;
