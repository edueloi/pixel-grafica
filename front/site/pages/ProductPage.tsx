import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Minus, Plus, ShoppingCart, MessageCircle, Check, Clock, Loader2, PackageX, Flame, Settings2 } from 'lucide-react';
import { SITE, brl, calcPrice, calcSizes, extrasTotal, num, priceFrom, siteGet, unitName, useCart, useSite, waLink, type SiteProductFull } from '../siteApi';
import { Gallery, ProductGrid, SectionHead, ShopShell, defaultQty, unitLabelPlural } from '../components';

const selectCls = 'mt-1 w-full h-10 px-3 rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const ProductPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { home } = useSite();
  const cart = useCart();
  const [p, setP] = useState<SiteProductFull | null>(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [added, setAdded] = useState(false);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [color, setColor] = useState('');
  const wa = home!.company?.whatsapp;

  useEffect(() => {
    setP(null); setError(''); setAdded(false);
    siteGet<SiteProductFull>(`/products/${id}`).then((r) => {
      setP(r);
      const inCart = cart.items.find((i) => i.productId === r.id);
      setQty(inCart?.quantity ?? defaultQty(r)); setNote(inCart?.note ?? ''); setChosen(inCart?.extras ?? []);
      setSizes(inCart?.sizes ?? {}); setColor(inCart?.color ?? r.variants?.colors[0]?.name ?? '');
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tiers = useMemo(() => (p ? [...p.priceTiers].sort((a, b) => a.minQty - b.minQty) : []), [p]);
  const categories = useMemo(() => [...new Set(home!.products.map((x) => x.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [home]);
  const siblings = useMemo(() => (p ? home!.products.filter((x) => x.category === p.category) : []), [home, p]);
  const hasSizes = !!p?.variants?.sizes.length;
  const sc = p && hasSizes ? calcSizes(p, sizes) : null;
  const calc = p ? (sc ? (sc.ok ? { ok: true as const, unit: sc.unit, total: sc.total, offer: false } : sc) : calcPrice(p, qty)) : null;
  const pieces = sc?.ok ? sc.qty : hasSizes ? 0 : qty;
  const sizeText = sc?.ok ? sc.lines.map((l) => `${l.quantity} ${l.size}`).join(', ') : '';

  if (error) return <div className="pxs-container py-24 text-center"><PackageX size={44} className="mx-auto text-slate-400 mb-3" /><p className="text-lg font-semibold text-slate-800">{error}</p><Link to={`${SITE}/catalogo`} className="inline-flex mt-5 h-11 px-6 items-center rounded-full bg-blue-600 text-white font-semibold">Ver o catálogo</Link></div>;
  if (!p) return <div role="status" className="py-32 flex items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={20} />Carregando produto…</div>;

  const price = priceFrom(p);
  const pack = p.pricingMode === 'package';
  const step = pack ? 0 : p.unit === 'milheiro' ? 1 : p.minQty >= 100 ? 50 : 1;
  const extras = extrasTotal(p, chosen);
  const total = (calc?.ok ? calc.total : 0) + extras;
  const finishing = p.options.filter((o) => o.kind === 'acabamento');
  const services = p.options.filter((o) => o.kind === 'servico');
  const toggle = (name: string) => setChosen((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));
  const message = [`Olá! Quero um orçamento de ${num(pieces)} ${unitLabelPlural(p.unit, pieces)} de ${p.name}${hasSizes ? ` (${color ? `cor ${color}, ` : ''}tamanhos: ${sizeText})` : note ? ` (${note})` : ''}.`, chosen.length ? `Opcionais: ${chosen.join(', ')}` : '', calc?.ok ? `Total estimado: ${brl(total)}` : ''].filter(Boolean).join('\n');
  const add = () => { cart.add(p.id, pieces, note.trim() || undefined, chosen, hasSizes ? { sizes, color } : undefined); setAdded(true); setTimeout(() => setAdded(false), 2000); };

  const renderOpt = (title: string, items: typeof p.options, card?: boolean) => (
    <fieldset key={title} className={`mt-5 ${card ? 'rounded-xl border border-slate-200 bg-white p-4' : ''}`}>
      <legend className="text-sm font-semibold text-slate-900 mb-2">{title}</legend>
      <ul className="space-y-2">
        {items.map((o) => (
          <li key={o.name}><label className="flex items-start gap-3 cursor-pointer rounded-lg px-1 py-1 hover:bg-slate-50">
            <input type="checkbox" checked={chosen.includes(o.name)} onChange={() => toggle(o.name)} className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-blue-600 shrink-0" />
            <span className="flex-1 text-sm text-slate-700">{o.name}</span>
            <span className="text-sm font-semibold text-teal-700 tabular-nums whitespace-nowrap">+ {brl(o.price)}</span>
          </label></li>
        ))}
      </ul>
    </fieldset>
  );

  return (
    <ShopShell active={p.category} label={p.category}>
      <nav aria-label="Você está em" className="flex items-center gap-1.5 text-xs text-slate-500 mb-4 flex-wrap">
        <Link to={SITE} className="hover:text-blue-700">Início</Link><ChevronRight size={14} />
        <Link to={`${SITE}/catalogo`} className="hover:text-blue-700">Catálogo</Link><ChevronRight size={14} />
        <Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(p.category)}`} className="hover:text-blue-700">{p.category}</Link>
      </nav>

      <div className="grid gap-8 xl:grid-cols-2 xl:gap-10 items-start">
        <div className="xl:sticky xl:top-24 rounded-2xl bg-white border border-slate-200 p-3 sm:p-4"><Gallery p={p} /></div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">{p.category}</span>
            {price.old && <span className="inline-flex items-center gap-1 rounded-full bg-pink-600 text-white text-[11px] font-bold px-2.5 py-1"><Flame size={12} />Oferta</span>}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">{p.name}</h1>
          {p.leadTime && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600"><Clock size={15} />Prazo de produção: {p.leadTime}</p>}

          <div className="mt-4">
            <p className="text-xs text-slate-500">{pack ? 'a partir de' : price.old ? 'de' : 'a partir de'}{price.old && <span className="ml-1 line-through">{brl(price.old)}</span>}</p>
            <p className="flex items-baseline gap-2"><span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{brl(price.amount)}</span><span className="text-slate-500">{price.caption}</span></p>
          </div>

          {/* opções do produto */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3"><Settings2 size={16} className="text-blue-600" />Opções do produto</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-sm text-slate-600">Categoria</span>
                <select value={p.category} onChange={(e) => { const first = home!.products.find((x) => x.category === e.target.value); if (first) navigate(`${SITE}/produto/${first.id}`); }} className={selectCls}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="block"><span className="text-sm text-slate-600">Produto / modelo</span>
                <select value={p.id} onChange={(e) => navigate(`${SITE}/produto/${e.target.value}`)} className={selectCls}>{siblings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </div>

            <div className="mt-4">
              {hasSizes ? (
                <div>
                  {p.variants!.colors.length > 0 && (
                    <fieldset className="mb-4">
                      <legend className="text-sm text-slate-600 mb-1.5">Cor: <b className="text-slate-900">{color}</b></legend>
                      <div className="flex flex-wrap gap-2">
                        {p.variants!.colors.map((c) => (
                          <button key={c.name} type="button" aria-pressed={color === c.name} onClick={() => setColor(c.name)} className={`flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border bg-white text-sm transition ${color === c.name ? 'border-blue-600 ring-2 ring-blue-100 font-semibold text-slate-900' : 'border-slate-300 text-slate-700 hover:border-slate-400'}`}>
                            <span className="h-6 w-6 rounded-full border border-slate-300" style={{ background: c.hex || '#e2e8f0' }} aria-hidden="true" />{c.name}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  <span className="text-sm text-slate-600">Tamanhos e quantidades</span>
                  <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {p.variants!.sizes.map((sz) => {
                      const n = sizes[sz.name] || 0;
                      const setN = (v: number) => setSizes((x) => ({ ...x, [sz.name]: Math.max(0, Math.min(9999, Math.floor(v) || 0)) }));
                      return (
                        <li key={sz.name} className={`flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 ${n > 0 ? 'border-blue-300' : 'border-slate-200'}`}>
                          <span className="text-sm text-slate-800"><b>{sz.name}</b>{sz.surcharge > 0 && <span className="ml-1.5 text-xs text-amber-700">+ {brl(sz.surcharge)} por peça</span>}</span>
                          <span className="flex items-center gap-1">
                            <button type="button" aria-label={`Diminuir ${sz.name}`} onClick={() => setN(n - 1)} className="h-8 w-8 rounded-md border border-slate-300 flex items-center justify-center hover:border-blue-500"><Minus size={14} /></button>
                            <input type="number" inputMode="numeric" min={0} value={n || ''} placeholder="0" aria-label={`Quantidade tamanho ${sz.name}`} onChange={(e) => setN(Number(e.target.value))} className="h-8 w-12 text-center text-sm font-semibold rounded-md border border-slate-300 outline-none focus:border-blue-500" />
                            <button type="button" aria-label={`Aumentar ${sz.name}`} onClick={() => setN(n + 1)} className="h-8 w-8 rounded-md border border-slate-300 flex items-center justify-center hover:border-blue-500"><Plus size={14} /></button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">Total de peças: <b>{num(pieces)}</b>{sc?.ok ? <> · Valor base por peça: <b>{brl(sc.unit)}</b></> : null}. A faixa de preço vale pelo total de peças do pedido.</p>
                </div>
              ) : pack ? (
                <label className="block"><span className="text-sm text-slate-600">Quantidade</span>
                  <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className={selectCls}>
                    {tiers.map((t) => <option key={t.minQty} value={t.minQty}>{num(t.minQty)} {unitLabelPlural(p.unit, t.minQty)} — {brl(t.price)}</option>)}
                  </select>
                </label>
              ) : (
                <div>
                  <span className="text-sm text-slate-600">Quantidade ({unitName[p.unit]})</span>
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" aria-label="Diminuir quantidade" onClick={() => setQty((q) => Math.max(p.minQty || 1, q - Math.max(1, step)))} className="h-10 w-10 rounded-lg border border-slate-300 bg-white flex items-center justify-center hover:border-blue-500"><Minus size={15} /></button>
                    <input type="number" inputMode="numeric" min={p.minQty || 1} value={qty} onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Quantidade" className="h-10 flex-1 min-w-0 text-center font-semibold rounded-lg border border-slate-300 bg-white outline-none focus:border-blue-500" />
                    <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty((q) => q + Math.max(1, step))} className="h-10 w-10 rounded-lg border border-slate-300 bg-white flex items-center justify-center hover:border-blue-500"><Plus size={15} /></button>
                  </div>
                  {tiers.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{tiers.slice(0, 6).map((t) => <button key={t.minQty} type="button" onClick={() => setQty(t.minQty)} className="h-7 px-2.5 rounded-full border border-slate-300 bg-white text-[11px] font-medium hover:border-blue-500">{num(t.minQty)}</button>)}</div>}
                  <p className="mt-2 text-xs text-slate-500">Mínimo: {num(p.minQty || 1)} {unitLabelPlural(p.unit, p.minQty || 1)}{calc?.ok ? <> · Valor unitário: <b>{brl(calc.unit)}</b></> : null}</p>
                </div>
              )}
            </div>

            {finishing.length > 0 && renderOpt('Acabamentos opcionais', finishing)}
            {services.length > 0 && renderOpt('Serviços opcionais', services, true)}

            <label className="block mt-5"><span className="text-sm text-slate-600">Detalhes do pedido (formato, papel, cores…)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 150))} placeholder="Opcional" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
            </label>

            <div className="mt-4 rounded-lg bg-white border border-slate-200 p-3.5" aria-live="polite">
              {calc?.ok ? (
                <>
                  <dl className="text-sm text-slate-600 space-y-1">
                    <div className="flex justify-between"><dt>Subtotal ({num(pieces)} {unitLabelPlural(p.unit, pieces)})</dt><dd className="tabular-nums">{brl(calc.total)}</dd></div>
                    {sc?.ok && sc.lines.map((l) => <div key={l.size} className="flex justify-between text-xs text-slate-500"><dt>{l.quantity} × {l.size}</dt><dd className="tabular-nums">{brl(l.unit)} cada</dd></div>)}
                    {extras > 0 && <div className="flex justify-between"><dt>Opcionais</dt><dd className="tabular-nums">+ {brl(extras)}</dd></div>}
                  </dl>
                  <p className="mt-2 text-sm text-slate-500">Total estimado</p>
                  <p className="text-2xl font-bold text-blue-700 tabular-nums">{brl(total)}</p>
                  {calc.offer && <p className="text-xs text-pink-600 font-medium">Preço de oferta aplicado</p>}
                </>
              ) : <p className="text-sm text-amber-700">{calc?.error}</p>}
            </div>

            <div className="mt-4 grid gap-2.5 2xl:grid-cols-2">
              <button type="button" onClick={add} disabled={!calc?.ok} className={`h-10 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${added ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{added ? <><Check size={15} />Adicionado!</> : <><ShoppingCart size={15} />Adicionar ao orçamento</>}</button>
              <button type="button" disabled={!calc?.ok} onClick={() => { cart.add(p.id, pieces, note.trim() || undefined, chosen, hasSizes ? { sizes, color } : undefined); navigate(`${SITE}/orcamento`); }} className="pxs-shimmer h-10 rounded-full bg-emerald-500 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-emerald-600 disabled:opacity-50"><MessageCircle size={15} />Pedir agora</button>
            </div>
            {cart.items.length > 0 && <Link to={`${SITE}/orcamento`} className="mt-3 block text-center text-sm font-semibold text-blue-700 hover:underline">Ver meu orçamento ({cart.items.length} {cart.items.length === 1 ? 'item' : 'itens'})</Link>}
            <p className="mt-3 text-xs text-slate-500">Valores de tabela para impressão padrão; sujeitos a confirmação no orçamento.</p>
          </div>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 h-fit empty:hidden">
          {p.description && <section><h2 className="text-base font-semibold text-slate-900 mb-2">Sobre o produto</h2><p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{p.description}</p></section>}
          {p.howItWorks && <section><h2 className="text-base font-semibold text-slate-900 mb-2">Como funciona</h2><p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{p.howItWorks}</p></section>}
        </div>
        {tiers.length > 0 && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">{pack ? 'Quantidades e valores' : 'Preço por quantidade'}</h2>
            <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
              {!pack && <tr><td className="py-2 text-slate-600">a partir de {num(p.minQty || 1)}</td><td className="py-2 text-right font-semibold tabular-nums">{brl(p.price)}</td></tr>}
              {tiers.map((t) => <tr key={t.minQty}><td className="py-2 text-slate-600">{pack ? `${num(t.minQty)} ${unitLabelPlural(p.unit, t.minQty)}` : `a partir de ${num(t.minQty)}`}</td><td className="py-2 text-right font-semibold tabular-nums">{brl(t.price)}{pack ? '' : ' cada'}</td></tr>)}
            </tbody></table>
          </aside>
        )}
      </div>

      {p.related.length > 0 && <section className="mt-14"><SectionHead title="Você também pode gostar" /><ProductGrid items={p.related} wide /></section>}
    </ShopShell>
  );
};

export default ProductPage;
