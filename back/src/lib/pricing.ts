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

export interface ProductOption { name: string; price: number; kind: "acabamento" | "servico" }
/** Opcionais do produto (acabamentos e serviços com preço fechado por pedido). */
export function parseOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o: any) => ({ name: String(o?.name ?? "").trim().slice(0, 80), price: Math.round(Number(o?.price) * 100) / 100, kind: o?.kind === "servico" ? "servico" as const : "acabamento" as const }))
    .filter((o) => o.name && Number.isFinite(o.price) && o.price >= 0)
    .slice(0, 12);
}

export interface ProductVariants { sizes: { name: string; surcharge: number }[]; colors: { name: string; hex?: string }[] }
/** Tamanhos (com acréscimo por peça) e cores do produto, para roupas. null = produto sem variações. */
export function parseVariants(raw: unknown): ProductVariants | null {
  const r = raw as any;
  const sizes = (Array.isArray(r?.sizes) ? r.sizes : [])
    .map((s: any) => ({ name: String(s?.name ?? "").trim().slice(0, 20), surcharge: Math.max(0, Math.round(Number(s?.surcharge ?? 0) * 100) / 100) || 0 }))
    .filter((s: { name: string }) => s.name).slice(0, 20);
  const colors = (Array.isArray(r?.colors) ? r.colors : [])
    .map((c: any) => ({ name: String(c?.name ?? "").trim().slice(0, 40), ...(/^#[0-9a-f]{6}$/i.test(String(c?.hex ?? "")) ? { hex: String(c.hex).toLowerCase() } : {}) }))
    .filter((c: { name: string }) => c.name).slice(0, 24);
  return sizes.length || colors.length ? { sizes, colors } : null;
}

export type SizeQuote = { ok: true; qty: number; unitPrice: number; total: number; lines: { size: string; quantity: number; unitPrice: number; total: number }[] } | { ok: false; error: string };
/** Preço por tamanhos: a faixa de preço vale pelo TOTAL de peças; cada peça paga o acréscimo do seu tamanho. */
export function quoteSizes(p: POffer, variants: ProductVariants | null, wanted: Record<string, number>): SizeQuote {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");
  const picks: { size: string; surcharge: number; quantity: number }[] = [];
  for (const [name, q] of Object.entries(wanted)) {
    const quantity = Math.floor(Number(q));
    if (!(quantity > 0)) continue;
    const v = variants?.sizes.find((s) => norm(s.name) === norm(name));
    if (!v) return { ok: false, error: `Tamanho "${name}" não existe neste produto. Tamanhos: ${(variants?.sizes ?? []).map((s) => s.name).join(", ") || "nenhum"}.` };
    picks.push({ size: v.name, surcharge: v.surcharge, quantity });
  }
  const qty = picks.reduce((s, x) => s + x.quantity, 0);
  if (!(qty > 0)) return { ok: false, error: "Escolha ao menos uma peça." };
  const base = quoteWithOffer(p, qty);
  if (!base.ok) return { ok: false, error: base.error };
  const lines = picks.map((x) => ({ size: x.size, quantity: x.quantity, unitPrice: r6(base.unitPrice + x.surcharge), total: r2((base.unitPrice + x.surcharge) * x.quantity) }));
  const total = r2(lines.reduce((s, l) => s + l.total, 0));
  return { ok: true, qty, unitPrice: base.unitPrice, total, lines };
}

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
