import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Pencil, MessageCircle, FileText, ClipboardList, Loader2, Paperclip, UserCircle2 } from 'lucide-react';
import { PageWrapper, ContentCard, PanelCard, DetailField, Button, Badge, EmptyState, Tabs } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { FilesPanel } from '../components/FilesPanel';
import { api } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { brl, dateLabel, initials, maskCep, maskDocument, maskPhone, quoteStatus, stageOf, waLink } from '../utils/format';
import type { Customer, Order, Quote } from '../types';

type Full = Customer & { orders: Order[]; quotes: Quote[] };
const tabs = [
  { id: 'dados', label: 'Dados', icon: UserCircle2 }, { id: 'pedidos', label: 'Ordens de serviço', icon: ClipboardList },
  { id: 'orcamentos', label: 'Orçamentos', icon: FileText }, { id: 'arquivos', label: 'Arquivos', icon: Paperclip },
] as const;
const tabIds = tabs.map((t) => t.id);

const CustomerDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useUrlTab(tabIds, 'dados');
  const { data: c, loading, error, reload } = useLoad(() => api.get<Full>(`/customers/${id}`), [id]);

  if (loading && !c) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando cliente…</div></PageWrapper>;
  if (error || !c) {
    return <PageWrapper><div className="space-y-4"><BackBar to="/clientes" label="Voltar para clientes" /><ContentCard><EmptyState icon={Users} title={error ? 'Não foi possível carregar o cliente' : 'Cliente não encontrado'} description={error ? 'Confira a conexão e tente novamente.' : 'O cadastro pode ter sido removido.'}
      action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/clientes')}>Voltar para clientes</Button>{error && <Button onClick={() => reload()}>Tentar novamente</Button>}</div>} /></ContentCard></div></PageWrapper>;
  }

  const address = [c.street && `${c.street}${c.number ? `, ${c.number}` : ''}`, c.district, c.city && `${c.city}${c.state ? `/${c.state}` : ''}`, c.zip && `CEP ${maskCep(c.zip)}`].filter(Boolean).join(' · ');
  const spent = c.orders.filter((o) => o.status !== 'cancelado').reduce((s, o) => s + o.total, 0);

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/clientes" label="Voltar para clientes">
          <Button variant="outline" size="sm" iconLeft={<FileText size={14} />} onClick={() => navigate(`/orcamentos/novo?cliente=${c.id}`)}>Novo orçamento</Button>
          <Button variant="outline" size="sm" iconLeft={<ClipboardList size={14} />} onClick={() => navigate(`/pedidos/novo?cliente=${c.id}`)}>Nova OS</Button>
          <Button variant="outline" size="sm" iconLeft={<MessageCircle size={14} />} disabled={!c.phone} title={c.phone ? '' : 'Cliente sem WhatsApp cadastrado'} onClick={() => window.open(waLink(c.phone), '_blank')}>WhatsApp</Button>
          <Button size="sm" iconLeft={<Pencil size={14} />} onClick={() => navigate(`/clientes/${c.id}/editar`)}>Editar</Button>
        </BackBar>

        <ContentCard padding="md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-14 w-14 rounded-lg border border-blue-100 bg-blue-50 text-blue-700 text-lg font-medium flex items-center justify-center shrink-0">{initials(c.name)}</span>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 break-words flex items-center gap-2 flex-wrap">{c.name}{!c.active && <Badge size="sm">Inativo</Badge>}</h1>
                <p className="text-xs text-slate-500">{[c.company, maskPhone(c.phone), c.city && `${c.city}${c.state ? `/${c.state}` : ''}`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex gap-6 text-right">
              <div><p className="text-[11px] text-slate-500">Ordens de serviço</p><p className="text-base font-semibold tabular-nums">{c.orders.length}</p></div>
              <div><p className="text-[11px] text-slate-500">Total comprado</p><p className="text-base font-semibold tabular-nums text-blue-700">{brl(spent)}</p></div>
            </div>
          </div>
        </ContentCard>

        <Tabs<typeof tabs[number]['id']> items={tabs} value={tab} onChange={setTab} label="Detalhes do cliente">
          {tab === 'dados' && (
            <div className="space-y-3">
              <PanelCard title="Dados pessoais e contato">
                <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
                  <DetailField label="Empresa" value={c.company ?? ''} />
                  <DetailField label="CPF / CNPJ" value={maskDocument(c.document)} />
                  <DetailField label="WhatsApp" value={maskPhone(c.phone)} />
                  <DetailField label="E-mail" value={c.email ?? ''} />
                  <div className="sm:col-span-2"><DetailField label="Endereço" value={address} /></div>
                </dl>
              </PanelCard>
              <PanelCard title="Observações"><p className="text-[13px] text-slate-700 whitespace-pre-wrap">{c.notes || <span className="text-slate-400">Não informado</span>}</p></PanelCard>
            </div>
          )}
          {tab === 'pedidos' && (
            <ContentCard padding="none">
              {c.orders.length === 0 ? <EmptyState icon={ClipboardList} title="Nenhuma ordem de serviço ainda" action={<Button size="sm" onClick={() => navigate(`/pedidos/novo?cliente=${c.id}`)}>Criar ordem de serviço</Button>} /> : (
                <ul className="divide-y divide-slate-100">
                  {c.orders.map((o) => (
                    <li key={o.id}><button className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50" onClick={() => navigate(`/pedidos/${o.id}`)}>
                      <span className="min-w-0"><span className="text-[13px] font-medium text-slate-800">OS #{o.number}</span><span className="block text-[11px] text-slate-500">{dateLabel(o.createdAt)} · {brl(o.total)}</span></span>
                      <Badge size="sm" dot color={stageOf(o.status).color}>{stageOf(o.status).label}</Badge>
                    </button></li>
                  ))}
                </ul>
              )}
            </ContentCard>
          )}
          {tab === 'orcamentos' && (
            <ContentCard padding="none">
              {c.quotes.length === 0 ? <EmptyState icon={FileText} title="Nenhum orçamento ainda" action={<Button size="sm" onClick={() => navigate(`/orcamentos/novo?cliente=${c.id}`)}>Criar orçamento</Button>} /> : (
                <ul className="divide-y divide-slate-100">
                  {c.quotes.map((q) => (
                    <li key={q.id}><button className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50" onClick={() => navigate(`/orcamentos/${q.id}`)}>
                      <span className="min-w-0"><span className="text-[13px] font-medium text-slate-800">Orçamento #{q.number}</span><span className="block text-[11px] text-slate-500">{dateLabel(q.createdAt)} · {brl(q.total)}</span></span>
                      <Badge size="sm" dot color={quoteStatus[q.status].color}>{quoteStatus[q.status].label}</Badge>
                    </button></li>
                  ))}
                </ul>
              )}
            </ContentCard>
          )}
          {tab === 'arquivos' && <ContentCard padding="md"><FilesPanel customerId={c.id} kind="customer" emptyHint="Logos, artes e documentos deste cliente. A IA pode consultar os que estiverem marcados." /></ContentCard>}
        </Tabs>
      </div>
    </PageWrapper>
  );
};

export default CustomerDetail;
