import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Loader2, Save, Building2, PieChart, Bot, Globe, SlidersHorizontal, FileText, MessageSquareText, Plus, X, RotateCcw, ChevronRight } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, Input, Textarea, Tabs, EmptyState, ConfirmModal, Alert, Badge, useToast } from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { setSettingsCache } from '../src/hooks/useSettings';
import { VariableEditor } from '../components/VariableEditor';
import { LogoCard } from '../components/LogoCard';
import { SiteSettings } from '../components/SiteSettings';
import { varsFor, sampleVars, fill } from '../utils/messages';
import { orderStages } from '../utils/format';
import type { Settings } from '../types';

type TabId = 'geral' | 'documentos' | 'mensagens' | 'site';
const tabs = [
  { id: 'geral', label: 'Geral', icon: SlidersHorizontal },
  { id: 'documentos', label: 'Documentos (PDF)', icon: FileText },
  { id: 'mensagens', label: 'Mensagens do WhatsApp', icon: MessageSquareText },
  { id: 'site', label: 'Site', icon: Globe },
] as const;

const Template: React.FC<{ label: string; value: string; onChange: (v: string) => void; kind: 'quote' | 'orderDoc' | 'payment' | 'stage' | 'ready'; rows?: number }> = ({ label, value, onChange, kind, rows = 3 }) => (
  <div className="space-y-1.5">
    <VariableEditor label={label} value={value} onChange={onChange} vars={varsFor(kind)} rows={rows} />
    <p className="text-[11px] text-slate-500"><span className="font-medium text-slate-600">Prévia:</span> {fill(value, sampleVars)}</p>
  </div>
);

