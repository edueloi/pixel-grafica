import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Combobox } from './ui';
import { brl, unitLabel } from '../utils/format';
import { quoteFor } from '../utils/pricing';
import type { LineItem, Product } from '../types';

export const lineTotal = (i: { quantity: number; unitPrice: number }) => Math.round((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * 100) / 100;
export const sumLines = (items: LineItem[]) => Math.round(items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;

/** Linhas de um orçamento/pedido. A quantidade é na unidade do produto (milheiro, m², unidade). */
export const ItemsEditor: React.FC<{ items: LineItem[]; products: Product[]; onChange: (items: LineItem[]) => void; disabled?: boolean }> = ({ items, products, onChange, disabled }) => {
  const update = (idx: number, patch: Partial<LineItem>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const productOf = (id?: string | null) => products.find((p) => p.id === id);

  const addProduct = (id: string) => {
    const p = productOf(id);
    if (!p) return;
    onChange([...items, { productId: p.id, description: p.name, quantity: p.minQty || 1, unitPrice: (() => { const r = quoteFor(p, p.minQty || 1); return r.ok ? r.unitPrice : p.price; })(), total: 0 }]);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-xs text-slate-500 py-2">Nenhum item. Escolha um produto abaixo ou adicione uma linha livre.</p>}
      {items.map((it, idx) => {
        // linhas de opcional ("Acabamento: …") têm valor fixo: não são recalculadas pela tabela do produto
        const p = /^(Acabamento|Serviço): /.test(it.description) ? undefined : productOf(it.productId);
        return (
          <div key={idx} className="rounded-lg border border-slate-200 p-2.5 space-y-2 bg-white">
            <div className="flex items-start gap-2">
              <Input aria-label="Descrição do item" value={it.description} disabled={disabled} onChange={(e) => update(idx, { description: e.target.value })} wrapperClassName="flex-1" placeholder="Descrição (formato, papel, acabamento…)" />
              <IconButton variant="ghost" size="sm" aria-label="Remover item" disabled={disabled} onClick={() => onChange(items.filter((_, i) => i !== idx))}><Trash2 /></IconButton>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <Input label={`Qtd.${p ? ` (${unitLabel[p.unit]})` : ''}`} type="number" min={0} step="any" value={it.quantity} disabled={disabled} onChange={(e) => { const q = Number(e.target.value); const r = p ? quoteFor(p, q) : null; update(idx, { quantity: q, ...(r && r.ok ? { unitPrice: r.unitPrice } : {}) }); }} />
              <Input label="Preço unit." type="number" min={0} step="any" value={it.unitPrice} disabled={disabled} onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })} />
              <div className="text-right pb-2"><p className="text-[11px] text-slate-500">Total</p><p className="text-[13px] font-semibold tabular-nums">{brl(lineTotal(it))}</p></div>
            </div>
            {p && !!it.description && (p.options?.length ?? 0) > 0 && !/^(Acabamento|Serviço): /.test(it.description) && (
              <fieldset className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2">
                <legend className="px-1 text-[11px] font-medium text-slate-600">Opcionais deste produto</legend>
                <ul className="space-y-1">
                  {p.options!.map((o) => {
                    const desc = `${o.kind === 'servico' ? 'Serviço' : 'Acabamento'}: ${o.name} (${p.name})`;
                    const on = items.some((x) => x.description === desc);
                    return (
                      <li key={o.name}><label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" disabled={disabled} checked={on}
                          onChange={() => onChange(on ? items.filter((x) => x.description !== desc) : [...items, { productId: p.id, description: desc, quantity: 1, unitPrice: o.price, total: 0 }])} />
                        <span className="flex-1">{o.name}</span><span className="tabular-nums font-medium text-teal-700">+ {brl(o.price)}</span>
                      </label></li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
            {p && (() => { const r = quoteFor(p, it.quantity); return r.ok ? null : <p role="status" className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">{r.error} O preço unitário acima não foi recalculado: confira antes de salvar.</p>; })()}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px]">
          <Combobox size="md" disabled={disabled} value="" placeholder="+ Adicionar produto…" searchPlaceholder="Buscar produto (ex.: banner, folheto, cartão, camiseta)" emptyMessage="Nenhum produto encontrado."
            options={products.filter((p) => p.active).map((p) => ({
              value: p.id, label: p.name, group: p.category,
              badge: p.pricingMode === 'package' ? `a partir de ${brl(p.price)}` : `${brl(p.price)}/${unitLabel[p.unit]}`, badgeColor: 'bg-blue-50 text-blue-700',
            }))}
            onChange={(v) => { const id = Array.isArray(v) ? v[0] : v; if (id) addProduct(id); }} />
        </div>
        <Button variant="outline" size="sm" disabled={disabled} iconLeft={<Plus size={14} />} onClick={() => onChange([...items, { description: '', quantity: 1, unitPrice: 0, total: 0 }])}>Linha livre</Button>
      </div>
    </div>
  );
};
