import React, { useMemo, useState } from 'react';
import { Bot, Settings2, ListTree, Building2, BookOpen, Sparkles, Plus, Pencil, Trash2, Star, Loader2, CheckCircle2, XCircle, KeyRound, ChevronRight, Store } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, PanelCard, Tabs, Button, IconButton, Modal, ModalFooter, ConfirmModal, Input, Textarea, Select, Switch, Badge, EmptyState, Alert,
  FilterLineSegmented, useToast,
} from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { maskPhone, maskDocument, digits } from '../utils/format';
import { resetCompanyCache } from '../src/hooks/useCompany';
import type { Company, BotConfig, FlowNode, FlowOption, Knowledge, Sector, Attendant, AiProvider } from '../types';

const tabs = [
  { id: 'geral', label: 'Geral', icon: Settings2 },
  { id: 'empresa', label: 'Empresa', icon: Store },
  { id: 'menus', label: 'Menus', icon: ListTree },
  { id: 'setores', label: 'Setores', icon: Building2 },
  { id: 'conhecimento', label: 'Conhecimento', icon: BookOpen },
  { id: 'ia', label: 'Inteligência', icon: Sparkles },
] as const;
const tabIds = tabs.map((t) => t.id);

const Loading: React.FC<{ text?: string }> = ({ text = 'Carregando…' }) => <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />{text}</div>;
const LoadError: React.FC<{ error: string; retry: () => void }> = ({ error, retry }) => <EmptyState icon={Bot} title="Não foi possível carregar" description={error} action={<Button onClick={retry}>Tentar novamente</Button>} />;

const SaveBar: React.FC<{ dirty: boolean; saving: boolean; onSave: () => void }> = ({ dirty, saving, onSave }) => (
  <div className="flex justify-end pt-3 border-t border-slate-100"><Button size="sm" loading={saving} disabled={!dirty} onClick={onSave}>{dirty ? 'Salvar alterações' : 'Tudo salvo'}</Button></div>
);

// ── Geral ────────────────────────────────────────────────────────────────────
/** Encerramento por inatividade, boas-vindas a quem volta e pergunta do nome. */
const Rhythm: React.FC<{ data: BotConfig; onSaved: (c: BotConfig) => void }> = ({ data, onSaved }) => {
  const toast = useToast();
  const [d, setD] = useState({
    idleCloseMin: String(data.idleCloseMin), idleCloseMsg: data.idleCloseMsg ?? '', returnAfterMin: String(data.returnAfterMin), welcomeBackMsg: data.welcomeBackMsg ?? '', askName: data.askName,
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await api.put<BotConfig>('/bot/config', { ...d, idleCloseMin: Number(d.idleCloseMin) || 0, returnAfterMin: Number(d.returnAfterMin) || 60 }));
      toast.success('Salvo.');
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <PanelCard title="Encerramento e retorno do cliente" description="Quanto tempo esperar antes de encerrar o atendimento e como receber quem volta a falar com a gráfica.">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Encerrar atendimento sem mensagens após (min)" inputMode="numeric" value={d.idleCloseMin} onChange={(e) => set({ idleCloseMin: e.target.value.replace(/\D/g, '') })} hint="Vale para o atendimento já aceito por uma pessoa. 0 = nunca encerrar sozinho." />
          <Input label="Cliente “voltou” após (min)" inputMode="numeric" value={d.returnAfterMin} onChange={(e) => set({ returnAfterMin: e.target.value.replace(/\D/g, '') })} hint="Passado esse tempo sem conversa, um novo “oi” é recebido como retorno (e conversas só com o bot são encerradas)." />
        </div>
        <Textarea label="Aviso ao cliente ao encerrar por inatividade" rows={3} value={d.idleCloseMsg} onChange={(e) => set({ idleCloseMsg: e.target.value })} placeholder="Como não recebemos resposta há um tempo, encerramos este atendimento por aqui. 💙 Se ainda estiver por aí ou precisar de algo, é só mandar uma mensagem que a gente retoma!" hint="Vazio = usa a mensagem padrão acima. Dá para usar {nome}." />
        <Textarea label="Boas-vindas a quem volta" rows={2} value={d.welcomeBackMsg} onChange={(e) => set({ welcomeBackMsg: e.target.value })} placeholder="{saudacao}, {nome}! Que bom te ver de volta. 😊 Como posso te ajudar hoje?" hint="Vazio = usa a mensagem padrão acima. Variáveis: {saudacao} e {nome}." />
        <label className="flex items-center justify-between gap-3 py-1">
          <span><span className="block text-[13px] text-slate-800">Perguntar o nome quando não tiver</span><span className="block text-xs text-slate-500">Se o WhatsApp não mostra um nome de verdade e o número não está cadastrado, o bot pergunta e já cadastra o cliente.</span></span>
          <Switch checked={d.askName} onCheckedChange={(v) => set({ askName: v })} aria-label="Perguntar o nome" />
        </label>
        <div className="flex justify-end"><Button size="sm" loading={saving} onClick={save}>Salvar</Button></div>
      </div>
    </PanelCard>
  );
};

