// Preço de produto de gráfica. Dois modos:
//  • "unit": preço por unidade que cai por faixa de quantidade (camiseta: 1+ = R$ 60, 5+ = R$ 54, 10+ = R$ 49).
//  • "package": tabela fechada. O valor é o TOTAL para aquela quantidade exata (1.000 folhetos = R$ 215; 2.500 = R$ 295).
//    Quantidade fora da tabela não tem preço: é "sob consulta" e vai para uma pessoa.
export interface PriceTier { minQty: number; price: number }
export type PricingMode = "unit" | "package";

export function parseTiers(raw: unknown): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({ minQty: Number(t?.minQty), price: Number(t?.price) }))
    .filter((t) => Number.isFinite(t.minQty) && t.minQty > 0 && Number.isFinite(t.price) && t.price >= 0)
    .sort((a, b) => a.minQty - b.minQty);
}

interface P { price: unknown; priceTiers?: unknown; pricingMode?: string | null; minQty?: number }

export type Quote = { ok: true; unitPrice: number; total: number; exact: boolean } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6; // unitário: sem perder precisão em tabela fechada
const fmt = (n: number) => n.toLocaleString("pt-BR");

interface POffer extends P { offerPrice?: unknown }

/** Igual a quotePrice, mas aplica a oferta do produto (preço unitário promocional, só em preço por unidade): vale o menor preço. */
export function quoteWithOffer(p: POffer, qty: number): Quote & { offerApplied?: boolean } {
  const r = quotePrice(p, qty);
  const offer = Number(p.offerPrice);
  if (!r.ok || p.pricingMode === "package" || !(offer > 0) || offer >= r.unitPrice) return r;
  return { ok: true, unitPrice: r6(offer), total: r2(offer * qty), exact: false, offerApplied: true };
}

/** Total e preço por unidade para uma quantidade. Nunca inventa valor para quantidade fora de uma tabela fechada. */
export function quotePrice(p: P, qty: number): Quote {
  if (!(qty > 0)) return { ok: false, error: "Quantidade inválida." };
  const tiers = parseTiers(p.priceTiers);

  if (p.pricingMode === "package") {
    const hit = tiers.find((t) => t.minQty === qty);
    if (hit) return { ok: true, total: r2(hit.price), unitPrice: r6(hit.price / qty), exact: true };
    return { ok: false, error: `A gráfica só trabalha com este produto nas quantidades: ${tiers.map((t) => fmt(t.minQty)).join(", ")}. Diga isso ao cliente com naturalidade, informe o valor dessas opções (use calcular_preco com cada uma) e só chame um atendente se ele insistir em outra quantidade.` };
  }

  if (p.minQty && qty < p.minQty) return { ok: false, error: `Quantidade mínima deste produto: ${fmt(p.minQty)}.` };
  let price = Number(p.price);
  for (const t of tiers) if (qty >= t.minQty) price = t.price;
  return { ok: true, unitPrice: r6(price), total: r2(price * qty), exact: false };
}

/** Compatibilidade: preço por unidade na quantidade (0 se a quantidade não existe numa tabela fechada). */
export function unitPriceFor(p: P, qty: number): number {
  const q = quotePrice({ ...p, minQty: 0 }, qty);
  return q.ok ? q.unitPrice : Number(p.price);
}
