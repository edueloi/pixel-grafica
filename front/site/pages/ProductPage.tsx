import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Minus, Plus, ShoppingCart, MessageCircle, Check, Clock, Loader2, PackageX, Flame } from 'lucide-react';
import { SITE, brl, calcPrice, num, priceFrom, siteGet, unitName, useCart, useSite, waLink, type SiteProductFull } from '../siteApi';
import { Gallery, ProductGrid, SectionHead, defaultQty, unitLabelPlural } from '../components';

const ProductPage: React.FC = () => {
  const { id = '' } = useParams();
  const { home } = useSite();
  const cart = useCart();
  const [p, setP] = useState<SiteProductFull | null>(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [added, setAdded] = useState(false);
  const wa = home!.company?.whatsapp;

  useEffect(() => {
    setP(null); setError(''); setAdded(false);
    siteGet<SiteProductFull>(`/products/${id}`).then((r) => { setP(r); setQty(defaultQty(r)); setNote(cart.items.find((i) => i.productId === r.id)?.note ?? ''); const inCart = cart.items.find((i) => i.productId === r.id); if (inCart) setQty(inCart.quantity); }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tiers = useMemo(() => (p ? [...p.priceTiers].sort((a, b) => a.minQty - b.minQty) : []), [p]);
  const calc = p ? calcPrice(p, qty) : null;

  if (error) return <div className="pxs-container py-24 text-center"><PackageX size={44} className="mx-auto text-slate-400 mb-3" /><p className="text-lg font-semibold text-slate-800">{error}</p><Link to={`${SITE}/catalogo`} className="inline-flex mt-5 h-11 px-6 items-center rounded-full bg-blue-600 text-white font-semibold">Ver o catálogo</Link></div>;
  if (!p) return <div role="status" className="py-32 flex items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={20} />Carregando produto…</div>;

  const price = priceFrom(p);
  const pack = p.pricingMode === 'package';
  const step = pack ? 0 : p.unit === 'milheiro' ? 1 : p.minQty >= 100 ? 50 : 1;
  const message = `Olá! Quero um orçamento de ${num(qty)} ${unitLabelPlural(p.unit, qty)} de ${p.name}${note ? ` (${note})` : ''}.`;

  const add = () => { cart.add(p.id, qty, note.trim() || undefined); setAdded(true); setTimeout(() => setAdded(false), 2000); };

  return (
    <div className="pxs-container py-8 sm:py-12">
      <nav aria-label="Você está em" className="flex items-center gap-1.5 text-sm text-slate-500 mb-6 flex-wrap">
        <Link to={SITE} className="hover:text-blue-700">Início</Link><ChevronRight size={14} />
        <Link to={`${SITE}/catalogo`} className="hover:text-blue-700">Catálogo</Link><ChevronRight size={14} />
        <Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(p.category)}`} className="hover:text-blue-700">{p.category}</Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-start">
        <Gallery p={p} />

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">{p.category}</span>
            {price.old && <span className="inline-flex items-center gap-1 rounded-full bg-pink-600 text-white text-[11px] font-bold px-2.5 py-1"><Flame size={12} />Oferta</span>}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{p.name}</h1>
          {p.leadTime && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600"><Clock size={15} />Prazo de produção: {p.leadTime}</p>}

          <div className="mt-5">
            <p className="text-sm text-slate-500">{pack ? 'a partir de' : price.old ? 'de' : 'a partir de'}{price.old && <span className="ml-1 line-through">{brl(price.old)}</span>}</p>
            <p className="flex items-baseline gap-2"><span className="text-4xl font-bold text-slate-900 tabular-nums">{brl(price.amount)}</span><span className="text-slate-500">{price.caption}</span></p>
          </div>

          {/* calculadora */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-900 mb-3">Calcule o seu valor</p>
            {pack ? (
              <label className="block"><span className="text-sm text-slate-600">Quantidade</span>
                <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 bg-white">
                  {tiers.map((t) => <option key={t.minQty} value={t.minQty}>{num(t.minQty)} {unitLabelPlural(p.unit, t.minQty)} — {brl(t.price)}</option>)}
                </select>
              </label>
            ) : (
              <div>
                <span className="text-sm text-slate-600">Quantidade ({unitName[p.unit]})</span>
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" aria-label="Diminuir quantidade" onClick={() => setQty((q) => Math.max(p.minQty || 1, q - Math.max(1, step)))} className="h-12 w-12 rounded-xl border border-slate-300 bg-white flex items-center justify-center hover:border-blue-500"><Minus size={18} /></button>
                  <input type="number" inputMode="numeric" min={p.minQty || 1} value={qty} onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Quantidade" className="h-12 flex-1 min-w-0 text-center text-lg font-semibold rounded-xl border border-slate-300 bg-white outline-none focus:border-blue-500" />
                  <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty((q) => q + Math.max(1, step))} className="h-12 w-12 rounded-xl border border-slate-300 bg-white flex items-center justify-center hover:border-blue-500"><Plus size={18} /></button>
                </div>
                {tiers.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{tiers.slice(0, 6).map((t) => <button key={t.minQty} type="button" onClick={() => setQty(t.minQty)} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-xs font-medium hover:border-blue-500">{num(t.minQty)}</button>)}</div>}
              </div>
            )}
            <div className="mt-4 rounded-xl bg-white border border-slate-200 p-4" aria-live="polite">
              {calc?.ok
                ? <><p className="text-sm text-slate-500">Total estimado</p><p className="text-3xl font-bold text-blue-700 tabular-nums">{brl(calc.total)}</p><p className="text-xs text-slate-500">{brl(calc.unit)} por {unitName[p.unit]}{calc.offer ? ' · preço de oferta aplicado' : ''}</p></>
                : <p className="text-sm text-amber-700">{calc?.error}</p>}
            </div>
            <label className="block mt-4"><span className="text-sm text-slate-600">Detalhes do pedido (formato, papel, acabamento…)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 150))} placeholder="Opcional" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500" />
            </label>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={add} disabled={!calc?.ok} className={`h-12 rounded-full font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${added ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{added ? <><Check size={18} />Adicionado!</> : <><ShoppingCart size={18} />Adicionar ao orçamento</>}</button>
              {wa && <a href={waLink(wa, message)} target="_blank" rel="noreferrer" className="h-12 rounded-full bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-emerald-600"><MessageCircle size={18} />Pedir pelo WhatsApp</a>}
            </div>
            {cart.items.length > 0 && <Link to={`${SITE}/orcamento`} className="mt-3 block text-center text-sm font-semibold text-blue-700 hover:underline">Ver meu orçamento ({cart.items.length} {cart.items.length === 1 ? 'item' : 'itens'})</Link>}
            <p className="mt-3 text-xs text-slate-500">Valores de tabela para impressão padrão; sujeitos a confirmação no orçamento.</p>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {p.description && <section><h2 className="text-xl font-bold text-slate-900 mb-3">Sobre o produto</h2><p className="text-slate-600 leading-relaxed whitespace-pre-line">{p.description}</p></section>}
          {p.howItWorks && <section><h2 className="text-xl font-bold text-slate-900 mb-3">Como funciona</h2><p className="text-slate-600 leading-relaxed whitespace-pre-line">{p.howItWorks}</p></section>}
        </div>
        {tiers.length > 0 && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 h-fit">
            <h2 className="font-bold text-slate-900 mb-3">{pack ? 'Quantidades e valores' : 'Preço por quantidade'}</h2>
            <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
              {!pack && <tr><td className="py-2 text-slate-600">a partir de {num(p.minQty || 1)}</td><td className="py-2 text-right font-semibold tabular-nums">{brl(p.price)}</td></tr>}
              {tiers.map((t) => <tr key={t.minQty}><td className="py-2 text-slate-600">{pack ? `${num(t.minQty)} ${unitLabelPlural(p.unit, t.minQty)}` : `a partir de ${num(t.minQty)}`}</td><td className="py-2 text-right font-semibold tabular-nums">{brl(t.price)}{pack ? '' : ' cada'}</td></tr>)}
            </tbody></table>
          </aside>
        )}
      </div>

      {p.related.length > 0 && <section className="mt-16"><SectionHead title="Você também pode gostar" /><ProductGrid items={p.related} /></section>}
    </div>
  );
};

export default ProductPage;
