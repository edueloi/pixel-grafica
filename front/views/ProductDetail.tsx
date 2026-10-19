import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, Pencil, Loader2, Calculator, Trash2 } from 'lucide-react';
import { PageWrapper, ContentCard, PanelCard, DetailField, Button, Badge, EmptyState, Input, ConfirmModal, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { brl, unitLabel } from '../utils/format';
import { quoteFor, tiersOf } from '../utils/pricing';
import type { Product } from '../types';

const ProductDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: p, loading, error, reload } = useLoad(() => api.get<Product>(`/products/${id}`), [id]);
  const [qty, setQty] = useState('');
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !p) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando produto…</div></PageWrapper>;
  if (error || !p) {
    return <PageWrapper><div className="space-y-4"><BackBar to="/produtos" label="Voltar para produtos" /><ContentCard><EmptyState icon={Package} title={error ? 'Não foi possível carregar o produto' : 'Produto não encontrado'} description={error ? 'Confira a conexão e tente novamente.' : 'Ele pode ter sido excluído.'}
      action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/produtos')}>Voltar para produtos</Button>{error && <Button onClick={() => reload()}>Tentar novamente</Button>}</div>} /></ContentCard></div></PageWrapper>;
  }

  const u = unitLabel[p.unit] ?? 'unidade';
  const plural: Record<string, string> = { unidade: 'unidades', milheiro: 'milheiros', folha: 'folhas' };
  const qtyLabel = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? u : plural[u] ?? u}`;
  const tiers = tiersOf(p);
  const pack = p.pricingMode === 'package';
  const sim = qty ? quoteFor(p, Number(qty)) : null;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await api.del<{ inactivated: boolean }>(`/products/${p.id}`); toast.success(r.inactivated ? 'Produto já foi usado e ficou inativo.' : 'Produto excluído.'); navigate('/produtos'); }
    catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/produtos" label="Voltar para produtos">
          <Button variant="outline" size="sm" iconLeft={<Trash2 size={14} />} onClick={() => setRemoving(true)}>Excluir</Button>
          <Button size="sm" iconLeft={<Pencil size={14} />} onClick={() => navigate(`/produtos/${p.id}/editar`)}>Editar</Button>
        </BackBar>

        <ContentCard padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-14 w-14 rounded-lg border border-blue-100 bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><Package size={24} /></span>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 break-words">{p.name}</h1>
                <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5"><Badge size="sm">{p.category}</Badge><Badge size="sm" dot color={p.active ? 'success' : 'default'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>{pack && <Badge size="sm" color="orange">Tabela fechada</Badge>}</p>
              </div>
            </div>
            <div className="text-right"><p className="text-[11px] text-slate-500">{pack ? 'A partir de' : `Preço por ${u}`}</p><p className="text-xl font-semibold tabular-nums text-blue-700">{brl(p.price)}</p></div>
          </div>
        </ContentCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PanelCard title={pack ? 'Quantidades e valores' : 'Preço por quantidade'}>
            {tiers.length === 0 && !pack ? <p className="text-xs text-slate-500 py-1">Mesmo preço para qualquer quantidade: {brl(p.price)} por {u}.</p> : (
              <ul className="divide-y divide-slate-100">
                {!pack && <li className="py-2 flex justify-between text-[13px]"><span>De {p.minQty.toLocaleString('pt-BR')} {tiers[0] ? `até ${(tiers[0].minQty - 1).toLocaleString('pt-BR')}` : 'em diante'}</span><span className="tabular-nums font-medium">{brl(p.price)} cada</span></li>}
                {tiers.map((t, i) => (
                  <li key={i} className="py-2 flex justify-between text-[13px]">
                    <span>{pack ? qtyLabel(t.minQty) : `A partir de ${t.minQty.toLocaleString('pt-BR')}`}</span>
                    <span className="tabular-nums font-medium">{pack ? `${brl(t.price)} no total` : `${brl(t.price)} cada`}</span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
          <PanelCard title="Simulador de preço" icon={Calculator} description="Mesmo cálculo que o orçamento e a Pixel IA usam.">
            <div className="space-y-2">
              <Input label={`Quantidade (${u})`} type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ex.: 10" />
              {sim && (sim.ok
                ? <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-[13px]"><p>Total: <b className="text-blue-700 tabular-nums">{brl(sim.total)}</b></p><p className="text-xs text-slate-600">{brl(sim.unitPrice)} por {u}</p></div>
                : <p role="status" className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">{sim.error}</p>)}
            </div>
          </PanelCard>
        </div>

        <PanelCard title="Detalhes">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <DetailField label="Prazo de produção" value={p.leadTime ?? ''} />
            <DetailField label="Quantidade mínima" value={qtyLabel(p.minQty)} />
            <div className="sm:col-span-2"><DetailField label="Descrição" value={p.description ?? ''} /></div>
            <div className="sm:col-span-2"><DetailField label="Como funciona" value={p.howItWorks ?? ''} /></div>
          </dl>
        </PanelCard>
      </div>
      <ConfirmModal isOpen={removing} onClose={() => setRemoving(false)} onConfirm={remove} loading={busy} variant="danger" title="Excluir produto?" confirmLabel="Excluir produto"
        message="O produto será removido. Se já foi usado em orçamentos ou pedidos, apenas ficará inativo." />
    </PageWrapper>
  );
};

export default ProductDetail;
