import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, IconButton, ConfirmModal, GridTable, EmptyState,
  FilterLine, FilterLineSection, FilterLineSearch, usePagination, useToast,
} from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useBulk } from '../src/hooks/useBulk';
import { BulkBar } from '../components/BulkBar';
import { digits, maskPhone, normalizeText } from '../utils/format';
import type { Customer } from '../types';

/** Lista de clientes. Clicar abre a página do cliente (dados, pedidos, orçamentos e arquivos). */
const Customers: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Customer[]>('/customers'), []);
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeText(search.trim());
    const d = digits(search);
    return (data ?? []).filter((c) => !q || normalizeText(`${c.name} ${c.company ?? ''} ${c.email ?? ''}`).includes(q) || (d.length >= 3 && `${c.phone ?? ''}${c.document ?? ''}`.includes(d)));
  }, [data, search]);
  const pag = usePagination(filtered, 15);
  const bulk = useBulk(pag.paginatedData.map((x) => x.id), filtered.map((x) => x.id));
  const byId = new Map((filtered).map((x) => [x.id, x]));

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      const r = await api.del<{ inactivated: boolean }>(`/customers/${removing.id}`);
      toast.success(r.inactivated ? 'Cliente tem histórico e foi inativado.' : 'Cliente excluído.');
      setRemoving(null); reload(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Clientes" icon={Users} description={`${data?.length ?? 0} cadastrados · quem compra da Pixel`}
          action={<Button size="sm" iconLeft={<UserPlus size={14} />} onClick={() => navigate('/clientes/novo')}>Novo cliente</Button>} />

        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar por nome, empresa, telefone ou CPF/CNPJ" aria-label="Buscar clientes" /></FilterLineSection>
          <FilterLineSection>
            <span className="text-xs text-slate-500">{filtered.length} cliente(s)</span>
            {search && <Button variant="ghost" size="xs" onClick={() => setSearch('')}>Limpar busca</Button>}
          </FilterLineSection>
        </FilterLine>
        <BulkBar resource="customers" noun="clientes" ids={bulk.ids} names={(id) => { const x = byId.get(id); return x ? x.name : id; }} totalCount={filtered.length} onSelectAll={bulk.selectAll} onClear={bulk.clear} onDone={() => { bulk.clear(); reload(true); }} deleteNote="Quem tem pedidos ou orçamentos não é apagado: fica inativo para manter o histórico." canToggleActive />

        <ContentCard padding="none">
          {error ? (
            <EmptyState icon={Users} title="Não foi possível carregar os clientes" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} />
          ) : (
            <GridTable<Customer> selectedIds={bulk.selected} onToggleSelect={bulk.toggle} onToggleSelectAll={bulk.togglePage}
              noDesktopCard keyExtractor={(c) => c.id} data={pag.paginatedData} isLoading={loading} onRowClick={(c) => navigate(`/clientes/${c.id}`)}
              emptyMessage={<EmptyState icon={Users} title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'} description={search ? 'Ajuste a busca.' : 'Cadastre o primeiro cliente para começar.'} />}
              pagination={{ total: filtered.length, page: pag.page, pageSize: pag.pageSize, onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize }}
              columns={[
                { header: 'Cliente', render: (c) => (<div><p className="text-xs font-medium text-slate-800">{c.name}</p>{c.company && <p className="text-[11px] text-slate-500 mt-0.5">{c.company}</p>}</div>) },
                { header: 'WhatsApp', render: (c) => <span className="text-xs whitespace-nowrap">{maskPhone(c.phone) || <span className="text-slate-400">Não informado</span>}</span> },
                { header: 'Cidade', hideOnMobile: true, render: (c) => <span className="text-xs">{c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : ''}</span> },
                { header: 'OS', hideOnMobile: true, render: (c) => <span className="text-xs tabular-nums">{c._count?.orders ?? 0}</span> },
                { header: '', className: 'w-12', render: (c) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton variant="ghost" size="xs" aria-label={`Excluir ${c.name}`} onClick={() => setRemoving(c)}><Trash2 /></IconButton></div> },
              ]}
            />
          )}
        </ContentCard>
      </div>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger"
        title="Excluir cliente?" confirmLabel="Excluir cliente"
        message={`${removing?.name ?? ''} será removido. Se tiver pedidos ou orçamentos, ele só será inativado para manter o histórico.`} />
    </PageWrapper>
  );
};

export default Customers;
