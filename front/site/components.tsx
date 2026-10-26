import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion, useInView, animate, useScroll, useTransform, type MotionValue } from 'motion/react';
import {
  ChevronLeft, ChevronRight, ArrowRight, Plus, Check, X, Flame, Star, Search, LayoutGrid, Tag, Trophy, MessageCircle, Menu as MenuIcon,
  CreditCard, Flag, Sticker, FileText, Printer, Shirt, Coffee, Stamp, StickyNote, Mail, Calendar, BookOpen, Layers, Image as ImageIcon, IdCard, Book, type LucideIcon,
} from 'lucide-react';
import { SITE, bannerUrl, brl, imgUrl, priceFrom, setScrollLock, unitName, useCart, useSite, waLink, type SiteBanner, type SiteProduct } from './siteApi';

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ── Ícone e cor por categoria (usados quando o produto ainda não tem foto) ────
const ICONS: [RegExp, LucideIcon][] = [
  [/cartao|cartoes|visita/, CreditCard], [/banner|faixa|lona|bandeira/, Flag], [/adesivo|etiqueta|vinil/, Sticker], [/folheto|folder|panfleto|flyer|cartaz/, FileText],
  [/camiseta|uniforme|dtf/, Shirt], [/caneca|brinde|copo/, Coffee], [/carimbo/, Stamp], [/bloco|talao|talo|nota/, StickyNote], [/convite|envelope/, Mail],
  [/calendario|agenda/, Calendar], [/encadern|livro|apostila/, BookOpen], [/plastific|lamina/, Layers], [/foto|revela|papel foto/, ImageIcon], [/cracha|identific/, IdCard], [/caderno/, Book],
];
export const categoryIcon = (name: string): LucideIcon => ICONS.find(([re]) => re.test(strip(name)))?.[1] ?? Printer;
const TONES = ['from-sky-100 to-blue-200 text-blue-700', 'from-pink-100 to-rose-200 text-rose-700', 'from-amber-100 to-orange-200 text-amber-700', 'from-emerald-100 to-teal-200 text-teal-700', 'from-violet-100 to-indigo-200 text-indigo-700'];
const toneOf = (name: string) => TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];

// ── Animação de entrada (respeita "reduzir movimento") ────────────────────────
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' }> = ({ children, delay = 0, y = 22, className, as = 'div' }) => {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return <Tag className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.5, delay, ease: 'easeOut' }}>{children}</Tag>;
};

// ── Faixa que rola sozinha (estilo Magic UI) ─────────────────────────────────
export const Marquee: React.FC<{ children: React.ReactNode[]; label: string }> = ({ children, label }) => (
  <div className="pxs-marquee-wrap overflow-hidden" role="region" aria-label={label}>
    <ul className="pxs-marquee gap-3 py-1">
      {[...children, ...children].map((c, i) => <li key={i} className="shrink-0" aria-hidden={i >= children.length}>{c}</li>)}
    </ul>
  </div>
);

// ── Contador que sobe até o valor quando aparece na tela ──────────────────────
export const NumberTicker: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) { if (reduce) setN(value); return; }
    const c = animate(0, value, { duration: 1.4, ease: 'easeOut', onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, value, reduce]);
  return <span ref={ref} className={`tabular-nums ${className ?? ''}`}>{n.toLocaleString('pt-BR')}</span>;
};

// ── Títulos de seção ──────────────────────────────────────────────────────────
export const SectionHead: React.FC<{ eyebrow?: string; title: string; text?: string; action?: React.ReactNode; light?: boolean }> = ({ eyebrow, title, text, action, light }) => (
  <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div className="max-w-2xl">
      {eyebrow && <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-blue-600 mb-2"><span className="h-1.5 w-6 rounded-full bg-gradient-to-r from-amber-400 to-pink-500" />{eyebrow}</p>}
      <h2 className={`text-2xl sm:text-3xl font-bold ${light ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
      {text && <p className={`mt-2 text-sm sm:text-base ${light ? 'text-slate-300' : 'text-slate-600'}`}>{text}</p>}
    </div>
    {action}
  </Reveal>
);

// ── Foto do produto (ou arte da categoria quando ainda não há foto) ───────────
export const ProductImage: React.FC<{ p: Pick<SiteProduct, 'name' | 'category' | 'images'>; className?: string; thumb?: boolean }> = ({ p, className = '', thumb = true }) => {
  if (p.images[0]) return <img src={imgUrl(p.images[0], thumb)} alt={p.name} loading="lazy" className={`object-cover ${className}`} />;
  const Icon = categoryIcon(p.category);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${toneOf(p.category)} flex flex-col items-center justify-center ${className}`} role="img" aria-label={`${p.name} (foto em breve)`}>
      <Icon size={44} strokeWidth={1.6} className="relative opacity-80" />
      <span className="relative mt-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70 px-2 text-center">{p.category}</span>
      <span className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/40" aria-hidden="true" />
      <span className="absolute -left-4 -top-4 h-14 w-14 rounded-full bg-white/30" aria-hidden="true" />
    </div>
  );
};

