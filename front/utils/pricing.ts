// Mesma regra de preço do servidor (back/src/lib/pricing.ts), para simular e preencher itens sem ir à API.
import { unitLabel } from './format';
import type { Product } from '../types';

export type Quote = { ok: true; unitPrice: number; total: number } | { ok: false; error: string };
const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export const tiersOf = (p: Pick<Product, 'priceTiers'>) => [...(p.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty);

export function quoteFor(p: Pick<Product, 'price' | 'minQty' | 'priceTiers' | 'pricingMode' | 'unit'>, qty: number): Quote {
  if (!(qty > 0)) return { ok: false, error: 'Informe a quantidade.' };
  const tiers = tiersOf(p);
  if (p.pricingMode === 'package') {
    const hit = tiers.find((t) => t.minQty === qty);
    return hit ? { ok: true, total: r2(hit.price), unitPrice: r6(hit.price / qty) }
      : { ok: false, error: `Só há preço para ${tiers.map((t) => t.minQty.toLocaleString('pt-BR')).join(', ')} ${unitLabel[p.unit] ?? ''}. Outras quantidades: sob consulta.` };
  }
  if (p.minQty && qty < p.minQty) return { ok: false, error: `Quantidade mínima: ${p.minQty.toLocaleString('pt-BR')}.` };
  let price = Number(p.price);
  for (const t of tiers) if (qty >= t.minQty) price = t.price;
  return { ok: true, unitPrice: r6(price), total: r2(price * qty) };
}
