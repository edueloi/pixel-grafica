import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight, Plus, Check, Image as ImageIcon, X, Flame, Star } from 'lucide-react';
import { SITE, bannerUrl, brl, imgUrl, priceFrom, unitName, useCart, type SiteBanner, type SiteProduct } from './siteApi';

// ── Títulos de seção ──────────────────────────────────────────────────────────
export const SectionHead: React.FC<{ eyebrow?: string; title: string; text?: string; action?: React.ReactNode; light?: boolean }> = ({ eyebrow, title, text, action, light }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div className="max-w-2xl">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600 mb-2">{eyebrow}</p>}
      <h2 className={`text-2xl sm:text-3xl font-bold ${light ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
      {text && <p className={`mt-2 text-sm sm:text-base ${light ? 'text-slate-300' : 'text-slate-600'}`}>{text}</p>}
    </div>
    {action}
  </div>
);

// ── Botão/link do banner: âncora (#ofertas), página interna (/…) ou link externo ─
const BannerButton: React.FC<{ text: string; url?: string | null }> = ({ text, url }) => {
  const cls = 'inline-flex items-center gap-2 h-12 px-6 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 transition-colors';
  if (!url || url.startsWith('#')) return <Link to={{ pathname: SITE, hash: url || '#catalogo' }} className={cls}>{text}<ArrowRight size={18} /></Link>;
  if (url.startsWith('/')) return <Link to={url.startsWith(SITE) ? url : `${SITE}${url}`} className={cls}>{text}<ArrowRight size={18} /></Link>;
  return <a href={url} target="_blank" rel="noreferrer" className={cls}>{text}<ArrowRight size={18} /></a>;
};

// ── Carrossel de banners ──────────────────────────────────────────────────────
export interface Slide { key: string; title: string; subtitle?: string | null; buttonText?: string | null; buttonUrl?: string | null; image?: string }
export const slidesFrom = (banners: SiteBanner[]): Slide[] => banners.map((b) => ({ key: b.id, title: b.title, subtitle: b.subtitle, buttonText: b.buttonText, buttonUrl: b.buttonUrl, image: b.hasImage ? bannerUrl(b.id) : undefined }));

export const HeroCarousel: React.FC<{ slides: Slide[] }> = ({ slides }) => {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (n < 2 || paused || reduce) return;
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % n); }, 6500);
    return () => clearInterval(t);
  }, [n, paused, reduce]);

  return (
    <section className="relative bg-slate-900 text-white overflow-hidden" aria-roledescription="carrossel" aria-label="Destaques"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current === null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 50) go(i + (d < 0 ? 1 : -1)); touch.current = null; }}>
      <div className="relative h-[460px] sm:h-[520px] lg:h-[560px]">
        {slides.map((s, idx) => (
          <div key={s.key} className={`pxs-slide absolute inset-0 ${idx === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={idx !== i} role="group" aria-roledescription="slide" aria-label={`${idx + 1} de ${n}`}>
            {s.image ? <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} fetchPriority={idx === 0 ? 'high' : 'auto'} /> : <div className="pxs-hero-bg absolute inset-0" />}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-transparent" />
            {!s.image && <div className="pxs-dots absolute inset-0" />}
            <div className="pxs-container relative h-full flex items-center">
              <div className="max-w-xl py-16">
                <h1 className="text-3xl sm:text-5xl font-bold leading-[1.08]">{s.title}</h1>
                {s.subtitle && <p className="mt-4 text-base sm:text-lg text-slate-200">{s.subtitle}</p>}
                {s.buttonText && <div className="mt-7"><BannerButton text={s.buttonText} url={s.buttonUrl} /></div>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="Banner anterior" onClick={() => go(i - 1)} className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur items-center justify-center"><ChevronLeft size={22} /></button>
          <button type="button" aria-label="Próximo banner" onClick={() => go(i + 1)} className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur items-center justify-center"><ChevronRight size={22} /></button>
          <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2" role="tablist" aria-label="Escolher banner">
            {slides.map((s, idx) => <button key={s.key} type="button" role="tab" aria-selected={idx === i} aria-label={`Banner ${idx + 1}`} onClick={() => go(idx)} className={`h-2.5 rounded-full transition-all ${idx === i ? 'w-8 bg-amber-400' : 'w-2.5 bg-white/50 hover:bg-white/80'}`} />)}
          </div>
        </>
      )}
    </section>
  );
};

// ── Foto do produto (ou um fundo quando ainda não há foto) ────────────────────
export const ProductImage: React.FC<{ p: Pick<SiteProduct, 'name' | 'category' | 'images'>; className?: string; thumb?: boolean }> = ({ p, className = '', thumb = true }) =>
  p.images[0]
    ? <img src={imgUrl(p.images[0], thumb)} alt={p.name} loading="lazy" className={`object-cover ${className}`} />
    : <div className={`pxs-placeholder flex flex-col items-center justify-center text-slate-500 ${className}`} role="img" aria-label={`${p.name} (foto em breve)`}><ImageIcon size={34} className="opacity-60" /><span className="mt-1 text-[11px] font-medium opacity-70">{p.category}</span></div>;

// ── Cartão de produto ─────────────────────────────────────────────────────────
export const defaultQty = (p: SiteProduct) => (p.pricingMode === 'package' ? [...p.priceTiers].sort((a, b) => a.minQty - b.minQty)[0]?.minQty ?? 1 : Math.max(1, p.minQty));