// ── Botão/link do banner: âncora (#ofertas), página interna (/…) ou link externo ─
const BannerButton: React.FC<{ text: string; url?: string | null }> = ({ text, url }) => {
  const cls = 'pxs-shimmer inline-flex items-center gap-2 h-12 px-6 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 hover:scale-[1.03] active:scale-95 transition';
  if (!url || url.startsWith('#')) return <Link to={{ pathname: SITE, hash: url || '#catalogo' }} className={cls}>{text}<ArrowRight size={18} /></Link>;
  if (url.startsWith('/')) return <Link to={url.startsWith(SITE) ? url : `${SITE}${url}`} className={cls}>{text}<ArrowRight size={18} /></Link>;
  return <a href={url} target="_blank" rel="noreferrer" className={cls}>{text}<ArrowRight size={18} /></a>;
};

// ── Carrossel de banners ──────────────────────────────────────────────────────
export interface Slide { key: string; title: string; subtitle?: string | null; buttonText?: string | null; buttonUrl?: string | null; image?: string; collage?: SiteProduct[] }
export const slidesFrom = (banners: SiteBanner[]): Slide[] => banners.map((b) => ({ key: b.id, title: b.title, subtitle: b.subtitle, buttonText: b.buttonText, buttonUrl: b.buttonUrl, image: b.hasImage ? bannerUrl(b.id) : undefined }));