/** Configurações do sistema: prazos padrão, categorias, termos dos PDFs e modelos das mensagens enviadas ao cliente. Só o administrador altera. */
const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useUrlTab(tabs.map((t) => t.id) as TabId[], 'geral');
  const { data, loading, error, reload } = useLoad(() => api.get<Settings>('/settings'), [], { live: false });
  const [s, setS] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [formError, setFormError] = useState('');
  const [newCat, setNewCat] = useState('');

  useEffect(() => { if (data) { setS(data); setDirty(false); } }, [data]);

  if ((loading && !data) || (data && !s)) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (error || !s) return <PageWrapper><ContentCard><EmptyState icon={SettingsIcon} title="Não foi possível carregar as configurações" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /></ContentCard></PageWrapper>;

  const patch = (p: Partial<Settings>) => { setS((x) => (x ? { ...x, ...p } : x)); setDirty(true); };
  const msg = (k: 'quote' | 'orderDoc' | 'payment', v: string) => patch({ messages: { ...s.messages, [k]: v } });
  const stageMsg = (k: string, v: string) => patch({ messages: { ...s.messages, stage: { ...s.messages.stage, [k]: v } } });
  const addCat = () => {
    const c = newCat.trim();
    if (!c) return;
    if (s.categories.some((x) => x.toLowerCase() === c.toLowerCase())) { setNewCat(''); return; }
    patch({ categories: [...s.categories, c] }); setNewCat('');
  };

  const save = async () => {
    if (saving) return;
    if (!(s.quoteValidityDays >= 1)) { setFormError('A validade do orçamento precisa ser de pelo menos 1 dia.'); return; }
    if (!(s.defaultLeadDays >= 0)) { setFormError('O prazo de entrega não pode ser negativo.'); return; }
    setSaving(true); setFormError('');
    try {
      const saved = await api.put<Settings>('/settings', s);
      setS(saved); setSettingsCache(saved); setDirty(false);
      toast.success('Configurações salvas.');
    } catch (e) { setFormError(errMsg(e)); } finally { setSaving(false); }
  };
  const reset = async () => {
    try {
      const saved = await api.post<Settings>('/settings/reset', {});
      setS(saved); setSettingsCache(saved); setDirty(false); setResetting(false);
      toast.success('Configurações voltaram ao padrão.');
    } catch (e) { toast.error(errMsg(e)); setResetting(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Configurações" icon={SettingsIcon} description="Ajuste como o sistema trabalha: prazos, categorias, documentos e mensagens"
          action={<div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" iconLeft={<RotateCcw size={14} />} onClick={() => setResetting(true)}>Restaurar padrão</Button>
            <Button size="sm" loading={saving} disabled={!dirty} iconLeft={<Save size={14} />} onClick={save}>Salvar alterações</Button>
          </div>} />

        <PanelCard title="Cadastros relacionados" description="Outros dados que você também ajusta" icon={Building2}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { icon: Building2, title: 'Dados da empresa', text: 'Nome, CNPJ, endereço, horário, pagamento', to: '/bot?aba=empresa' },
              { icon: PieChart, title: 'Divisão do lucro', text: 'Sócios e porcentagens', to: '/servicos/lucro' },
              { icon: Bot, title: 'Bot e IA', text: 'Menus, setores, conhecimento e chave da IA', to: '/bot' },
            ].map((l) => (
              <button key={l.to} onClick={() => navigate(l.to)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
                <l.icon size={18} className="text-blue-600 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-slate-800">{l.title}</span><span className="block text-[11px] text-slate-500 truncate">{l.text}</span></span>
                <ChevronRight size={14} className="text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </PanelCard>

        {dirty && <Alert variant="warning" title="Alterações não salvas">Clique em “Salvar alterações” para aplicar.</Alert>}

        <Tabs<TabId> items={tabs as unknown as { id: TabId; label: string; icon: typeof FileText }[]} value={tab} onChange={setTab} label="Configurações">
          {tab === 'site' && <SiteSettings />}
          {tab === 'geral' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="lg:col-span-2"><LogoCard /></div>
              <PanelCard title="Prazos padrão" description="Já vêm preenchidos ao criar um documento novo (você ainda pode trocar)" icon={SlidersHorizontal}>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Validade do orçamento (dias)" inputMode="numeric" value={String(s.quoteValidityDays)} onChange={(e) => patch({ quoteValidityDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  <Input label="Prazo de entrega da OS (dias)" inputMode="numeric" value={String(s.defaultLeadDays)} onChange={(e) => patch({ defaultLeadDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} hint="0 = sem data sugerida" />
                </div>
              </PanelCard>
              <PanelCard title="Categorias de serviço" description="Aparecem como sugestão ao lançar um serviço" icon={SlidersHorizontal}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {s.categories.length === 0 && <p className="text-xs text-slate-500">Nenhuma categoria cadastrada.</p>}
                    {s.categories.map((c) => (
                      <Badge key={c} color="primary" size="sm">
                        {c}
                        <button type="button" aria-label={`Remover ${c}`} className="ml-1 -mr-0.5 hover:text-red-600" onClick={() => patch({ categories: s.categories.filter((x) => x !== c) })}><X size={11} /></button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 items-end">
                    <Input label="Nova categoria" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} wrapperClassName="flex-1" placeholder="Ex.: Convite" />
                    <Button size="sm" variant="outline" iconLeft={<Plus size={14} />} onClick={addCat} disabled={!newCat.trim()}>Adicionar</Button>
                  </div>
                </div>
              </PanelCard>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PanelCard title="Condições do orçamento" description="Texto do bloco “Condições” no PDF do orçamento" icon={FileText}>
                <Textarea aria-label="Condições do orçamento" value={s.quoteTerms} onChange={(e) => patch({ quoteTerms: e.target.value })} rows={7} hint="Deixe vazio para não mostrar o bloco." />
              </PanelCard>
              <PanelCard title="Condições da ordem de serviço" description="Texto do bloco “Condições” no PDF da OS" icon={FileText}>
                <Textarea aria-label="Condições da ordem de serviço" value={s.orderTerms} onChange={(e) => patch({ orderTerms: e.target.value })} rows={7} hint="Opcional. Ex.: prazo para reclamações, política de retirada." />
              </PanelCard>
              <div className="lg:col-span-2"><Alert variant="info" title="O cabeçalho vem dos dados da empresa">Nome, CNPJ, endereço e contato do PDF são os de <button className="underline" onClick={() => navigate('/bot?aba=empresa')}>Dados da empresa</button>.</Alert></div>
            </div>
          )}

          {tab === 'mensagens' && (
            <div className="space-y-3">
              <Alert variant="info" title="Modelos das mensagens enviadas ao cliente">
                Antes de enviar, você ainda pode editar cada mensagem. Para colocar dados do cliente, <b>clique num badge</b> abaixo do campo (Nome, Número, Valor…) ou <b>digite o nome</b> (ex.: “num”) e escolha na lista: ele vira um badge que se preenche sozinho na hora do envio.
              </Alert>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <PanelCard title="Envio do orçamento" icon={MessageSquareText}><Template kind="quote" label="Mensagem junto do PDF" value={s.messages.quote} onChange={(v) => msg('quote', v)} /></PanelCard>
                <PanelCard title="Envio da ordem de serviço" icon={MessageSquareText}><Template kind="orderDoc" label="Mensagem junto do PDF" value={s.messages.orderDoc} onChange={(v) => msg('orderDoc', v)} /></PanelCard>
                <PanelCard title="Pagamento recebido" icon={MessageSquareText}><Template kind="payment" label="Recibo para o cliente" value={s.messages.payment} onChange={(v) => msg('payment', v)} /></PanelCard>
              </div>
              <PanelCard title="Aviso a cada etapa da ordem de serviço" description="Mensagem sugerida quando a OS muda de etapa" icon={MessageSquareText}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {orderStages.map((st) => <Template key={st.id} kind={st.id === 'pronto' ? 'ready' : 'stage'} label={st.label} value={s.messages.stage[st.id]} onChange={(v) => stageMsg(st.id, v)} />)}
                </div>
              </PanelCard>
            </div>
          )}
        </Tabs>

        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button size="sm" loading={saving} disabled={!dirty} iconLeft={<Save size={14} />} onClick={save}>Salvar alterações</Button>
        </div>
      </div>
      <ConfirmModal isOpen={resetting} onClose={() => setResetting(false)} onConfirm={reset} title="Restaurar o padrão?" confirmLabel="Restaurar" message="Prazos, categorias, condições dos PDFs e mensagens voltam aos textos originais. Os dados da empresa não mudam." />
    </PageWrapper>
  );
};

export default SettingsPage;
