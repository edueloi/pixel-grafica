import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LayoutDashboard, ClipboardList, AlertTriangle, FileText, MessageCircle, Loader2, Wallet, CalendarClock, Layers, TrendingUp,
  Users, Package, Bot, Clock, History, Coins, PieChart, Trophy, Percent,
} from 'lucide-react';
import { PageWrapper, SectionTitle, StatGrid, StatCard, PanelCard, Tabs, EmptyState, ContentCard, Button, Badge } from '../components/ui';
import { api } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { brl, dateLabel, orderStages, stageOf } from '../utils/format';
import { methodLabel } from './Services';
import type { Dashboard as DashboardData, DashboardInsights, User } from '../types';

type TabId = 'geral' | 'financeiro' | 'producao' | 'clientes' | 'atendimento';
const allTabs: { id: TabId; label: string; icon: typeof LayoutDashboard; sells: boolean }[] = [
  { id: 'geral', label: 'Visão geral', icon: LayoutDashboard, sells: false },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet, sells: true },
  { id: 'producao', label: 'Produção', icon: Layers, sells: false },
  { id: 'clientes', label: 'Clientes e vendas', icon: Users, sells: true },
  { id: 'atendimento', label: 'Atendimento', icon: MessageCircle, sells: true },
];

const Bar: React.FC<{ label: string; value: number; max: number; color: string; money?: boolean; hint?: string }> = ({ label, value, max, color, money, hint }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1 gap-2">
      <span className="text-slate-600 truncate">{label}{hint && <span className="text-slate-400"> · {hint}</span>}</span>
      <span className="font-medium text-slate-800 tabular-nums shrink-0">{money ? brl(value) : value}</span>
    </div>
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%` }} /></div>
  </div>
);

/** Colunas simples (sem biblioteca): uma barra por mês/dia. */
const Columns: React.FC<{ items: { label: string; a: number; b?: number }[]; aColor: string; bColor?: string; money?: boolean }> = ({ items, aColor, bColor, money }) => {
  const max = Math.max(1, ...items.flatMap((i) => [i.a, i.b ?? 0]));
  return (
    <div className="flex items-end gap-3 h-40" role="img" aria-label="Gráfico de colunas">
      {items.map((i) => (
        <div key={i.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="flex items-end gap-1 w-full justify-center flex-1">
            <div title={money ? brl(i.a) : String(i.a)} className={`w-full max-w-[22px] rounded-t ${aColor}`} style={{ height: `${(i.a / max) * 100}%`, minHeight: i.a > 0 ? 3 : 0 }} />
            {i.b !== undefined && <div title={money ? brl(i.b) : String(i.b)} className={`w-full max-w-[22px] rounded-t ${bColor}`} style={{ height: `${(i.b / max) * 100}%`, minHeight: i.b > 0 ? 3 : 0 }} />}
          </div>
          <span className="text-[11px] text-slate-500 mt-1.5 capitalize">{i.label}</span>
        </div>
      ))}
    </div>
  );
};

const deltaText = (now: number, before: number) => (before ? `${now >= before ? "▲" : "▼"} ${Math.abs(Math.round(((now - before) / before) * 100))}% vs. mês anterior` : undefined);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="text-xs text-slate-500 py-2">{text}</p>;

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const sells = user.role === 'admin' || user.role === 'atendente';
  const tabs = allTabs.filter((t) => sells || !t.sells);
  const [tab, setTab] = useUrlTab(tabs.map((t) => t.id), 'geral');
  const { data, loading, error, reload } = useLoad(() => api.get<DashboardData>('/dashboard'), []);
  const ins = useLoad(() => (sells ? api.get<DashboardInsights>('/dashboard/insights') : Promise.resolve(null)), [sells]);
  const x = ins.data;

  if (loading && !data) {
    return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando painel…</div></PageWrapper>;
  }
  if (error || !data) {
    return (
      <PageWrapper><ContentCard>
        <EmptyState icon={LayoutDashboard} title="Não foi possível carregar o painel" description={error || 'Tente novamente.'} action={<Button onClick={() => reload()}>Tentar novamente</Button>} />
      </ContentCard></PageWrapper>
    );
  }

  const stageMax = Math.max(1, ...orderStages.map((s) => data.counts[s.id] ?? 0));
  const waitingInsights = !x && sells && ins.loading;
  const fin = x?.finance;

  const dueSoon = (
    <PanelCard title="Entregas nos próximos 3 dias" icon={CalendarClock}>
      {data.dueSoon.length === 0 ? <Empty text="Nenhuma entrega prevista para os próximos dias." /> : (
        <ul className="divide-y divide-slate-100">
          {data.dueSoon.map((o) => (
            <li key={o.id} className="py-2 flex items-center justify-between gap-2">
              <button className="text-left min-w-0" onClick={() => navigate(`/pedidos/${o.id}`)}>
                <p className="text-[13px] text-slate-800 truncate">#{o.number} · {o.customer.name}</p>
                <p className="text-[11px] text-slate-500">Entrega em {dateLabel(o.dueDate)}</p>
              </button>
              <Badge size="sm" color={stageOf(o.status).color}>{stageOf(o.status).label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );

  const lateCard = (
    <PanelCard title="Atrasadas" description="Entrega vencida e ainda não pronta" icon={AlertTriangle}>
      {!x ? <Empty text={waitingInsights ? 'Carregando…' : 'Sem dados.'} /> : x.lateList.length === 0 ? <Empty text="Nenhuma ordem de serviço atrasada. 🎉" /> : (
        <ul className="divide-y divide-slate-100">
          {x.lateList.map((o) => (
            <li key={o.id} className="py-2 flex items-center justify-between gap-2">
              <button className="text-left min-w-0" onClick={() => navigate(`/pedidos/${o.id}`)}>
                <p className="text-[13px] text-slate-800 truncate">#{o.number} · {o.customer}</p>
                <p className="text-[11px] text-red-600">Venceu em {dateLabel(o.dueDate)}</p>
              </button>
              <Badge size="sm" color={stageOf(o.status).color}>{stageOf(o.status).label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );

  const stages = (
    <PanelCard title="Ordens de serviço por etapa" description="Quantas estão em cada etapa agora" icon={Layers}>
      <div className="space-y-3">
        {orderStages.filter((s) => s.id !== 'cancelado').map((s) => (
          <Bar key={s.id} label={s.label} value={data.counts[s.id] ?? 0} max={stageMax} color={s.id === 'entregue' ? 'bg-slate-300' : 'bg-blue-600'} />
        ))}
      </div>
    </PanelCard>
  );

  const recent = (
    <PanelCard title="Atividade recente" description="Últimas mudanças nas ordens de serviço" icon={History}>
      {!x ? <Empty text={waitingInsights ? 'Carregando…' : 'Sem dados.'} /> : x.recent.length === 0 ? <Empty text="Nada aconteceu ainda." /> : (
        <ul className="divide-y divide-slate-100">
          {x.recent.map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] text-slate-800 truncate">#{e.number} · {e.customer}</p>
                <p className="text-[11px] text-slate-500 truncate">{new Date(e.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{e.userName ? ` · ${e.userName}` : ''}{e.note ? ` · ${e.note}` : ''}</p>
              </div>
              <Badge size="sm" color={stageOf(e.status).color}>{stageOf(e.status).label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Painel" description="Resumo da produção, das vendas e do atendimento da Pixel Gráfica" icon={LayoutDashboard}
          action={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate('/pedidos')} iconLeft={<ClipboardList size={14} />}>Ver ordens de serviço</Button>
            {sells && <Button size="sm" variant="outline" onClick={() => navigate('/orcamentos/novo')} iconLeft={<FileText size={14} />}>Novo orçamento</Button>}
            {sells && <Button size="sm" onClick={() => navigate('/pedidos/novo')} iconLeft={<Plus size={14} />}>Nova ordem de serviço</Button>}</div>} />

        <StatGrid cols={4}>
          <StatCard title="OS em aberto" value={data.openOrders} icon={ClipboardList} color="info" description={`${data.counts.producao ?? 0} em produção`} />
          <StatCard title="Atrasadas" value={data.lateOrders} icon={AlertTriangle} color={data.lateOrders ? 'danger' : 'success'} description={data.lateOrders ? 'precisam de atenção' : 'tudo no prazo'} />
          <StatCard title="Orçamentos pendentes" value={data.openQuotes} icon={FileText} color="warning" description={x ? `${brl(x.quotes.pendingTotal)} em propostas` : undefined} />
          {sells
            ? <StatCard title="Na fila do WhatsApp" value={data.waiting} icon={MessageCircle} color={data.waiting ? 'danger' : 'success'} description={`${data.active} em atendimento`} />
            : <StatCard title="Clientes" value={data.customers} icon={Users} color="default" />}
        </StatGrid>

        {sells && (
          <StatGrid cols={4}>
            <StatCard title="Venda do mês" value={brl(fin?.current.revenue ?? 0)} icon={Wallet} color="info" description={fin ? deltaText(fin.current.revenue, fin.previous.revenue) : undefined} />
            <StatCard title="Lucro do mês" value={brl(fin?.current.profit ?? 0)} icon={TrendingUp} color={(fin?.current.profit ?? 0) >= 0 ? 'success' : 'danger'} description={fin && fin.current.revenue > 0 ? `margem de ${Math.round((fin.current.profit / fin.current.revenue) * 100)}%` : undefined} />
            <StatCard title="A receber" value={brl(fin?.current.toReceive ?? 0)} icon={Clock} color={fin?.current.toReceive ? 'warning' : 'default'} description={`${brl(fin?.current.received ?? 0)} recebidos`} />
            <StatCard title="Clientes ativos" value={data.customers} icon={Users} color="default" description={x ? `${x.newCustomers} novo(s) neste mês` : undefined} />
          </StatGrid>
        )}

        <Tabs<TabId> items={tabs} value={tab} onChange={setTab} label="Painel">
          {tab === 'geral' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {dueSoon}
              {lateCard}
              {stages}
              {recent}
            </div>
          )}

          {tab === 'financeiro' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PanelCard title="Venda e lucro dos últimos 6 meses" description="Dos serviços realizados" icon={Wallet}>
                {!fin ? <Empty text="Carregando…" /> : (
                  <>
                    <Columns items={fin.series.map((s) => ({ label: s.label, a: s.revenue, b: s.profit }))} aColor="bg-blue-600" bColor="bg-emerald-500" money />
                    <div className="flex gap-4 mt-3 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Venda</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Lucro</span></div>
                  </>
                )}
              </PanelCard>
              <PanelCard title="Este mês" description="Venda, custo e recebimento" icon={Coins}>
                {!fin ? <Empty text="Carregando…" /> : (
                  <div className="space-y-3">
                    <Bar label="Venda" value={fin.current.revenue} max={fin.current.revenue} color="bg-blue-600" money />
                    <Bar label="Custo" value={fin.current.cost} max={fin.current.revenue} color="bg-slate-400" money />
                    <Bar label="Lucro" value={Math.max(0, fin.current.profit)} max={fin.current.revenue} color="bg-emerald-500" money />
                    <Bar label="Recebido" value={fin.current.received} max={fin.current.revenue} color="bg-teal-500" money />
                    <Bar label="A receber" value={fin.current.toReceive} max={fin.current.revenue} color="bg-amber-400" money />
                    {fin.current.unpriced > 0 && <p className="text-[11px] text-amber-700">{fin.current.unpriced} serviço(s) ainda a orçar não entram nos valores.</p>}
                  </div>
                )}
              </PanelCard>
              <PanelCard title="Lucro por sócio" description="Divisão do lucro do mês" icon={PieChart} action={<Button variant="ghost" size="xs" onClick={() => navigate('/servicos/lucro')}>Ajustar</Button>}>
                {!fin ? <Empty text="Carregando…" /> : fin.partners.length === 0 ? <Empty text="Defina a divisão do lucro em Serviços." /> : (
                  <dl className="grid grid-cols-2 gap-3">{fin.partners.map((p) => <div key={p.name}><dt className="text-[11px] text-slate-500">{p.name} · {p.percent}%</dt><dd className="text-base font-semibold tabular-nums text-slate-900">{brl(p.amount)}</dd></div>)}</dl>
                )}
              </PanelCard>
              <PanelCard title="Recebido por forma de pagamento" description="Neste mês" icon={Wallet}>
                {!fin ? <Empty text="Carregando…" /> : fin.byMethod.length === 0 ? <Empty text="Nenhum recebimento com forma de pagamento neste mês." /> : (
                  <div className="space-y-3">{fin.byMethod.map((m) => <Bar key={m.method} label={methodLabel[m.method] ?? 'Não informada'} value={m.amount} max={fin.byMethod[0].amount} color="bg-blue-600" money />)}</div>
                )}
              </PanelCard>
              <div className="lg:col-span-2">
                <PanelCard title="Ordens de serviço com valor a receber" description="As mais recentes com saldo em aberto" icon={Clock}>
                  {!x ? <Empty text="Carregando…" /> : x.receivables.length === 0 ? <Empty text="Nenhuma ordem de serviço com saldo em aberto." /> : (
                    <ul className="divide-y divide-slate-100">
                      {x.receivables.map((o) => (
                        <li key={o.id} className="py-2 flex items-center justify-between gap-2">
                          <button className="text-left min-w-0" onClick={() => navigate(`/pedidos/${o.id}`)}>
                            <p className="text-[13px] text-slate-800 truncate">#{o.number} · {o.customer}</p>
                            <p className="text-[11px] text-slate-500">{brl(o.paid)} pagos de {brl(o.total)}</p>
                          </button>
                          <span className="text-[13px] font-semibold tabular-nums text-amber-700 shrink-0">{brl(o.total - o.paid)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelCard>
              </div>
            </div>
          )}

          {tab === 'producao' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {stages}
              <div className="space-y-3">{lateCard}{dueSoon}</div>
            </div>
          )}

          {tab === 'clientes' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PanelCard title="Melhores clientes" description="Por venda, nos últimos 6 meses" icon={Trophy}>
                {!x ? <Empty text="Carregando…" /> : x.topCustomers.length === 0 ? <Empty text="Ainda sem vendas registradas." /> : (
                  <div className="space-y-3">{x.topCustomers.map((c) => <Bar key={c.name} label={c.name} hint={`${c.count} serviço(s)`} value={c.total} max={x.topCustomers[0].total} color="bg-blue-600" money />)}</div>
                )}
              </PanelCard>
              <PanelCard title="Produtos mais vendidos" description="Por valor, nas ordens de serviço dos últimos 6 meses" icon={Package}>
                {!x ? <Empty text="Carregando…" /> : x.topProducts.length === 0 ? <Empty text="Ainda sem ordens de serviço." /> : (
                  <div className="space-y-3">{x.topProducts.map((p) => <Bar key={p.name} label={p.name} hint={`${p.quantity.toLocaleString('pt-BR')} un.`} value={p.total} max={x.topProducts[0].total} color="bg-indigo-500" money />)}</div>
                )}
              </PanelCard>
              <PanelCard title="Orçamentos" description="Últimos 6 meses" icon={Percent}>
                {!x ? <Empty text="Carregando…" /> : (
                  <div className="space-y-3">
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><dt className="text-[11px] text-slate-500">Criados</dt><dd className="text-base font-semibold tabular-nums">{x.quotes.count}</dd></div>
                      <div><dt className="text-[11px] text-slate-500">Aprovados</dt><dd className="text-base font-semibold tabular-nums text-emerald-700">{x.quotes.approved}</dd></div>
                      <div><dt className="text-[11px] text-slate-500">Recusados</dt><dd className="text-base font-semibold tabular-nums text-red-600">{x.quotes.refused}</dd></div>
                      <div><dt className="text-[11px] text-slate-500">Taxa de aprovação</dt><dd className="text-base font-semibold tabular-nums">{x.quotes.conversion === null ? '—' : `${x.quotes.conversion}%`}</dd></div>
                    </dl>
                    <p className="text-[11px] text-slate-500">{x.quotes.pending} pendente(s), somando {brl(x.quotes.pendingTotal)}.</p>
                  </div>
                )}
              </PanelCard>
              <PanelCard title="Base de clientes" icon={Users} action={<Button variant="ghost" size="xs" onClick={() => navigate('/clientes')}>Ver clientes</Button>}>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-[11px] text-slate-500">Clientes ativos</dt><dd className="text-base font-semibold tabular-nums">{data.customers}</dd></div>
                  <div><dt className="text-[11px] text-slate-500">Novos no mês</dt><dd className="text-base font-semibold tabular-nums">{x?.newCustomers ?? '—'}</dd></div>
                </dl>
              </PanelCard>
            </div>
          )}

          {tab === 'atendimento' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PanelCard title="Conversas nos últimos 7 dias" description={x ? `${x.wpp.today} hoje · ${x.wpp.week} na semana` : undefined} icon={MessageCircle}>
                {!x ? <Empty text="Carregando…" /> : <Columns items={x.wpp.perDay.map((d) => ({ label: d.label, a: d.count }))} aColor="bg-blue-600" />}
              </PanelCard>
              <PanelCard title="Bot e atendentes" description="Conversas encerradas na semana" icon={Bot}>
                {!x ? <Empty text="Carregando…" /> : (
                  <div className="space-y-3">
                    <Bar label="Resolvidas só pelo bot / IA" value={x.wpp.resolvedByBot} max={Math.max(1, x.wpp.closed)} color="bg-blue-600" />
                    <Bar label="Com atendente" value={x.wpp.closed - x.wpp.resolvedByBot} max={Math.max(1, x.wpp.closed)} color="bg-emerald-500" />
                    <p className="text-[11px] text-slate-500">Tempo médio na fila até ser atendida: {x.wpp.avgWaitMin === null ? '—' : x.wpp.avgWaitMin < 1 ? 'menos de 1 min' : `${x.wpp.avgWaitMin} min`}.</p>
                  </div>
                )}
              </PanelCard>
              <PanelCard title="Agora" icon={Clock} action={<Button variant="ghost" size="xs" onClick={() => navigate('/whatsapp/fila')}>Abrir fila</Button>}>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-[11px] text-slate-500">Na fila</dt><dd className={`text-base font-semibold tabular-nums ${data.waiting ? 'text-red-600' : ''}`}>{data.waiting}</dd></div>
                  <div><dt className="text-[11px] text-slate-500">Em atendimento</dt><dd className="text-base font-semibold tabular-nums">{data.active}</dd></div>
                </dl>
              </PanelCard>
            </div>
          )}
        </Tabs>
      </div>
    </PageWrapper>
  );
};

export default Dashboard;