const General: React.FC = () => {
  const toast = useToast();
  const { data, setData, loading, error, reload } = useLoad(() => api.get<BotConfig>('/bot/config'), [], { live: false });
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (key: 'botEnabled' | 'useButtons', value: boolean) => {
    if (saving || !data) return;
    setSaving(key);
    try { setData(await api.put<BotConfig>('/bot/config', { [key]: value })); toast.success('Salvo.'); } catch (e) { toast.error(errMsg(e)); } finally { setSaving(null); }
  };
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error} retry={() => reload()} />;

  return (
    <div className="space-y-3">
      <PanelCard title="Robô de atendimento" description="Quando ligado, o bot responde quem manda mensagem no WhatsApp da gráfica.">
        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-[13px] text-slate-800">Bot ligado</p><p className="text-xs text-slate-500">Desligado: o WhatsApp continua conectado, mas ninguém recebe resposta automática.</p></div>
            <Switch checked={data.botEnabled} disabled={saving === 'botEnabled'} onCheckedChange={(v) => toggle('botEnabled', v)} aria-label="Bot ligado" />
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-[13px] text-slate-800">Menus com botões do WhatsApp</p><p className="text-xs text-slate-500">Desligado: o menu vai como texto numerado (1, 2, 3…). Use se os botões não aparecerem no celular do cliente.</p></div>
            <Switch checked={data.useButtons} disabled={saving === 'useButtons'} onCheckedChange={(v) => toggle('useButtons', v)} aria-label="Usar botões" />
          </div>
        </div>
      </PanelCard>
      <Rhythm key={data.idleCloseMin + '-' + data.returnAfterMin + (data.askName ? 'a' : 'b')} data={data} onSaved={setData} />
      <Alert variant="info" title="Como o bot atende">
        1) Mostra o menu de botões. 2) Se o cliente escrever livremente, procura em <b>Conhecimento</b> (respostas prontas) e depois pergunta à <b>IA</b>, que consulta produtos, preços e arquivos. 3) Quando precisa de uma pessoa, coloca na fila do <b>setor</b> e avisa os atendentes.
      </Alert>
    </div>
  );
};

// ── Menus ────────────────────────────────────────────────────────────────────
const nodeTypes = [
  { value: 'menu', label: 'Menu de botões (o cliente escolhe)' }, { value: 'message', label: 'Mensagem de texto' }, { value: 'ai', label: 'Conversar com a IA' },
  { value: 'sector', label: 'Passar para um setor (atendente)' }, { value: 'end', label: 'Encerrar conversa' },
];
const typeLabel: Record<string, string> = { menu: 'Menu', message: 'Mensagem', ai: 'IA', sector: 'Setor', end: 'Encerrar' };

