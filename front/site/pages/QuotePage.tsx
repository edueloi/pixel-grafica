import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingCart, MessageCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { SITE, brl, calcPrice, extrasTotal, num, sitePost, unitName, useCart, useSite, waLink, type SiteProduct } from '../siteApi';
import { ProductImage, defaultQty } from '../components';

interface Done { number: number; total: number; unpriced: number; whatsappUrl: string | null }

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Meu orçamento: itens escolhidos, total estimado e envio (cria o orçamento no sistema e abre o WhatsApp). */
const QuotePage: React.FC = () => {
  const { home } = useSite();
  const cart = useCart();
  const wa = home!.company?.whatsapp;
  const byId = useMemo(() => new Map(home!.products.map((p) => [p.id, p])), [home]);
  const rows = cart.items.map((i) => ({ item: i, p: byId.get(i.productId) })).filter((r): r is { item: typeof r.item; p: SiteProduct } => !!r.p);
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  const lines = rows.map(({ item, p }) => ({ item, p, calc: calcPrice(p, item.quantity), extras: (p.options ?? []).filter((o) => item.extras?.includes(o.name)) }));
  const total = lines.reduce((s, l) => s + (l.calc.ok ? l.calc.total : 0) + extrasTotal(l.p, l.item.extras), 0);
  const unpriced = lines.filter((l) => !l.calc.ok).length;

  const summary = [
    `Olá! Gostaria de um orçamento:`,
    ...lines.map((l) => `• ${num(l.item.quantity)} × ${l.p.name}${l.item.note ? ` (${l.item.note})` : ''}${l.extras.length ? ` + ${l.extras.map((o) => o.name).join(', ')}` : ''}${l.calc.ok ? ` — ${brl(l.calc.total + extrasTotal(l.p, l.item.extras))}` : ''}`),
    total > 0 ? `Total estimado: ${brl(total)}` : '',
  ].filter(Boolean).join('\n');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!f.name.trim()) { setError('Informe o seu nome.'); return; }
    if (f.phone.replace(/\D/g, '').length < 10) { setError('Informe o seu WhatsApp com DDD.'); return; }
    setSending(true); setError('');
    try {
      const r = await sitePost<Done & { ok: boolean }>('/quote-request', { ...f, items: cart.items });
      setDone(r); cart.clear();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError((err as Error).message); } finally { setSending(false); }
  };

  if (done) {
    return (
      <div className="pxs-container py-16 sm:py-24 max-w-2xl text-center">
        <CheckCircle2 size={64} className="mx-auto text-emerald-500" />
        <h1 className="mt-5 text-3xl font-bold text-slate-900">Pedido de orçamento enviado!</h1>
        <p className="mt-3 text-slate-600">Recebemos o seu orçamento <b>nº {done.number}</b>{done.total > 0 ? <> com total estimado de <b>{brl(done.total)}</b></> : ''}. {done.unpriced > 0 ? 'Alguns itens têm valor sob consulta e a gente confirma com você. ' : ''}Agora é só continuar pelo WhatsApp para enviar a arte e combinar prazo e entrega.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {done.whatsappUrl && <a href={done.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-emerald-500 text-white font-semibold hover:bg-emerald-600"><MessageCircle size={18} />Continuar no WhatsApp</a>}
          <Link to={`${SITE}/catalogo`} className="inline-flex items-center h-12 px-7 rounded-full border border-slate-300 font-semibold text-slate-800 hover:border-blue-500">Voltar ao catálogo</Link>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="pxs-container py-24 text-center">
        <ShoppingCart size={48} className="mx-auto text-slate-300" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Seu orçamento está vazio</h1>
        <p className="mt-2 text-slate-600">Escolha produtos no catálogo e adicione aqui para ver o total.</p>
        <Link to={`${SITE}/catalogo`} className="inline-flex mt-6 h-12 px-7 items-center rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700">Ver o catálogo</Link>
      </div>
    );
  }

  return (
    <div className="pxs-container py-10 sm:py-14">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Meu orçamento</h1>
      <p className="mt-2 text-slate-600">Confira os itens, ajuste as quantidades e envie. Os valores são estimativas de tabela e a gente confirma com você.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-5 items-start">
        <ul className="lg:col-span-3 space-y-3">
          {lines.map(({ item, p, calc, extras }) => (
            <li key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex gap-4">
              <Link to={`${SITE}/produto/${p.id}`} className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl overflow-hidden bg-slate-100"><ProductImage p={p} className="h-full w-full" /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><Link to={`${SITE}/produto/${p.id}`} className="font-semibold text-slate-900 hover:text-blue-700 leading-snug block">{p.name}</Link><p className="text-xs text-slate-500">{p.category}</p></div>
                  <button type="button" aria-label={`Remover ${p.name}`} onClick={() => cart.remove(p.id)} className="h-9 w-9 shrink-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={18} /></button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {p.pricingMode === 'package'
                    ? <select aria-label={`Quantidade de ${p.name}`} value={item.quantity} onChange={(e) => cart.update(p.id, { quantity: Number(e.target.value) })} className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm">
                        {[...p.priceTiers].sort((a, b) => a.minQty - b.minQty).map((t) => <option key={t.minQty} value={t.minQty}>{num(t.minQty)} un</option>)}
                      </select>
                    : (
                      <div className="flex items-center gap-1.5">
                        <button type="button" aria-label="Diminuir" onClick={() => cart.update(p.id, { quantity: Math.max(p.minQty || 1, item.quantity - 1) })} className="h-10 w-10 rounded-lg border border-slate-300 flex items-center justify-center hover:border-blue-500"><Minus size={16} /></button>
                        <input type="number" inputMode="numeric" aria-label={`Quantidade de ${p.name}`} min={p.minQty || 1} value={item.quantity} onChange={(e) => cart.update(p.id, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="h-10 w-20 text-center rounded-lg border border-slate-300 font-semibold outline-none focus:border-blue-500" />
                        <button type="button" aria-label="Aumentar" onClick={() => cart.update(p.id, { quantity: item.quantity + 1 })} className="h-10 w-10 rounded-lg border border-slate-300 flex items-center justify-center hover:border-blue-500"><Plus size={16} /></button>
                        <span className="text-xs text-slate-500 ml-1">{unitName[p.unit]}</span>
                      </div>
                    )}
                  <p className="ml-auto text-right">{calc.ok ? <><span className="block text-lg font-bold text-slate-900 tabular-nums">{brl(calc.total)}</span><span className="text-[11px] text-slate-500">{brl(calc.unit)} cada{calc.offer ? ' · oferta' : ''}</span></> : <span className="text-xs text-amber-700 max-w-[200px] block">{calc.error}</span>}</p>
                </div>
                {extras.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Opcionais de ${p.name}`}>
                    {extras.map((o) => (
                      <li key={o.name} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs pl-3 pr-1.5 py-1">
                        {o.name} <b className="tabular-nums">+ {brl(o.price)}</b>
                        <button type="button" aria-label={`Remover ${o.name}`} onClick={() => cart.update(p.id, { extras: (item.extras ?? []).filter((x) => x !== o.name) })} className="h-5 w-5 rounded-full hover:bg-teal-100 flex items-center justify-center">×</button>
                      </li>
                    ))}
                  </ul>
                )}
                <input type="text" aria-label={`Detalhes de ${p.name}`} value={item.note ?? ''} onChange={(e) => cart.update(p.id, { note: e.target.value.slice(0, 150) })} placeholder="Detalhes: formato, papel, acabamento…" className="mt-3 w-full h-10 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-500" />
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:col-span-2 lg:sticky lg:top-24 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline justify-between"><span className="text-slate-600">Total estimado</span><span className="text-3xl font-bold text-blue-700 tabular-nums">{brl(total)}</span></div>
            {unpriced > 0 && <p className="mt-2 text-xs text-amber-700">{unpriced} {unpriced === 1 ? 'item tem' : 'itens têm'} valor sob consulta e não {unpriced === 1 ? 'entra' : 'entram'} no total.</p>}
            <p className="mt-2 text-xs text-slate-500">Arte e frete não incluídos no valor de tabela. Confirmamos tudo com você antes de produzir.</p>
          </div>

          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" noValidate>
            <h2 className="font-bold text-slate-900">Enviar meu pedido</h2>
            <label className="block"><span className="text-sm text-slate-600">Seu nome</span><input type="text" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 outline-none focus:border-blue-500" required /></label>
            <label className="block"><span className="text-sm text-slate-600">WhatsApp (com DDD)</span><input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} placeholder="(15) 99999-9999" className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 outline-none focus:border-blue-500" required /></label>
            <label className="block"><span className="text-sm text-slate-600">E-mail (opcional)</span><input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="text-sm text-slate-600">Observações (prazo, entrega, arte…)</span><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500" /></label>
            {/* campo-isca: pessoas não veem nem preenchem; robôs sim */}
            <div className="absolute -left-[9999px]" aria-hidden="true"><label>Site<input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label></div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={sending} className="w-full h-12 rounded-full bg-blue-600 text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60">{sending ? <><Loader2 size={18} className="animate-spin" />Enviando…</> : <><Send size={18} />Enviar pedido de orçamento</>}</button>
            {wa && <a href={waLink(wa, summary)} target="_blank" rel="noreferrer" className="w-full h-12 rounded-full border border-emerald-500 text-emerald-700 font-semibold inline-flex items-center justify-center gap-2 hover:bg-emerald-50"><MessageCircle size={18} />Prefiro mandar só pelo WhatsApp</a>}
          </form>
        </aside>
      </div>
    </div>
  );
};

export default QuotePage;