/** Colagem de produtos que flutua ao lado do texto do banner padrão. */
const Collage: React.FC<{ items: SiteProduct[]; y?: MotionValue<string> }> = ({ items, y }) => {
  const reduce = useReducedMotion();
  const pos = [
    { cls: 'left-[10%] top-0 w-[50%]', r: '-4deg', delay: 0.1 },
    { cls: 'right-0 top-[120px] w-[44%]', r: '5deg', delay: 0.25 },
    { cls: 'left-0 bottom-0 w-[44%]', r: '-2deg', delay: 0.4 },
  ];
  return (
    <motion.div style={y ? { y } : undefined} className="relative hidden md:block h-[420px] w-full max-w-[500px] justify-self-end" aria-hidden="true">
      <span className="pxs-float absolute -left-6 top-24 h-16 w-16 rounded-full bg-cyan-400/90 blur-[1px]" />
      <span className="pxs-float absolute right-10 -top-4 h-12 w-12 rounded-full bg-pink-500/90" style={{ animationDelay: '1.2s' }} />
      <span className="pxs-float absolute -right-2 bottom-24 h-20 w-20 rounded-full bg-amber-400/90" style={{ animationDelay: '2.1s' }} />
      {items.slice(0, 3).map((p, i) => {
        const pr = priceFrom(p);
        return (
          <motion.div key={p.id} className={`absolute ${pos[i].cls}`} initial={reduce ? false : { opacity: 0, scale: 0.85, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, delay: pos[i].delay, ease: 'easeOut' }}>
            <div className="pxs-drift rounded-2xl bg-white shadow-2xl shadow-slate-950/40 overflow-hidden" style={{ ['--r' as string]: pos[i].r, animationDelay: `${i * 0.8}s` }}>
              <ProductImage p={p} className="aspect-[4/3] w-full" />
              <div className="px-3 py-2.5 text-slate-900"><p className="text-xs font-semibold truncate">{p.name}</p><p className="text-[11px] text-slate-500">a partir de <b className="text-slate-900 text-sm">{brl(pr.amount)}</b></p></div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

export const HeroCarousel: React.FC<{ slides: Slide[] }> = ({ slides }) => {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);
  const reduce = useReducedMotion();
  const secRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: secRef, offset: ['start start', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const collageY = useTransform(scrollYProgress, [0, 1], ['0%', '-14%']);

  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (n < 2 || paused || reduce) return;
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % n); }, 6500);
    return () => clearInterval(t);
  }, [n, paused, reduce]);

  return (
    <section ref={secRef} className="relative bg-slate-900 text-white overflow-hidden" aria-roledescription="carrossel" aria-label="Destaques"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current === null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 50) go(i + (d < 0 ? 1 : -1)); touch.current = null; }}>
      <div className="relative h-[500px] sm:h-[540px] lg:h-[580px]">
        {slides.map((s, idx) => (
          <div key={s.key} className={`pxs-slide absolute inset-0 ${idx === i ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} aria-hidden={idx !== i} role="group" aria-roledescription="slide" aria-label={`${idx + 1} de ${n}`}>
            {s.image ? <motion.img src={s.image} alt="" style={reduce ? undefined : { y: imgY, scale: 1.14 }} className="absolute inset-0 h-full w-full object-cover" loading={idx === 0 ? 'eager' : 'lazy'} fetchPriority={idx === 0 ? 'high' : 'auto'} /> : <div className="pxs-aurora absolute inset-0" />}
            {s.image ? <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-transparent" /> : <div className="pxs-dots absolute inset-0" />}
            <div className="pxs-container relative h-full grid md:grid-cols-2 items-center gap-8">
              <div className="max-w-xl py-14">
                {idx === i && (
                  <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
                    <h1 className="text-3xl sm:text-5xl font-bold leading-[1.08]">{s.title}</h1>
                    {s.subtitle && <p className="mt-4 text-base sm:text-lg text-slate-200">{s.subtitle}</p>}
                    {s.buttonText && <div className="mt-7"><BannerButton text={s.buttonText} url={s.buttonUrl} /></div>}
                  </motion.div>
                )}
              </div>
              {!s.image && s.collage && s.collage.length > 0 && idx === i && <Collage items={s.collage} y={reduce ? undefined : collageY} />}
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
    <article className="pxs-glow group relative flex flex-col h-full rounded-2xl bg-white border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition duration-300">
      <Link to={`${SITE}/produto/${p.id}`} className="block" aria-label={`Ver ${p.name}`}>
        <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
          <ProductImage p={p} className="h-full w-full group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute left-3 top-3 flex flex-col gap-1.5 items-start">
            {price.old && <span className="inline-flex items-center gap-1 rounded-full bg-pink-600 text-white text-[11px] font-bold px-2.5 py-1 shadow"><Flame size={12} />{discount > 0 ? `-${discount}%` : 'Oferta'}</span>}
            {badge === 'popular' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold px-2.5 py-1 shadow"><Star size={12} />Mais pedido</span>}
            {!price.old && p.featured && badge !== 'popular' && <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1 shadow">Destaque</span>}
          </div>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 truncate">{p.category}</p>
        <h3 className="mt-1 text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 min-h-[2.6em]"><Link to={`${SITE}/produto/${p.id}`} className="after:absolute after:inset-0 after:content-['']">{p.name}</Link></h3>
        <div className="mt-auto pt-3">
          <p className="text-[11px] text-slate-500">{p.pricingMode === 'package' ? 'a partir de' : price.old ? 'de' : 'a partir de'}{price.old && <span className="ml-1 line-through">{brl(price.old)}</span>}</p>
          <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-xl font-bold text-slate-900 tabular-nums">{brl(price.amount)}</span><span className="text-xs text-slate-500">{price.caption}</span></p>
        </div>
        <button type="button" onClick={add} className={`relative z-10 mt-3 inline-flex items-center justify-center gap-2 h-10 rounded-full text-sm font-semibold transition-colors ${added || inCart ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-blue-600'}`} aria-label={`Adicionar ${p.name} ao orçamento`}>
          {added ? <><Check size={16} />Adicionado</> : inCart ? <><Check size={16} />No orçamento</> : <><Plus size={16} />Adicionar</>}
        </button>
      </div>
    </article>
  );
};

export const ProductGrid: React.FC<{ items: SiteProduct[]; badge?: 'popular'; wide?: boolean }> = ({ items, badge, wide }) => (
  <ul className={`grid grid-cols-2 gap-3 sm:gap-5 ${wide ? 'md:grid-cols-3 2xl:grid-cols-4' : 'md:grid-cols-3 lg:grid-cols-4'}`}>
    {items.map((p, i) => <Reveal as="li" key={p.id} delay={Math.min(i, 7) * 0.05} y={18} className="min-w-0"><ProductCard p={p} badge={badge} /></Reveal>)}
  </ul>
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

// ── Catálogo em menu lateral: no computador fica fixo; no celular abre numa gaveta ──
const SidebarContent: React.FC<{ active?: string; onNavigate?: () => void }> = ({ active, onNavigate }) => {
  const { home } = useSite();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const products = home!.products;
  const wa = home!.company?.whatsapp;
  const cat = active ?? params.get('categoria') ?? '';
  const oferta = params.get('oferta') === '1', popular = params.get('ordem') === 'popular';
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [products]);
  const offers = products.filter((p) => p.offerPrice).length;
  const isAll = !cat && !oferta && !popular && !active;

  const item = (to: string, label: string, opts: { on: boolean; icon: React.ReactNode; count?: number; accent?: boolean }) => (
    <li key={label}><Link to={to} onClick={onNavigate} aria-current={opts.on ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${opts.on ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20' : opts.accent ? 'text-amber-700 font-semibold hover:bg-amber-50' : 'text-slate-700 hover:bg-slate-100'}`}>
      <span className={`shrink-0 ${opts.on ? 'text-white' : opts.accent ? 'text-amber-500' : 'text-slate-400'}`}>{opts.icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {opts.count !== undefined && <span className={`text-xs tabular-nums ${opts.on ? 'text-blue-100' : 'text-slate-400'}`}>{opts.count}</span>}
    </Link></li>
  );

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => { e.preventDefault(); navigate(`${SITE}/catalogo?q=${encodeURIComponent(q.trim())}`); onNavigate?.(); }} className="relative">
        <label className="sr-only" htmlFor="side-search">Buscar produto</label>
        <input id="side-search" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto…" className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-300 bg-white text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </form>
      <nav aria-label="Catálogo de produtos">
        <ul className="space-y-0.5">
          {item(`${SITE}/catalogo`, 'Todos os produtos', { on: isAll, icon: <LayoutGrid size={17} />, count: products.length })}
          {offers > 0 && item(`${SITE}/catalogo?oferta=1`, 'Ofertas', { on: oferta, icon: <Tag size={17} />, count: offers, accent: true })}
          {home!.popular.length > 1 && item(`${SITE}/catalogo?ordem=popular`, 'Mais pedidos', { on: popular, icon: <Trophy size={17} />, accent: true })}
        </ul>
        <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Categorias</p>
        <ul className="space-y-0.5">
          {categories.map(([name, count]) => item(`${SITE}/catalogo?categoria=${encodeURIComponent(name)}`, name, { on: cat === name, icon: React.createElement(categoryIcon(name), { size: 17 }), count }))}
        </ul>
      </nav>
      {wa && (
        <a href={waLink(wa, 'Olá! Tenho uma dúvida sobre os produtos do site.')} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-emerald-800 hover:bg-emerald-100 transition-colors">
          <MessageCircle size={22} className="shrink-0" /><span className="text-sm"><b className="block font-semibold">Ficou em dúvida?</b>Fale com a loja no WhatsApp</span>
        </a>
      )}
    </div>
  );
};

export const ShopShell: React.FC<{ children: React.ReactNode; active?: string; label?: string }> = ({ children, active, label }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    setScrollLock(true);
    window.addEventListener('keydown', onKey);
    return () => { setScrollLock(false); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      {/* celular e tablet: barra com o botão que abre as categorias */}
      <div className="lg:hidden sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="pxs-container flex items-center gap-3 h-12">
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold"><MenuIcon size={16} />Categorias</button>
          <span className="text-sm text-slate-600 truncate">{label ?? 'Todos os produtos'}</span>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Categorias de produtos">
            <motion.div className="absolute inset-0 bg-slate-900/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-white shadow-2xl flex flex-col" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'tween', duration: 0.25 }}>
              <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100"><p className="font-bold text-slate-900">Catálogo</p><button type="button" aria-label="Fechar categorias" onClick={() => setOpen(false)} className="h-10 w-10 rounded-full border border-slate-200 flex items-center justify-center"><X size={20} /></button></div>
              <div className="flex-1 overflow-y-auto p-4" data-lenis-prevent><SidebarContent active={active} onNavigate={() => setOpen(false)} /></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="pxs-container py-6 lg:py-10 grid gap-8 lg:grid-cols-[264px_minmax(0,1fr)] items-start">
        <aside className="hidden lg:block sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1 no-scrollbar" aria-label="Menu do catálogo" data-lenis-prevent><SidebarContent active={active} /></aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
};
