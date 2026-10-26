import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2, MessageCircle } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, IconButton, ConfirmModal, GridTable, EmptyState, Badge,
  FilterLine, FilterLineSection, FilterLineSearch, FilterLineSegmented, usePagination, useToast,
} from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useBulk } from '../src/hooks/useBulk';
import { BulkBar } from '../components/BulkBar';
import { brl, dateLabel, normalizeText, quoteStatus } from '../utils/format';
import type { Quote, QuoteStatus } from '../types';

/** Lista de orçamentos. Clicar abre a página do orçamento (com PDF, status e envio por WhatsApp). */
const Quotes: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Quote[]>('/quotes'), []);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | QuoteStatus>('todos');
  const [removing, setRemoving] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeText(search.trim());
    return (data ?? []).filter((x) => (status === 'todos' || x.status === status) && (!q || normalizeText(`${x.number} ${x.customer.name} ${x.customer.company ?? ''}`).includes(q)));
  }, [data, search, status]);
  const pag = usePagination(filtered, 15);
  const bulk = useBulk(pag.paginatedData.map((x) => x.id), filtered.map((x) => x.id));
  const byId = new Map((filtered).map((x) => [x.id, x]));
  const count = (s: QuoteStatus) => (data ?? []).filter((x) => x.status === s).length;

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await api.del(`/quotes/${removing.id}`); toast.success('Orçamento excluído.'); setRemoving(null); reload(true); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Orçamentos" icon={FileText} description={`${data?.length ?? 0} orçamentos · ${count('rascunho')} rascunho(s) · ${count('enviado')} aguardando resposta`}
          action={<Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate('/orcamentos/novo')}>Novo orçamento</Button>} />
        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar por número ou cliente" aria-label="Buscar orçamentos" /></FilterLineSection>
          <FilterLineSection>
            <FilterLineSegmented<string> value={status} onChange={(v) => setStatus(v as typeof status)} size="sm"
              options={[{ value: 'todos', label: 'Todos' }, { value: 'rascunho', label: 'Rascunho' }, { value: 'enviado', label: 'Enviados' }, { value: 'aprovado', label: 'Aprovados' }, { value: 'recusado', label: 'Recusados' }]} />
          </FilterLineSection>
        </FilterLine>
        <BulkBar resource="quotes" noun="orçamentos" ids={bulk.ids} names={(id) => { const x = byId.get(id); return x ? `#${x.number} · ${x.customer.name}` : id; }} totalCount={filtered.length} onSelectAll={bulk.selectAll} onClear={bulk.clear} onDone={() => { bulk.clear(); reload(true); }} deleteNote="Orçamentos que já viraram ordem de serviço são mantidos. Não dá para desfazer." />

        <ContentCard padding="none">
          {error ? <EmptyState icon={FileText} title="Não foi possível carregar os orçamentos" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /> : (
            <GridTable<Quote> selectedIds={bulk.selected} onToggleSelect={bulk.toggle} onToggleSelectAll={bulk.togglePage}
              noDesktopCard keyExtractor={(q) => q.id} data={pag.paginatedData} isLoading={loading} onRowClick={(q) => navigate(`/orcamentos/${q.id}`)}
              emptyMessage={<EmptyState icon={FileText} title={search || status !== 'todos' ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento ainda'} description={search || status !== 'todos' ? 'Ajuste os filtros.' : 'Crie o primeiro orçamento ou deixe a Pixel IA gerar pelo WhatsApp.'} />}
              pagination={{ total: filtered.length, page: pag.page, pageSize: pag.pageSize, onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize }}
              columns={[
                { header: 'Nº', render: (q) => <span className="text-xs font-medium tabular-nums">#{q.number}</span> },
                { header: 'Cliente', render: (q) => (<div><p className="text-xs font-medium text-slate-800">{q.customer.name}</p>{q.source === 'whatsapp' && <p className="text-[11px] text-blue-600 mt-0.5 flex items-center gap-1"><MessageCircle size={10} />via WhatsApp</p>}{q.source === 'site' && <p className="text-[11px] text-emerald-600 mt-0.5">pelo site</p>}</div>) },
                { header: 'Data', hideOnMobile: true, render: (q) => <span className="text-xs whitespace-nowrap">{dateLabel(q.createdAt)}</span> },
                { header: 'Total', render: (q) => <span className="text-xs font-semibold tabular-nums whitespace-nowrap">{brl(q.total)}</span> },
                { header: 'Situação', render: (q) => <Badge size="sm" dot color={quoteStatus[q.status].color}>{quoteStatus[q.status].label}</Badge> },
                {
                  header: '', className: 'w-12', render: (q) => (
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <IconButton variant="ghost" size="xs" aria-label={`Excluir orçamento ${q.number}`} disabled={(q.orders?.length ?? 0) > 0} title={(q.orders?.length ?? 0) > 0 ? 'Já virou ordem de serviço' : ''} onClick={() => setRemoving(q)}><Trash2 /></IconButton>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </ContentCard>
      </div>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir orçamento?" confirmLabel="Excluir orçamento"
        message={`O orçamento #${removing?.number ?? ''} será removido. Não dá para desfazer.`} />
    </PageWrapper>
  );
};

export default Quotes;
