import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wrench, Plus, Upload, Wallet, TrendingUp, Clock, Coins, ClipboardList, PieChart } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, GridTable, EmptyState, Badge, StatGrid, StatCard, Alert, PanelCard,
  FilterLine, FilterLineSection, FilterLineSearch, FilterLineSegmented, FilterLineDateRange, usePagination,
} from '../components/ui';
import { api } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useBulk } from '../src/hooks/useBulk';
import { BulkBar } from '../components/BulkBar';
import { brl, dateLabel } from '../utils/format';
import type { ServicesResponse, ServiceRecord } from '../types';

export const methodLabel: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência' };

/** Situação de um serviço, como na planilha de controle: verde = pago, amarelo = em aberto (a receber, parcial ou ainda a orçar). */
export type ServiceState = 'pago' | 'parcial' | 'receber' | 'orcar';
export const stateOf = (r: Pick<ServiceRecord, 'total' | 'amountPaid'>): ServiceState =>
  r.total <= 0 ? 'orcar' : r.amountPaid >= r.total - 0.005 ? 'pago' : r.amountPaid > 0 ? 'parcial' : 'receber';
export const stateInfo: Record<ServiceState, { label: string; color: 'success' | 'warning' | 'default' | 'orange' }> = {
  pago: { label: 'Pago', color: 'success' }, parcial: { label: 'Pago em parte', color: 'orange' }, receber: { label: 'A receber', color: 'warning' }, orcar: { label: 'A orçar', color: 'default' },
};
export const paidPercent = (r: Pick<ServiceRecord, 'total' | 'amountPaid'>) => (r.total > 0 ? Math.round((r.amountPaid / r.total) * 100) : 0);
export const profitOf = (r: Pick<ServiceRecord, 'total' | 'cost'>) => Math.round((r.total - r.cost) * 100) / 100;
export const shareOf = (profit: number, percent: number) => Math.round(profit * percent) / 100;

const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthPrev = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};

