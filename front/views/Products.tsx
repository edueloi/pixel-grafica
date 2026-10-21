import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Trash2 } from 'lucide-react';
import {
  PageWrapper, SectionTitle, ContentCard, Button, IconButton, ConfirmModal, GridTable, EmptyState,
  FilterLine, FilterLineSection, FilterLineSearch, FilterLineSegmented, Badge, usePagination, useToast, Alert,
} from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useBulk } from '../src/hooks/useBulk';
import { BulkBar } from '../components/BulkBar';
import { brl, normalizeText, unitLabel } from '../utils/format';
import type { Product } from '../types';

/** Lista de produtos e preços. Clicar abre a página do produto (detalhe, simulador de preço e edição). */
const Products: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<Product[]>('/products?all=1'), []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('todas');
  const [removing, setRemoving] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => [...new Set((data ?? []).map((p) => p.category))].sort(), [data]);
  const filtered = useMemo(() => {
    const q = normalizeText(search.trim());
    return (data ?? []).filter((p) => (category === 'todas' || p.category === category) && (!q || normalizeText(`${p.name} ${p.category} ${p.description ?? ''}`).includes(q)));
  }, [data, search, category]);
  const pag = usePagination(filtered, 15);
  const bulk = useBulk(pag.paginatedData.map((x) => x.id), filtered.map((x) => x.id));
  const byId = new Map((filtered).map((x) => [x.id, x]));

  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      const r = await api.del<{ inactivated: boolean }>(`/products/${removing.id}`);
      toast.success(r.inactivated ? 'Produto já foi usado e ficou inativo.' : 'Produto excluído.');
      setRemoving(null); reload(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Produtos" icon={Package} description={`${data?.length ?? 0} produtos · base de preços do orçamento e da Pixel IA`}
          action={<Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate('/produtos/novo')}>Novo produto</Button>} />
        <Alert variant="info" title="Preços usados pela IA">Os valores e textos daqui são os que a Pixel IA informa aos clientes no WhatsApp. Produtos de “tabela fechada” só têm preço nas quantidades cadastradas; as demais são sob consulta.</Alert>

        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar produto ou categoria" aria-label="Buscar produtos" /></FilterLineSection>
          <FilterLineSection>
            <select aria-label="Filtrar por categoria" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700">
              <option value="todas">Todas as categorias</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-slate-500">{filtered.length} produto(s)</span>
            {(search || category !== 'todas') && <Button variant="ghost" size="xs" onClick={() => { setSearch(''); setCategory('todas'); }}>Limpar filtros</Button>}
          </FilterLineSection>
        </FilterLine>
        <BulkBar resource="products" noun="produtos" ids={bulk.ids} names={(id) => { const x = byId.get(id); return x ? x.name : id; }} totalCount={filtered.length} onSelectAll={bulk.selectAll} onClear={bulk.clear} onDone={() => { bulk.clear(); reload(true); }} deleteNote="Produtos já usados em orçamentos ou ordens de serviço não são apagados: ficam inativos." canToggleActive />

        <ContentCard padding="none">
          {error ? <EmptyState icon={Package} title="Não foi possível carregar os produtos" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /> : (
            <GridTable<Product> selectedIds={bulk.selected} onToggleSelect={bulk.toggle} onToggleSelectAll={bulk.togglePage}
              noDesktopCard keyExtractor={(p) => p.id} data={pag.paginatedData} isLoading={loading} onRowClick={(p) => navigate(`/produtos/${p.id}`)}
              emptyMessage={<EmptyState icon={Package} title={search || category !== 'todas' ? 'Nenhum produto encontrado' : 'Nenhum produto ainda'} description={search || category !== 'todas' ? 'Ajuste os filtros.' : 'Cadastre os produtos e preços da gráfica.'} />}
              pagination={{ total: filtered.length, page: pag.page, pageSize: pag.pageSize, onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize }}
              columns={[
                { header: 'Produto', render: (p) => (<div><p className="text-xs font-medium text-slate-800">{p.name}</p><p className="text-[11px] text-slate-500 mt-0.5 max-w-sm truncate">{p.description}</p></div>) },
                { header: 'Categoria', hideOnMobile: true, render: (p) => <Badge size="sm">{p.category}</Badge> },
                { header: 'Preço', render: (p) => (
                  <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                    {p.pricingMode === 'package' ? <><span className="font-normal text-slate-500">a partir de </span>{brl(p.price)}</> : <>{brl(p.price)} <span className="font-normal text-slate-500">/ {unitLabel[p.unit]}</span></>}
                  </span>) },
                { header: 'Prazo', hideOnMobile: true, render: (p) => <span className="text-xs whitespace-nowrap">{p.leadTime || <span className="text-slate-400">A consultar</span>}</span> },
                { header: 'Situação', hideOnMobile: true, render: (p) => <Badge size="sm" dot color={p.active ? 'success' : 'default'}>{p.active ? 'Ativo' : 'Inativo'}</Badge> },
                { header: '', className: 'w-12', render: (p) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton variant="ghost" size="xs" aria-label={`Excluir ${p.name}`} onClick={() => setRemoving(p)}><Trash2 /></IconButton></div> },
              ]}
            />
          )}
        </ContentCard>
      </div>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir produto?" confirmLabel="Excluir produto"
        message={`${removing?.name ?? ''} será removido. Se já foi usado em orçamentos ou pedidos, apenas ficará inativo.`} />
    </PageWrapper>
  );
};

export default Products;