export const ProductCard: React.FC<{ p: SiteProduct; badge?: 'popular' }> = ({ p, badge }) => {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const price = priceFrom(p);
  const inCart = cart.items.some((x) => x.productId === p.id);
  const discount = price.old ? Math.round((1 - price.amount / price.old) * 100) : 0;

  const add = (e: React.MouseEvent) => {
    e.preventDefault();
    cart.add(p.id, defaultQty(p));
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <article className="group relative flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-0.5 transition">
      <Link to={`${SITE}/produto/${p.id}`} className="block" aria-label={`Ver ${p.name}`}>
        <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
          <ProductImage p={p} className="h-full w-full group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute left-3 top-3 flex flex-col gap-1.5 items-start">
            {price.old && <span className="inline-flex items-center gap-1 rounded-full bg-pink-600 text-white text-[11px] font-bold px-2.5 py-1"><Flame size={12} />{discount > 0 ? `-${discount}%` : 'Oferta'}</span>}
            {badge === 'popular' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold px-2.5 py-1"><Star size={12} />Mais pedido</span>}
            {!price.old && p.featured && badge !== 'popular' && <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1">Destaque</span>}
          </div>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">{p.category}</p>
        <h3 className="mt-1 text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2"><Link to={`${SITE}/produto/${p.id}`} className="after:absolute after:inset-0 after:content-['']">{p.name}</Link></h3>
        <div className="mt-auto pt-3">
          <p className="text-[11px] text-slate-500">{p.pricingMode === 'package' ? 'a partir de' : price.old ? 'de' : 'a partir de'}{price.old && <span className="ml-1 line-through">{brl(price.old)}</span>}</p>
          <p className="flex items-baseline gap-1.5"><span className="text-xl font-bold text-slate-900 tabular-nums">{brl(price.amount)}</span><span className="text-xs text-slate-500">{price.caption}</span></p>
        </div>
        <button type="button" onClick={add} className={`relative z-10 mt-3 inline-flex items-center justify-center gap-2 h-10 rounded-full text-sm font-semibold transition-colors ${added || inCart ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-blue-600'}`} aria-label={`Adicionar ${p.name} ao orçamento`}>
          {added ? <><Check size={16} />Adicionado</> : inCart ? <><Check size={16} />No orçamento</> : <><Plus size={16} />Adicionar ao orçamento</>}
        </button>
      </div>
    </article>
  );
};

export const ProductGrid: React.FC<{ items: SiteProduct[]; badge?: 'popular' }> = ({ items, badge }) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">{items.map((p) => <ProductCard key={p.id} p={p} badge={badge} />)}</div>
);

// ── Galeria do produto: foto grande, miniaturas e ampliação ───────────────────
export const Gallery: React.FC<{ p: Pick<SiteProduct, 'name' | 'category' | 'images'> }> = ({ p }) => {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const n = p.images.length;
  useEffect(() => { setI(0); }, [p.images[0]]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); if (e.key === 'ArrowRight') setI((x) => (x + 1) % n); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, n]);

  if (!n) return <ProductImage p={p} className="aspect-[4/3] w-full rounded-2xl" />;
  return (
    <div>
      <button type="button" onClick={() => setZoom(true)} className="block w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-[4/3]" aria-label="Ampliar foto">
        <img src={imgUrl(p.images[i], false)} alt={`${p.name} — foto ${i + 1} de ${n}`} className="h-full w-full object-cover" />
      </button>
      {n > 1 && (
        <ul className="mt-3 flex gap-2.5 overflow-x-auto no-scrollbar" aria-label="Fotos do produto">
          {p.images.map((id, idx) => (
            <li key={id} className="shrink-0"><button type="button" onClick={() => setI(idx)} aria-label={`Ver foto ${idx + 1}`} aria-current={idx === i}
              className={`block h-16 w-20 sm:h-20 sm:w-24 rounded-lg overflow-hidden border-2 ${idx === i ? 'border-blue-600' : 'border-transparent opacity-70 hover:opacity-100'}`}><img src={imgUrl(id)} alt="" loading="lazy" className="h-full w-full object-cover" /></button></li>
          ))}
        </ul>
      )}
      {zoom && (
        <div className="fixed inset-0 z-[70] bg-slate-950/95 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setZoom(false)}>
          <button type="button" aria-label="Fechar" className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/15 text-white flex items-center justify-center" onClick={() => setZoom(false)}><X size={22} /></button>
          {n > 1 && <button type="button" aria-label="Foto anterior" className="absolute left-3 sm:left-6 h-12 w-12 rounded-full bg-white/15 text-white flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }}><ChevronLeft size={26} /></button>}
          <img src={imgUrl(p.images[i], false)} alt={`${p.name} — foto ${i + 1} de ${n}`} className="max-h-[88vh] max-w-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          {n > 1 && <button type="button" aria-label="Próxima foto" className="absolute right-3 sm:right-6 h-12 w-12 rounded-full bg-white/15 text-white flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }}><ChevronRight size={26} /></button>}
        </div>
      )}
    </div>
  );
};

export const unitLabelPlural = (u: SiteProduct['unit'], qty: number) => (qty === 1 ? unitName[u] : u === 'un' ? 'unidades' : u === 'milheiro' ? 'milheiros' : u === 'folha' ? 'folhas' : unitName[u]);