/** Controle de serviços (venda, custo, lucro, divisão entre sócios e pagamento). Entram sozinhos quando o pedido é entregue, ou por lançamento e importação de planilha. */
const Services: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = params.get('periodo') === 'todos' ? null : monthRange(monthNow());
  const [from, setFrom] = useState<string | null>(initial?.from ?? null);
  const [to, setTo] = useState<string | null>(initial?.to ?? null);
  const setPeriod = (m: string | null) => { const r = m ? monthRange(m) : null; setFrom(r?.from ?? null); setTo(r?.to ?? null); };
  const hasPeriod = !!(from || to);
  const [status, setStatus] = useState<'todos' | 'pago' | 'pendente' | 'orcar'>('todos');
  const [search, setSearch] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (status !== 'todos') p.set('status', status);
    if (search.trim()) p.set('q', search.trim());
    return p.toString();
  }, [from, to, status, search]);
  const { data, loading, error, reload } = useLoad(() => api.get<ServicesResponse>(`/services${qs ? `?${qs}` : ''}`), [qs]);
  const items = data?.items ?? [];
  const partners = data?.partners ?? [];
  const pag = usePagination(items, 15);
  const bulk = useBulk(pag.paginatedData.map((x) => x.id), items.map((x) => x.id));
  const byId = new Map((items).map((x) => [x.id, x]));
  const s = data?.summary;
  const filtered = search || status !== 'todos' || hasPeriod;

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Controle de serviços" icon={Wrench} description="Venda, custo, lucro e pagamento de cada serviço · entra sozinho quando o pedido é entregue"
          action={<div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" iconLeft={<PieChart size={14} />} onClick={() => navigate('/servicos/lucro')}>Divisão do lucro</Button>
            <Button size="sm" variant="outline" iconLeft={<Upload size={14} />} onClick={() => navigate('/servicos/importar')}>Importar planilha</Button>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate('/servicos/novo')}>Novo serviço</Button>
          </div>} />

        <StatGrid cols={4}>
          <StatCard title="Venda no período" value={brl(s?.total ?? 0)} icon={Wallet} color="info" description={s?.unpricedCount ? `${s.unpricedCount} ainda a orçar` : undefined} />
          <StatCard title="Custo" value={brl(s?.cost ?? 0)} icon={Coins} color="default" />
          <StatCard title="Lucro" value={brl(s?.profit ?? 0)} icon={TrendingUp} color={(s?.profit ?? 0) >= 0 ? 'success' : 'danger'} description={s && s.total > 0 ? `margem de ${Math.round((s.profit / s.total) * 100)}%` : undefined} />
          <StatCard title="A receber" value={brl(s?.toReceive ?? 0)} icon={Clock} color={s?.toReceive ? 'warning' : 'default'} description={`${brl(s?.received ?? 0)} já recebidos`} />
        </StatGrid>

        {partners.length > 0 && s && (
          <PanelCard title="Lucro por sócio" description={`Divisão do lucro do período (${partners.map((p) => `${p.name} ${p.percent}%`).join(' · ')})`} icon={PieChart}
            action={<Button variant="ghost" size="xs" onClick={() => navigate('/servicos/lucro')}>Ajustar divisão</Button>}>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {partners.map((p) => (
                <div key={p.name}><dt className="text-[11px] text-slate-500">{p.name} · {p.percent}%</dt><dd className="text-base font-semibold tabular-nums text-slate-900">{brl(shareOf(s.profit, p.percent))}</dd></div>
              ))}
            </dl>
          </PanelCard>
        )}

        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar por cliente, serviço ou categoria" aria-label="Buscar serviços" /></FilterLineSection>
          <FilterLineSection>
            <FilterLineSegmented<string> size="sm" value={status} onChange={(v) => setStatus(v as typeof status)}
              options={[{ value: 'todos', label: 'Todos' }, { value: 'pago', label: 'Pagos' }, { value: 'pendente', label: 'A receber' }, { value: 'orcar', label: 'A orçar' }]} />
          </FilterLineSection>
        </FilterLine>
        <FilterLine>
          <FilterLineSection grow><FilterLineDateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} /></FilterLineSection>
          <FilterLineSection>
            <Button variant="outline" size="xs" onClick={() => setPeriod(monthNow())}>Este mês</Button>
            <Button variant="outline" size="xs" onClick={() => setPeriod(monthPrev())}>Mês passado</Button>
            <Button variant={hasPeriod ? 'outline' : 'ghost'} size="xs" onClick={() => setPeriod(null)}>Todo o período</Button>
          </FilterLineSection>
        </FilterLine>
        <BulkBar resource="services" noun="serviços" ids={bulk.ids} names={(id) => { const x = byId.get(id); return x ? `${x.customerName} — ${x.description}` : id; }} totalCount={items.length} onSelectAll={bulk.selectAll} onClear={bulk.clear} onDone={() => { bulk.clear(); reload(true); }} deleteNote="Os lançamentos saem do controle e dos totais. Não dá para desfazer." />
        {data?.truncated && <Alert variant="warning" title="Mostrando só os 3.000 mais recentes">Use o filtro de período para ver os demais. Os totais acima consideram todos os serviços do filtro.</Alert>}

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500" aria-label="Legenda das cores">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-200 border border-emerald-300" />Pago</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-200 border border-amber-300" />Em aberto (a receber, pago em parte ou a orçar)</span>
        </div>

        <ContentCard padding="none">
          {error ? <EmptyState icon={Wrench} title="Não foi possível carregar os serviços" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /> : (
            <GridTable<ServiceRecord> selectedIds={bulk.selected} onToggleSelect={bulk.toggle} onToggleSelectAll={bulk.togglePage}
              noDesktopCard keyExtractor={(r) => r.id} data={pag.paginatedData} isLoading={loading} onRowClick={(r) => navigate(`/servicos/${r.id}`)} tableMinWidth={1100}
              getRowClassName={(r) => (stateOf(r) === 'pago' ? 'bg-emerald-50/80 hover:bg-emerald-100/70' : 'bg-amber-50/80 hover:bg-amber-100/70')}
              emptyMessage={<EmptyState icon={Wrench} title={filtered ? 'Nenhum serviço neste filtro' : 'Nenhum serviço registrado ainda'}
                description={filtered ? 'Ajuste o período, a situação ou a busca.' : 'Entregue uma ordem de serviço, lance um serviço manualmente ou importe sua planilha de controle.'}
                action={<Button size="sm" variant="outline" iconLeft={<Upload size={14} />} onClick={() => navigate('/servicos/importar')}>Importar planilha</Button>} />}
              pagination={{ total: items.length, page: pag.page, pageSize: pag.pageSize, onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize }}
              columns={[
                { header: 'Data', render: (r) => <span className="text-xs whitespace-nowrap">{dateLabel(r.date)}</span> },
                { header: 'Cliente', render: (r) => <span className="text-xs font-medium text-slate-800">{r.customerName}</span> },
                { header: 'Serviço', render: (r) => (
                  <div><p className="text-xs text-slate-800 max-w-xs break-words">{r.description}</p>
                    {(r.category || r.source !== 'manual') && <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">{r.category}{r.source === 'pedido' && <Badge size="sm" color="primary" icon={<ClipboardList size={10} />}>da OS</Badge>}{r.source === 'importacao' && <Badge size="sm">importado</Badge>}</p>}</div>) },
                { header: 'Venda', render: (r) => <span className="text-xs tabular-nums font-semibold whitespace-nowrap">{r.total > 0 ? brl(r.total) : <span className="font-normal text-slate-400">—</span>}</span> },
                { header: 'Custo', hideOnMobile: true, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.total > 0 || r.cost > 0 ? brl(r.cost) : <span className="text-slate-400">—</span>}</span> },
                { header: 'Lucro', hideOnMobile: true, render: (r) => { const p = profitOf(r); return <span className={`text-xs tabular-nums font-semibold whitespace-nowrap ${r.total <= 0 && r.cost <= 0 ? 'text-slate-400 font-normal' : p < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.total <= 0 && r.cost <= 0 ? '—' : brl(p)}</span>; } },
                ...partners.map((p) => ({ header: p.name, hideOnMobile: true, render: (r: ServiceRecord) => <span className="text-xs tabular-nums whitespace-nowrap text-slate-600">{r.total <= 0 && r.cost <= 0 ? '—' : brl(shareOf(profitOf(r), p.percent))}</span> })),
                { header: '% pago', hideOnMobile: true, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.total > 0 ? `${paidPercent(r)}%` : '—'}</span> },
                { header: 'Valor pago', hideOnMobile: true, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{brl(r.amountPaid)}</span> },
                { header: 'Situação', render: (r) => { const st = stateInfo[stateOf(r)]; return <Badge size="sm" dot color={st.color}>{st.label}</Badge>; } },
              ]}
            />
          )}
        </ContentCard>
      </div>
    </PageWrapper>
  );
};

export default Services;
