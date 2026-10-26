// Acesso à API pública do site (sem login) e regras de exibição de preço (mesma conta do servidor, com oferta).
import { createContext, useContext, useSyncExternalStore } from 'react';

export const SITE = '/pagina-teste-site';

export type Unit = 'un' | 'milheiro' | 'm2' | 'folha';
export interface Tier { minQty: number; price: number }
export interface SiteProduct {
  id: string; name: string; category: string; unit: Unit; pricingMode: 'unit' | 'package'; minQty: number; leadTime?: string | null;
  price: number; offerPrice: number | null; featured: boolean; priceTiers: Tier[]; description: string | null; images: string[];
}
export interface SiteProductFull extends SiteProduct { howItWorks: string | null; related: SiteProduct[] }
export interface SiteBanner { id: string; title: string; subtitle?: string | null; buttonText?: string | null; buttonUrl?: string | null; hasImage: boolean }
export interface SiteCompany {
  name: string; tagline?: string | null; phone?: string | null; email?: string | null; instagram?: string | null; website?: string | null; address?: string | null;
  hours?: string | null; aboutText?: string | null; payment?: string | null; delivery?: string | null; artService?: string | null; whatsapp: string; hasLogo: boolean; logoVersion: number;
}
export interface SiteHome { company: SiteCompany | null; banners: SiteBanner[]; products: SiteProduct[]; popular: string[]; catalogs: { id: string; name: string; size: number }[] }

export async function siteGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/site${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Não foi possível carregar agora.');
  return res.json();
}
export async function sitePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/site${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Não foi possível enviar agora. Tente de novo.');
  return data as T;
}

export const imgUrl = (id: string, thumb = true) => `/api/site/images/${id}${thumb ? '?size=thumb' : ''}`;
export const bannerUrl = (id: string) => `/api/site/banner/${id}`;
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (n: number) => n.toLocaleString('pt-BR');
export const unitName: Record<Unit, string> = { un: 'unidade', milheiro: 'milheiro', m2: 'm²', folha: 'folha' };
export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
export const fileSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** "A partir de" para cartões: preço unitário (com oferta) ou o menor pacote da tabela fechada. */
export function priceFrom(p: SiteProduct): { amount: number; old?: number; caption: string } {
  if (p.pricingMode === 'package') {
    const first = [...p.priceTiers].sort((a, b) => a.minQty - b.minQty)[0];
    return first ? { amount: first.price, caption: `${num(first.minQty)} un` } : { amount: p.price, caption: unitName[p.unit] };
  }
  return p.offerPrice ? { amount: p.offerPrice, old: p.price, caption: `por ${unitName[p.unit]}` } : { amount: p.price, caption: `por ${unitName[p.unit]}` };
}

export type Calc = { ok: true; unit: number; total: number; offer: boolean } | { ok: false; error: string };
/** Mesma regra do servidor (back/src/lib/pricing.ts), para o cliente ver o valor enquanto digita. */
export function calcPrice(p: SiteProduct, qty: number): Calc {
  if (!(qty > 0)) return { ok: false, error: 'Informe a quantidade.' };
  const tiers = [...p.priceTiers].sort((a, b) => a.minQty - b.minQty);
  if (p.pricingMode === 'package') {
    const hit = tiers.find((t) => t.minQty === qty);
    return hit ? { ok: true, total: hit.price, unit: hit.price / qty, offer: false }
      : { ok: false, error: `Temos este produto em ${tiers.map((t) => num(t.minQty)).join(', ')} un. Outra quantidade? Peça o orçamento e a gente confirma.` };
  }
  if (p.minQty && qty < p.minQty) return { ok: false, error: `Quantidade mínima: ${num(p.minQty)}.` };
  let price = p.price;
  for (const t of tiers) if (qty >= t.minQty) price = t.price;
  const offer = !!p.offerPrice && p.offerPrice < price;
  if (offer) price = p.offerPrice!;
  return { ok: true, unit: price, total: Math.round(price * qty * 100) / 100, offer };
}

// ── Dados da página (carregados uma vez e divididos entre as telas) ───────────
export interface SiteCtx { home: SiteHome | null; error: string; reload: () => void }
export const SiteContext = createContext<SiteCtx>({ home: null, error: '', reload: () => {} });
export const useSite = () => useContext(SiteContext);

// ── "Meu orçamento": itens escolhidos, guardados no navegador ─────────────────
export interface CartItem { productId: string; quantity: number; note?: string }
const KEY = 'pixel.site.cart';
const listeners = new Set<() => void>();
let snapshot: CartItem[] = read();

function read(): CartItem[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((i) => i?.productId && i.quantity > 0) : []; } catch { return []; }
}
function write(items: CartItem[]) {
  snapshot = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* sem armazenamento: vale só nesta aba */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useCart() {
  const items = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  return {
    items,
    count: items.length,
    add: (productId: string, quantity: number, note?: string) => {
      const found = snapshot.find((i) => i.productId === productId);
      write(found ? snapshot.map((i) => (i.productId === productId ? { ...i, quantity, note: note ?? i.note } : i)) : [...snapshot, { productId, quantity, note }]);
    },
    update: (productId: string, patch: Partial<CartItem>) => write(snapshot.map((i) => (i.productId === productId ? { ...i, ...patch } : i))),
    remove: (productId: string) => write(snapshot.filter((i) => i.productId !== productId)),
    clear: () => write([]),
  };
}
