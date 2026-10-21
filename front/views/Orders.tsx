import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, LayoutGrid, List, ArrowRight, Paperclip, Loader2, Flame, CalendarClock } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, GridTable, EmptyState, Badge, Tabs,
  FilterLine, FilterLineSection, FilterLineSearch, FilterLineSegmented, usePagination, useToast,
} from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useBulk } from '../src/hooks/useBulk';
import { BulkBar } from '../components/BulkBar';
import { useUrlTab } from '../src/hooks/useUrlTab';
import { brl, dateLabel, normalizeText, orderStages, stageOf } from '../utils/format';
import type { Order, OrderStatus } from '../types';

const viewTabs = [{ id: 'quadro', label: 'Quadro', icon: LayoutGrid }, { id: 'lista', label: 'Lista', icon: List }] as const;
const viewIds = viewTabs.map((t) => t.id);
const boardStages = orderStages.filter((s) => !['entregue', 'cancelado'].includes(s.id));
const nextStage = (s: OrderStatus): OrderStatus | null => { const i = boardStages.findIndex((x) => x.id === s); return i >= 0 && i < boardStages.length - 1 ? boardStages[i + 1].id : i === boardStages.length - 1 ? 'entregue' : null; };

const late = (o: Pick<Order, 'dueDate' | 'status'>) => !!o.dueDate && !['pronto', 'entregue', 'cancelado'].includes(o.status) && new Date(o.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
const payState = (o: Pick<Order, 'total' | 'paid'>) => (o.paid >= o.total && o.total > 0 ? { label: 'Pago', color: 'success' as const } : o.paid > 0 ? { label: 'Parcial', color: 'purple' as const } : { label: 'A receber', color: 'warning' as const });

const OrderCard: React.FC<{ o: Order; onOpen: () => void; onAdvance: () => void; busy: boolean }> = ({ o, onOpen, onAdvance, busy }) => {
  const next = nextStage(o.status);
  const isLate = late(o);
  return (
    <ContentCard padding="none" className={`group hover:border-blue-200 transition-all overflow-hidden ${isLate ? 'border-rose-200' : ''}`}>
      <button className="w-full text-left p-3 space-y-1.5" onClick={onOpen}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800">#{o.number}</span>
          <span className="flex items-center gap-1">
            {o.priority === 'urgente' && <Badge size="sm" color="danger" icon={<Flame size={10} />}>Urgente</Badge>}
            {(o._count?.attachments ?? 0) > 0 && <span className="flex items-center gap-0.5 text-[11px] text-slate-500"><Paperclip size={11} />{o._count!.attachments}</span>}
          </span>
        </div>
        <p className="text-[13px] text-slate-800 truncate">{o.customer.name}</p>
        <p className="text-[11px] text-slate-500 truncate">{o.items[0]?.description}{o.items.length > 1 ? ` +${o.items.length - 1}` : ''}</p>
        <div className="flex items-center justify-between text-[11px]">
          <span className={`flex items-center gap-1 ${isLate ? 'text-rose-600' : 'text-slate-500'}`}><CalendarClock size={11} />{o.dueDate ? dateLabel(o.dueDate) : 'Sem data'}</span>
          <span className="tabular-nums font-medium text-slate-700">{brl(o.total)}</span>
        </div>
      </button>
      {next && (
        <div className="p-2 bg-slate-50/50 border-t border-slate-100">
          <Button size="xs" variant="outline" className="w-full" loading={busy} iconRight={<ArrowRight size={12} />} onClick={onAdvance}>{stageOf(next).label}</Button>
        </div>
      )}
    </ContentCard>
  );
};

/** Ordens de serviço: quadro por etapa e lista. Clicar abre a página da ordem de serviço. */
const Orders: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [view, setView] = useUrlTab(viewIds, 'quadro');
  const { data, loading, error, reload } = useLoad(() => api.get<Order[]>('/orders'), []);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'abertos' | 'entregues' | 'todos'>('abertos');
  const [advancing, setAdvancing] = useState<string | null>(null);

  const bySearch = useMemo(() => {
    const q = normalizeText(search.trim());
    return (data ?? []).filter((o) => !q || normalizeText(`${o.number} ${o.customer.name} ${o.customer.company ?? ''} ${o.items.map((i) => i.description).join(' ')}`).includes(q));
  }, [data, search]);
  const list = useMemo(() => bySearch.filter((o) => scope === 'todos' || (scope === 'abertos' ? !['entregue', 'cancelado'].includes(o.status) : ['entregue', 'cancelado'].includes(o.status))), [bySearch, scope]);
  const pag = usePagination(list, 15);
  const bulk = useBulk(pag.paginatedData.map((x) => x.id), list.map((x) => x.id));
  const byId = new Map((list).map((x) => [x.id, x]));

  const advance = async (o: Order) => {
    const next = nextStage(o.status);
    if (!next || advancing) return;
    setAdvancing(o.id);
    try { await api.patch(`/orders/${o.id}/status`, { status: next }); toast.success(`#${o.number} → ${stageOf(next).label}`); reload(true); }
    catch (e) { toast.error(errMsg(e)); } finally { setAdvancing(null); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Ordens de serviço" icon={ClipboardList} description={`${(data ?? []).filter((o) => !['entregue', 'cancelado'].includes(o.status)).length} em aberto · acompanhe cada etapa da produção`}
          action={<Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate('/pedidos/novo')}>Nova ordem de serviço</Button>} />

        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar por número, cliente ou produto" aria-label="Buscar ordens de serviço" /></FilterLineSection>
          {view === 'lista' && (
            <FilterLineSection>
              <FilterLineSegmented<string> size="sm" value={scope} onChange={(v) => setScope(v as typeof scope)} options={[{ value: 'abertos', label: 'Em aberto' }, { value: 'entregues', label: 'Entregues' }, { value: 'todos', label: 'Todos' }]} />
            </FilterLineSection>
          )}
        </FilterLine>
        {view === 'lista' && <BulkBar resource="orders" noun="ordens de serviço" ids={bulk.ids} names={(id) => { const x = byId.get(id); return x ? `#${x.number} · ${x.customer.name}` : id; }} totalCount={list.length} onSelectAll={bulk.selectAll} onClear={bulk.clear} onDone={() => { bulk.clear(); reload(true); }} deleteNote="Só o administrador pode excluir ordens de serviço. Se só quer tirar da produção, prefira cancelar. Não dá para desfazer." />}

        {error ? (
          <ContentCard><EmptyState icon={ClipboardList} title="Não foi possível carregar as ordens de serviço" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /></ContentCard>
        ) : (
          <Tabs<typeof viewTabs[number]['id']> items={viewTabs} value={view} onChange={setView} label="Visualização das ordens de serviço">
            {view === 'quadro' && (
              loading && !data
                ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando ordens de serviço…</div>
                : (
                  <div className="kanban" role="list" aria-label="Quadro de produção">
                    {boardStages.map((s) => {
                      const col = bySearch.filter((o) => o.status === s.id);
                      return (
                        <section key={s.id} role="listitem" className="rounded-lg bg-slate-100/60 border border-slate-200 p-2 space-y-2 min-h-[120px]">
                          <header className="flex items-center justify-between px-1"><h3 className="text-xs font-semibold text-slate-700">{s.label}</h3><Badge size="sm" color={s.color}>{col.length}</Badge></header>
                          {col.length === 0 && <p className="text-[11px] text-slate-400 px-1 py-3 text-center">Nada aqui</p>}
                          {col.map((o) => <OrderCard key={o.id} o={o} busy={advancing === o.id} onOpen={() => navigate(`/pedidos/${o.id}`)} onAdvance={() => advance(o)} />)}
                        </section>
                      );
                    })}
                  </div>
                )
            )}
            {view === 'lista' && (
              <ContentCard padding="none">
                <GridTable<Order> selectedIds={bulk.selected} onToggleSelect={bulk.toggle} onToggleSelectAll={bulk.togglePage}
                  noDesktopCard keyExtractor={(o) => o.id} data={pag.paginatedData} isLoading={loading} onRowClick={(o) => navigate(`/pedidos/${o.id}`)}
                  emptyMessage={<EmptyState icon={ClipboardList} title={search ? 'Nenhuma ordem de serviço encontrada' : 'Nenhuma ordem de serviço aqui'} description={search ? 'Ajuste a busca.' : 'Crie uma ordem de serviço ou aprove um orçamento.'} />}
                  pagination={{ total: list.length, page: pag.page, pageSize: pag.pageSize, onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize }}
                  columns={[
                    { header: 'Nº', render: (o) => <span className="text-xs font-medium tabular-nums">#{o.number}</span> },
                    { header: 'Cliente', render: (o) => (<div><p className="text-xs font-medium text-slate-800">{o.customer.name}</p><p className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">{o.items[0]?.description}</p></div>) },
                    { header: 'Entrega', hideOnMobile: true, render: (o) => <span className={`text-xs whitespace-nowrap ${late(o) ? 'text-rose-600 font-medium' : ''}`}>{dateLabel(o.dueDate)}</span> },
                    { header: 'Total', render: (o) => <span className="text-xs font-semibold tabular-nums whitespace-nowrap">{brl(o.total)}</span> },
                    { header: 'Pagamento', hideOnMobile: true, render: (o) => <Badge size="sm" color={payState(o).color}>{payState(o).label}</Badge> },
                    { header: 'Etapa', render: (o) => <Badge size="sm" dot color={stageOf(o.status).color}>{stageOf(o.status).label}</Badge> },
                  ]}
                />
              </ContentCard>
            )}
          </Tabs>
        )}
      </div>
    </PageWrapper>
  );
};

export default Orders;