const NodeModal: React.FC<{ node: FlowNode | null; nodes: FlowNode[]; sectors: Sector[]; onClose: () => void; onSaved: () => void }> = ({ node, nodes, sectors, onClose, onSaved }) => {
  const toast = useToast();
  const [f, setF] = useState({ type: node?.type ?? 'menu', title: node?.title ?? '', content: node?.content ?? '', sectorId: node?.sectorId ?? '', isStart: node?.isStart ?? false, isActive: node?.isActive ?? true });
  const [options, setOptions] = useState<FlowOption[]>(node?.options ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const others = nodes.filter((n) => n.id !== node?.id);
  const setOpt = (i: number, patch: Partial<FlowOption>) => setOptions((o) => o.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (saving) return;
    if (!f.title.trim()) { setError('Dê um nome para esta tela.'); return; }
    if (f.type === 'sector' && !f.sectorId) { setError('Escolha o setor.'); return; }
    if (f.type === 'menu' && options.some((o) => !o.label.trim())) { setError('Toda opção precisa de um texto.'); return; }
    setSaving(true); setError('');
    try {
      const body = { ...f, options: options.map((o, i) => ({ ...o, key: String(i + 1) })) };
      if (node) await api.put(`/bot/nodes/${node.id}`, body); else await api.post('/bot/nodes', body);
      toast.success('Tela salva.'); onSaved();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="xl" title={node ? 'Editar tela do menu' : 'Nova tela do menu'}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></ModalFooter>}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-3">
          <Input label="Nome (só para você identificar)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          <Select label="O que esta tela faz" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FlowNode['type'] })} options={nodeTypes} />
          {f.type === 'sector' && <Select label="Setor" value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })} placeholder="Escolha o setor" options={sectors.map((s) => ({ value: s.id, label: s.name }))} />}
          <Textarea label={f.type === 'menu' ? 'Texto acima dos botões' : 'Mensagem enviada'} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={4}
            hint="Use {saudacao} (Bom dia/Boa tarde/Boa noite) e {nome} (primeiro nome do cliente). *texto* vira negrito no WhatsApp." />
          {f.type === 'menu' && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between"><h4 className="text-xs font-semibold text-slate-800">Botões ({options.length}/10)</h4>
                <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} disabled={options.length >= 10} onClick={() => setOptions((o) => [...o, { key: String(o.length + 1), label: '', nextNodeId: null }])}>Botão</Button></div>
              {options.length === 0 && <p className="text-[11px] text-slate-400">Nenhum botão ainda.</p>}
              {options.map((o, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <Input label={`Botão ${i + 1}`} value={o.label} maxLength={24} onChange={(e) => setOpt(i, { label: e.target.value })} placeholder="Ex.: Fazer orçamento" />
                  <Select label="Leva para" value={o.nextNodeId ?? ''} onChange={(e) => setOpt(i, { nextNodeId: e.target.value || null })} placeholder="Escolha a tela" options={others.map((n) => ({ value: n.id, label: `${n.title} (${typeLabel[n.type]})` }))} />
                  <IconButton variant="ghost" size="md" aria-label={`Remover botão ${i + 1}`} onClick={() => setOptions((x) => x.filter((_, idx) => idx !== i))}><Trash2 /></IconButton>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">Até 3 botões aparecem como botões; de 4 a 10 viram uma lista “Ver opções”. O texto do botão tem no máximo 24 letras.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-5 text-xs text-slate-600">
            <label className="flex items-center gap-2"><Switch checked={f.isStart} onCheckedChange={(v) => setF({ ...f, isStart: v })} aria-label="Tela inicial" />Tela inicial (o 1º que o cliente vê)</label>
            <label className="flex items-center gap-2"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} aria-label="Tela ativa" />Ativa</label>
          </div>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
        <aside aria-label="Pré-visualização" className="hidden lg:block">
          <p className="text-[11px] text-slate-500 mb-1.5">Como aparece no WhatsApp</p>
          <div className="chat-bg rounded-lg border border-slate-200 p-3 min-h-[200px]">
            <div className="bubble rounded-lg bg-white border border-slate-200 p-2.5 text-[12px] text-slate-800">
              {(f.content || '…').replace(/\{saudacao\}/gi, 'Bom dia').replace(/\{nome\}/gi, 'Maria').replace(/\*([^*]+)\*/g, '$1')}
              {f.type === 'menu' && options.length > 0 && (
                <div className="mt-2 space-y-1">{(options.length <= 3 ? options : [{ label: 'Ver opções', key: '', nextNodeId: null }]).map((o, i) => <div key={i} className="text-center text-blue-600 border-t border-slate-100 pt-1.5">{o.label || '…'}</div>)}</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
};

const Menus: React.FC = () => {
  const toast = useToast();
  const nodes = useLoad(() => api.get<FlowNode[]>('/bot/nodes'), []);
  const sectors = useLoad(() => api.get<Sector[]>('/bot/sectors'), []);
  const [editing, setEditing] = useState<FlowNode | null | undefined>(undefined);
  const [removing, setRemoving] = useState<FlowNode | null>(null);
  const [busy, setBusy] = useState(false);
  const list = nodes.data ?? [];
  const nameOf = (id?: string | null) => list.find((n) => n.id === id)?.title ?? '—';

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await api.del(`/bot/nodes/${removing.id}`); toast.success('Tela excluída.'); setRemoving(null); nodes.reload(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (nodes.loading && !nodes.data) return <Loading />;
  if (nodes.error) return <LoadError error={nodes.error} retry={() => nodes.reload()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Monte o caminho que o cliente percorre. A tela marcada com ★ é a primeira.</p>
        <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setEditing(null)}>Nova tela</Button>
      </div>
      {list.length === 0 && <ContentCard><EmptyState icon={ListTree} title="Nenhuma tela ainda" description="Crie a tela inicial com os botões do atendimento." /></ContentCard>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {list.map((n) => (
          <ContentCard key={n.id} padding="none" className={`group hover:border-blue-200 transition-all overflow-hidden flex flex-col ${n.isActive ? '' : 'opacity-60'}`}>
            <div className="p-3 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">{n.isStart && <Star size={13} className="text-amber-500 shrink-0" fill="currentColor" aria-label="Tela inicial" />}<h3 className="text-[13px] font-medium text-slate-900 truncate">{n.title}</h3></span>
                <Badge size="sm" color={n.type === 'menu' ? 'primary' : n.type === 'sector' ? 'orange' : n.type === 'ai' ? 'purple' : 'default'}>{typeLabel[n.type]}</Badge>
              </div>
              {n.content && <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">{n.content}</p>}
              {n.type === 'menu' && <ul className="space-y-1">{n.options.map((o, i) => <li key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{o.label}</span><ChevronRight size={10} className="text-slate-300" /><span className="truncate">{nameOf(o.nextNodeId)}</span></li>)}</ul>}
              {n.type === 'sector' && <p className="text-[11px] text-slate-600">Setor: {sectors.data?.find((s) => s.id === n.sectorId)?.name ?? '—'}</p>}
              {!n.isActive && <Badge size="sm">Desativada</Badge>}
            </div>
            <div className="p-2 bg-slate-50/50 border-t border-slate-100 flex gap-2">
              <Button size="xs" variant="outline" className="flex-1" iconLeft={<Pencil size={12} />} onClick={() => setEditing(n)}>Editar</Button>
              <IconButton variant="ghost" size="xs" aria-label={`Excluir ${n.title}`} onClick={() => setRemoving(n)}><Trash2 /></IconButton>
            </div>
          </ContentCard>
        ))}
      </div>
      {editing !== undefined && <NodeModal node={editing} nodes={list} sectors={sectors.data ?? []} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); nodes.reload(true); }} />}
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir tela?" confirmLabel="Excluir tela"
        message={`"${removing?.title ?? ''}" será removida e os botões que levavam até ela serão apagados dos outros menus.`} />
    </div>
  );
};

const WEEKDAYS = [{ short: 'D', full: 'Domingo' }, { short: 'S', full: 'Segunda' }, { short: 'T', full: 'Terça' }, { short: 'Q', full: 'Quarta' }, { short: 'Q', full: 'Quinta' }, { short: 'S', full: 'Sexta' }, { short: 'S', full: 'Sábado' }];
// sem dias marcados = todos os dias; ao desmarcar um dia a lista passa a ser explícita
const toggleDay = (days: number[] | undefined, n: number) => {
  const cur = days?.length ? days : [0, 1, 2, 3, 4, 5, 6];
  const next = cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n].sort();
  return next.length === 7 || next.length === 0 ? [] : next;
};

// ── Setores ──────────────────────────────────────────────────────────────────
const SectorModal: React.FC<{ sector: Sector | null; onClose: () => void; onSaved: () => void }> = ({ sector, onClose, onSaved }) => {
  const toast = useToast();
  const [f, setF] = useState({ name: sector?.name ?? '', description: sector?.description ?? '', isActive: sector?.isActive ?? true });
  const [people, setPeople] = useState<Attendant[]>((sector?.attendants ?? []).map((a) => ({ ...a, phone: maskPhone(a.phone) })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setP = (i: number, patch: Partial<Attendant>) => setPeople((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (saving) return;
    if (!f.name.trim()) { setError('Informe o nome do setor.'); return; }
    if (people.some((p) => digits(p.phone).length < 10)) { setError('Todo atendente precisa de um WhatsApp com DDD.'); return; }
    setSaving(true); setError('');
    try {
      const body = { ...f, sortOrder: sector?.sortOrder ?? 99, attendants: people };
      if (sector) await api.put(`/bot/sectors/${sector.id}`, body); else await api.post('/bot/sectors', body);
      toast.success('Setor salvo.'); onSaved();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" title={sector ? 'Editar setor' : 'Novo setor'}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></ModalFooter>}>
      <div className="space-y-3">
        <Input label="Nome do setor" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Ex.: Orçamentos" />
        <Input label="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div><h4 className="text-xs font-semibold text-slate-800">Quem atende</h4><p className="text-[11px] text-slate-500">Estas pessoas recebem o aviso no WhatsApp e aceitam respondendo 1. Também dá para assumir pelo painel.</p></div>
            <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} onClick={() => setPeople((p) => [...p, { name: '', phone: '', available: true, from: '', to: '', days: [] }])}>Pessoa</Button>
          </div>
          {people.length === 0 && <p className="text-[11px] text-slate-400">Ninguém cadastrado: os atendimentos ficam só na fila do painel.</p>}
          {people.map((p, i) => (
            <div key={i} className="space-y-2 rounded-md bg-slate-50 p-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                <Input label="Nome" value={p.name} onChange={(e) => setP(i, { name: e.target.value })} />
                <Input label="WhatsApp" value={p.phone} inputMode="tel" onChange={(e) => setP(i, { phone: maskPhone(e.target.value) })} />
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 pb-2"><Switch size="sm" checked={p.available} onCheckedChange={(v) => setP(i, { available: v })} aria-label={`${p.name || 'Atendente'} disponível`} />Disponível</label>
                <IconButton variant="ghost" size="md" aria-label="Remover pessoa" onClick={() => setPeople((x) => x.filter((_, idx) => idx !== i))}><Trash2 /></IconButton>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input label="Atende das" type="time" value={p.from ?? ''} onChange={(e) => setP(i, { from: e.target.value })} />
                <Input label="às" type="time" value={p.to ?? ''} onChange={(e) => setP(i, { to: e.target.value })} />
                <div className="flex gap-1 pb-1" role="group" aria-label="Dias de atendimento">
                  {WEEKDAYS.map((d, n) => {
                    const on = !p.days?.length || p.days.includes(n);
                    return <button key={n} type="button" aria-pressed={on} title={d.full}
                      onClick={() => setP(i, { days: toggleDay(p.days, n) })}
                      className={`h-7 w-7 rounded text-[11px] font-medium border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>{d.short}</button>;
                  })}
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Deixe os horários vazios para atender a qualquer hora. Fora do horário, não recebe aviso; se ninguém do setor estiver no horário, o bot avisa o cliente.</p>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} aria-label="Setor ativo" />Setor ativo</label>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

const Sectors: React.FC = () => {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Sector[]>('/bot/sectors'), []);
  const [editing, setEditing] = useState<Sector | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Sector | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await api.del(`/bot/sectors/${removing.id}`); toast.success('Setor excluído.'); setRemoving(null); reload(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={() => reload()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Cada setor tem uma fila e a lista de quem atende.</p><Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setEditing(null)}>Novo setor</Button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(data ?? []).map((s) => (
          <ContentCard key={s.id} padding="none" className="overflow-hidden flex flex-col hover:border-blue-200 transition-all">
            <div className="p-3 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2"><h3 className="text-[13px] font-medium text-slate-900 truncate">{s.name}</h3><Badge size="sm" dot color={s.isActive ? 'success' : 'default'}>{s.isActive ? 'Ativo' : 'Inativo'}</Badge></div>
              {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
              <p className="text-[11px] text-slate-600">{s.attendants.length ? s.attendants.map((a) => a.name).join(', ') : 'Sem atendentes no WhatsApp'}</p>
            </div>
            <div className="p-2 bg-slate-50/50 border-t border-slate-100 flex gap-2">
              <Button size="xs" variant="outline" className="flex-1" iconLeft={<Pencil size={12} />} onClick={() => setEditing(s)}>Editar</Button>
              <IconButton variant="ghost" size="xs" aria-label={`Excluir ${s.name}`} onClick={() => setRemoving(s)}><Trash2 /></IconButton>
            </div>
          </ContentCard>
        ))}
      </div>
      {editing !== undefined && <SectorModal sector={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); reload(true); }} />}
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir setor?" confirmLabel="Excluir setor"
        message={`"${removing?.name ?? ''}" será removido. As telas do menu que levavam a ele serão desativadas.`} />
    </div>
  );
};

// ── Conhecimento ─────────────────────────────────────────────────────────────
const KnowledgeModal: React.FC<{ item: Knowledge | null; sectors: Sector[]; onClose: () => void; onSaved: () => void }> = ({ item, sectors, onClose, onSaved }) => {
  const toast = useToast();
  const [f, setF] = useState({ title: item?.title ?? '', phrases: item?.phrases ?? '', answer: item?.answer ?? '', action: item?.action ?? 'reply', enabled: item?.enabled ?? true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try { if (item) await api.put(`/bot/knowledge/${item.id}`, f); else await api.post('/bot/knowledge', f); toast.success('Resposta salva.'); onSaved(); }
    catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal isOpen onClose={onClose} size="lg" title={item ? 'Editar resposta pronta' : 'Nova resposta pronta'}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></ModalFooter>}>
      <div className="space-y-3">
        <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus placeholder="Ex.: Prazo de entrega" />
        <Textarea label="Frases que o cliente costuma escrever (uma por linha)" value={f.phrases} onChange={(e) => setF({ ...f, phrases: e.target.value })} rows={4} hint="Basta a frase aparecer na mensagem. Ignora acentos e maiúsculas. Mínimo de 4 letras por frase." />
        <Textarea label="Resposta" value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} rows={5} hint="Separe parágrafos com uma linha em branco: o bot envia como mensagens separadas (até 3)." />
        <Select label="Depois de responder" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}
          options={[{ value: 'reply', label: 'Só responder' }, { value: 'menu', label: 'Mostrar o menu' }, ...sectors.map((s) => ({ value: `handoff:${s.name}`, label: `Chamar o setor ${s.name}` }))]} />
        <label className="flex items-center gap-2 text-xs text-slate-600"><Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} aria-label="Resposta ativa" />Ativa</label>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

const KnowledgeTab: React.FC = () => {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Knowledge[]>('/bot/knowledge'), []);
  const sectors = useLoad(() => api.get<Sector[]>('/bot/sectors'), []);
  const [editing, setEditing] = useState<Knowledge | null | undefined>(undefined);
  const [removing, setRemoving] = useState<Knowledge | null>(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await api.del(`/bot/knowledge/${removing.id}`); toast.success('Resposta excluída.'); setRemoving(null); reload(true); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={() => reload()} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Respostas prontas: mais rápidas e exatas que a IA. Ótimas para horário, endereço, formas de pagamento…</p><Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setEditing(null)}>Nova resposta</Button></div>
      <ContentCard padding="none">
        {(data ?? []).length === 0 ? <EmptyState icon={BookOpen} title="Nenhuma resposta pronta" description="Cadastre as perguntas mais comuns dos clientes." /> : (
          <ul className="divide-y divide-slate-100">
            {(data ?? []).map((k) => (
              <li key={k.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-[13px] text-slate-800 flex items-center gap-2">{k.title}{!k.enabled && <Badge size="sm">Desativada</Badge>}{k.action.startsWith('handoff:') && <Badge size="sm" color="orange">Chama {k.action.slice(8)}</Badge>}</p>
                  <p className="text-[11px] text-slate-500 truncate">{k.phrases.split('\n').slice(0, 4).join(' · ')}</p>
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{k.hits} uso(s)</span>
                <div className="flex gap-0.5">
                  <IconButton variant="ghost" size="xs" aria-label={`Editar ${k.title}`} onClick={() => setEditing(k)}><Pencil /></IconButton>
                  <IconButton variant="ghost" size="xs" aria-label={`Excluir ${k.title}`} onClick={() => setRemoving(k)}><Trash2 /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>
      {editing !== undefined && <KnowledgeModal item={editing} sectors={sectors.data ?? []} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); reload(true); }} />}
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir resposta?" confirmLabel="Excluir resposta" message={`"${removing?.title ?? ''}" será removida.`} />
    </div>
  );
};

// ── Inteligência (chave + modelo) ────────────────────────────────────────────
const CUSTOM = '__custom__';
interface TestResult { ok: boolean; provider: AiProvider; model: string; reply?: string; error?: string }

const Intelligence: React.FC = () => {
  const toast = useToast();
  const { data: cfg, setData, loading, error, reload } = useLoad(() => api.get<BotConfig>('/bot/config'), [], { live: false });
  const [draft, setDraft] = useState<{ provider: AiProvider; enabled: boolean; prompt: string; geminiModel: string; openaiModel: string; geminiKey: string; openaiKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [removeKey, setRemoveKey] = useState<AiProvider | null>(null);

  // inicia o rascunho quando a configuração chega
  const d = useMemo(() => draft ?? (cfg ? { provider: cfg.aiProvider, enabled: cfg.aiEnabled, prompt: cfg.aiPrompt ?? '', geminiModel: cfg.geminiModel, openaiModel: cfg.openaiModel, geminiKey: '', openaiKey: '' } : null), [draft, cfg]);
  if (loading && !cfg) return <Loading />;
  if (error || !cfg || !d) return <LoadError error={error} retry={() => reload()} />;

  const set = (patch: Partial<typeof d>) => { setDraft({ ...d, ...patch }); setResult(null); };
  const p = d.provider;
  const presets = cfg.presets[p];
  const model = p === 'openai' ? d.openaiModel : d.geminiModel;
  const isPreset = presets.some((x) => x.value === model);
  const hasKey = p === 'openai' ? cfg.hasOpenaiKey : cfg.hasGeminiKey;
  const typedKey = p === 'openai' ? d.openaiKey : d.geminiKey;
  const dirty = !!draft;

  const persist = async (extra: Record<string, unknown> = {}) => {
    const saved = await api.put<BotConfig>('/bot/config', {
      aiProvider: d.provider, aiEnabled: d.enabled, aiPrompt: d.prompt, geminiModel: d.geminiModel, openaiModel: d.openaiModel,
      ...(d.geminiKey ? { geminiApiKey: d.geminiKey } : {}), ...(d.openaiKey ? { openaiApiKey: d.openaiKey } : {}), ...extra,
    });
    setData(saved); setDraft(null);
    return saved;
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await persist(); toast.success('Configuração da IA salva.'); } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  const saveAndTest = async () => {
    if (testing) return;
    setTesting(true); setResult(null);
    try { if (dirty) await persist(); setResult(await api.post<TestResult>('/bot/test-ai')); } catch (e) { setResult({ ok: false, provider: p, model, error: errMsg(e) }); } finally { setTesting(false); }
  };
  const dropKey = async () => {
    if (!removeKey) return;
    try { await persist(removeKey === 'openai' ? { clearOpenaiKey: true } : { clearGeminiKey: true }); toast.success('Chave removida.'); setRemoveKey(null); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-3">
      <Alert variant="info" title="A IA é opcional e usa a sua chave">
        Cole a chave da API do provedor que preferir. O custo das mensagens é cobrado direto na conta do provedor. Sem chave, o bot segue com menus e respostas prontas.
      </Alert>

      <PanelCard title="Provedor e modelo" icon={Sparkles}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <FilterLineSegmented<string> size="sm" value={p} onChange={(v) => set({ provider: v as AiProvider })} options={[{ value: 'gemini', label: 'Google Gemini' }, { value: 'openai', label: 'ChatGPT (OpenAI)' }]} />
            <label className="flex items-center gap-2 text-xs text-slate-600"><Switch checked={d.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="IA ligada" />IA responde os clientes</label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Input label={`Chave da API ${p === 'openai' ? 'da OpenAI' : 'do Gemini'}`} type="password" autoComplete="off" iconLeft={<KeyRound size={14} />}
                value={typedKey} onChange={(e) => set(p === 'openai' ? { openaiKey: e.target.value } : { geminiKey: e.target.value })}
                placeholder={hasKey ? '•••••••• (chave já salva — deixe vazio para manter)' : p === 'openai' ? 'sk-…' : 'AIza…'}
                hint={p === 'openai' ? 'Crie em platform.openai.com › API keys.' : 'Crie em aistudio.google.com › Get API key.'} />
              {hasKey && !typedKey && <div className="flex items-center gap-2 mt-1.5"><Badge size="sm" dot color="success">Chave salva</Badge><button className="text-[11px] text-red-600 hover:underline" onClick={() => setRemoveKey(p)}>Remover chave</button></div>}
            </div>
            <div className="space-y-2">
              <Select label="Modelo" value={isPreset ? model : CUSTOM}
                onChange={(e) => { const v = e.target.value; set(p === 'openai' ? { openaiModel: v === CUSTOM ? '' : v } : { geminiModel: v === CUSTOM ? '' : v }); }}
                options={[...presets, { value: CUSTOM, label: 'Outro (digitar o nome do modelo)' }]} />
              {!isPreset && <Input aria-label="Nome do modelo" value={model} placeholder="Nome exato do modelo" onChange={(e) => set(p === 'openai' ? { openaiModel: e.target.value } : { geminiModel: e.target.value })} />}
            </div>
          </div>

          <Textarea label="Orientações da gráfica para a IA (opcional)" rows={4} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })}
            hint="Tom de voz, regras da casa, o que não prometer. A IA já sabe consultar produtos, preços e arquivos." />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" loading={testing} iconLeft={<CheckCircle2 size={14} />} onClick={saveAndTest}>{dirty ? 'Salvar e testar conexão' : 'Testar conexão'}</Button>
            <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>{dirty ? 'Salvar alterações' : 'Tudo salvo'}</Button>
          </div>
          {result && (
            <div role={result.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-xs flex gap-2 ${result.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {result.ok ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
              <div><p className="font-medium">{result.ok ? `Conectado ao ${result.provider === 'openai' ? 'ChatGPT' : 'Gemini'} (${result.model})` : 'Não foi possível conectar'}</p><p className="mt-0.5 break-words">{result.ok ? `Resposta de teste: “${result.reply}”` : result.error}</p></div>
            </div>
          )}
        </div>
      </PanelCard>
      <ConfirmModal isOpen={!!removeKey} onClose={() => setRemoveKey(null)} onConfirm={dropKey} variant="danger" title="Remover a chave?" confirmLabel="Remover chave"
        message="A IA deixa de responder até você cadastrar outra chave. Menus e respostas prontas continuam funcionando." />
    </div>
  );
};

// ── Empresa ──────────────────────────────────────────────────────────────────
const companyFields: { key: keyof Company; label: string; rows?: number; hint?: string; placeholder?: string; mask?: (v: string) => string; inputMode?: 'numeric' | 'tel' }[] = [
  { key: 'name', label: 'Nome da empresa', placeholder: 'Pixel Gráfica Tatuí' },
  { key: 'tagline', label: 'Slogan', placeholder: 'Qualidade que valoriza a sua marca!' },
  { key: 'document', label: 'CNPJ', placeholder: '00.000.000/0000-00', mask: maskDocument, inputMode: 'numeric' },
  { key: 'address', label: 'Endereço completo', placeholder: 'Rua, número, bairro, cidade e ponto de referência' },
  { key: 'phone', label: 'Telefone / WhatsApp da loja', placeholder: '(15) 99999-9999', mask: maskPhone, inputMode: 'tel' },
  { key: 'email', label: 'E-mail' },
  { key: 'instagram', label: 'Instagram', placeholder: '@pixelgraficatatui' },
  { key: 'website', label: 'Site' },
  { key: 'hours', label: 'Horário de funcionamento', rows: 2, placeholder: 'Segunda a sexta, 8h às 18h · Sábado, 8h às 12h' },
  { key: 'payment', label: 'Formas de pagamento e condições', rows: 3, placeholder: 'Pix, cartão de débito e crédito, dinheiro. Para serviços maiores, 50% na aprovação e o restante na retirada.' },
  { key: 'delivery', label: 'Retirada, entrega e frete', rows: 3, placeholder: 'Retirada na loja sem custo. Entregamos em Tatuí; o frete é combinado pelo bairro.' },
  { key: 'artService', label: 'Criação de arte', rows: 3, placeholder: 'Fazemos a arte também. O valor depende da peça; a criação envia a prova para aprovação.' },
  { key: 'notes', label: 'Outras informações que a IA deve saber', rows: 4, hint: 'Regras da casa, prazos gerais, políticas de troca… Só escreva o que for verdade: a IA repete ao cliente.' },
];

const CompanyTab: React.FC = () => {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Company>('/company'), [], { live: false });
  const [draft, setDraft] = useState<Partial<Company> | null>(null);
  const [saving, setSaving] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error} retry={() => reload()} />;
  const value = (k: keyof Company) => {
    const raw = String((draft?.[k] ?? data[k] ?? '') as string);
    const mask = companyFields.find((f) => f.key === k)?.mask;
    return mask ? mask(raw) : raw;
  };
  const save = async () => {
    if (saving || !draft) return;
    setSaving(true);
    try { await api.put('/company', draft); resetCompanyCache(); setDraft(null); reload(true); toast.success('Dados da empresa salvos.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-3">
      <Alert variant="info" title="Estes são os dados reais da gráfica">
        A Pixel IA usa só o que estiver preenchido aqui para falar da empresa, e as respostas prontas (horário, endereço, pagamento, entrega, contato) também. Campo vazio = a IA diz que vai confirmar com a equipe. Os PDFs de orçamento e ordem de serviço usam nome, slogan e contato.
      </Alert>
      <PanelCard title="Dados da empresa" icon={Store}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {companyFields.map((f) => {
            const wide = !!f.rows;
            return f.rows
              ? <Textarea key={f.key} label={f.label} rows={f.rows} value={value(f.key)} placeholder={f.placeholder} hint={f.hint} wrapperClassName="sm:col-span-2" onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              : <Input key={f.key} label={f.label} value={value(f.key)} placeholder={f.placeholder} wrapperClassName={wide ? 'sm:col-span-2' : ''} inputMode={f.inputMode} onChange={(e) => setDraft({ ...draft, [f.key]: f.mask ? f.mask(e.target.value) : e.target.value })} />;
          })}
        </div>
        <SaveBar dirty={!!draft} saving={saving} onSave={save} />
      </PanelCard>
    </div>
  );
};

const BotSettings: React.FC = () => {
  const [tab, setTab] = useUrlTab(tabIds, 'geral');
  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Bot e IA" icon={Bot} description="Menus de botões, setores, respostas prontas e a Pixel IA do WhatsApp" />
        <Tabs<typeof tabs[number]['id']> items={tabs} value={tab} onChange={setTab} label="Configurações do bot">
          {tab === 'geral' && <General />}
          {tab === 'empresa' && <CompanyTab />}
          {tab === 'menus' && <Menus />}
          {tab === 'setores' && <Sectors />}
          {tab === 'conhecimento' && <KnowledgeTab />}
          {tab === 'ia' && <Intelligence />}
        </Tabs>
      </div>
    </PageWrapper>
  );
};

export default BotSettings;
