import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, MessageCircle, Phone, Mail, MapPin, Clock, Instagram, Loader2 } from 'lucide-react';
import { SITE, useSite, useCart, waLink } from './siteApi';

const nav = [
  { label: 'Início', to: SITE, end: true },
  { label: 'Catálogo', to: `${SITE}/catalogo` },
  { label: 'Ofertas', to: { pathname: SITE, hash: '#ofertas' } },
  { label: 'Mais pedidos', to: { pathname: SITE, hash: '#mais-pedidos' } },
  { label: 'Sobre', to: { pathname: SITE, hash: '#sobre' } },
  { label: 'Contato', to: `${SITE}/contato` },
];

const instaUrl = (v?: string | null) => (v ? (v.startsWith('http') ? v : `https://instagram.com/${v.replace('@', '')}`) : null);
const telHref = (v?: string | null) => (v ? `tel:+${v.replace(/\D/g, '').replace(/^(?!55)/, '55')}` : undefined);

/** Logo da gráfica (cadastrada em Configurações) ou o nome em texto. */
const Brand: React.FC<{ light?: boolean }> = ({ light }) => {
  const { home } = useSite();
  const c = home?.company;
  return (
    <Link to={SITE} className="flex items-center gap-2.5 min-w-0" aria-label={`${c?.name ?? 'Gráfica'} — página inicial`}>
      {c?.hasLogo
        ? <img src={`/api/brand/logo?v=${c.logoVersion}`} alt={c.name} className="h-10 sm:h-11 max-w-[180px] object-contain object-left" />
        : (
          <>
            <span className="grid grid-cols-2 gap-[3px] h-8 w-8 shrink-0" aria-hidden="true">
              <i className="rounded-[3px] bg-cyan-400" /><i className="rounded-[3px] bg-pink-500" /><i className="rounded-[3px] bg-amber-400" /><i className="rounded-[3px] bg-slate-900" />
            </span>
            <span className={`text-lg font-bold tracking-tight truncate ${light ? 'text-white' : 'text-slate-900'}`}>{c?.name ?? 'Gráfica'}</span>
          </>
        )}
    </Link>
  );
};

const SiteLayout: React.FC = () => {
  const { home, error, reload } = useSite();
  const cart = useCart();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const c = home?.company;
  const wa = c?.whatsapp;

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-slate-900 focus:px-3 focus:py-2 focus:rounded-lg">Ir para o conteúdo</a>

      {/* faixa de contato */}
      <div className="hidden md:block bg-slate-900 text-slate-200 text-xs">
        <div className="pxs-container flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-5">
            {c?.hours && <span className="flex items-center gap-1.5"><Clock size={13} />{c.hours}</span>}
            {c?.address && <span className="flex items-center gap-1.5"><MapPin size={13} />{c.address}</span>}
          </div>
          <div className="flex items-center gap-5">
            {c?.phone && <a href={telHref(c.phone)} className="flex items-center gap-1.5 hover:text-white"><Phone size={13} />{c.phone}</a>}
            {c?.instagram && <a href={instaUrl(c.instagram)!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white"><Instagram size={13} />{c.instagram}</a>}
          </div>
        </div>
      </div>

      <header className={`sticky top-0 z-40 bg-white/95 backdrop-blur border-b ${scrolled ? 'border-slate-200 shadow-sm' : 'border-transparent'} transition-shadow`}>
        <div className="pxs-container flex items-center justify-between gap-3 h-16">
          <Brand />
          <nav className="hidden lg:flex items-center gap-1" aria-label="Principal">
            {nav.map((n) => (
              <NavLink key={n.label} to={n.to} end={'end' in n ? n.end : false}
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive && typeof n.to === 'string' ? 'text-blue-700 bg-blue-50' : 'text-slate-700 hover:text-blue-700 hover:bg-slate-100'}`}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to={`${SITE}/orcamento`} className="relative inline-flex items-center gap-2 h-10 px-3 sm:px-4 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors" aria-label={`Meu orçamento, ${cart.count} ${cart.count === 1 ? 'item' : 'itens'}`}>
              <ShoppingCart size={17} /><span className="hidden sm:inline">Meu orçamento</span>
              {cart.count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold flex items-center justify-center">{cart.count}</span>}
            </Link>
            {wa && <a href={waLink(wa, `Olá! Vim pelo site da ${c?.name ?? 'gráfica'} e gostaria de um orçamento.`)} target="_blank" rel="noreferrer" className="hidden md:inline-flex items-center gap-2 h-10 px-4 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"><MessageCircle size={17} />WhatsApp</a>}
            <button type="button" className="lg:hidden h-10 w-10 rounded-full border border-slate-200 flex items-center justify-center" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {/* menu no celular */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[84%] max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-100"><Brand /><button type="button" className="h-10 w-10 rounded-full border border-slate-200 flex items-center justify-center" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={20} /></button></div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="Menu principal">
              {nav.map((n) => <Link key={n.label} to={n.to} className="block px-4 py-3 rounded-xl text-base font-medium text-slate-800 hover:bg-slate-100">{n.label}</Link>)}
            </nav>
            <div className="p-4 border-t border-slate-100 space-y-2">
              <Link to={`${SITE}/orcamento`} className="flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-semibold"><ShoppingCart size={18} />Meu orçamento{cart.count > 0 ? ` (${cart.count})` : ''}</Link>
              {wa && <a href={waLink(wa, 'Olá! Vim pelo site e gostaria de um orçamento.')} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-500 text-white font-semibold"><MessageCircle size={18} />Falar no WhatsApp</a>}
            </div>
          </div>
        </div>
      )}

      <main id="conteudo" className="flex-1">
        {error && !home
          ? <div className="pxs-container py-24 text-center"><p className="text-slate-600 mb-4">{error}</p><button type="button" onClick={reload} className="h-11 px-6 rounded-full bg-blue-600 text-white font-semibold">Tentar novamente</button></div>
          : !home
            ? <div role="status" className="py-32 flex items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={20} />Carregando…</div>
            : <Outlet />}
      </main>

      <footer className="bg-slate-900 text-slate-300 mt-16">
        <div className="pxs-container py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Brand light />
            {c?.tagline && <p className="text-sm text-slate-400">{c.tagline}</p>}
            {c?.instagram && <a href={instaUrl(c.instagram)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm hover:text-white"><Instagram size={16} />{c.instagram}</a>}
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Navegue</h3>
            <ul className="space-y-2 text-sm">{nav.map((n) => <li key={n.label}><Link to={n.to} className="hover:text-white">{n.label}</Link></li>)}</ul>
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Atendimento</h3>
            <ul className="space-y-2.5 text-sm">
              {c?.phone && <li><a href={telHref(c.phone)} className="flex items-start gap-2 hover:text-white"><Phone size={15} className="mt-0.5 shrink-0" />{c.phone}</a></li>}
              {c?.email && <li><a href={`mailto:${c.email}`} className="flex items-start gap-2 hover:text-white break-all"><Mail size={15} className="mt-0.5 shrink-0" />{c.email}</a></li>}
              {c?.hours && <li className="flex items-start gap-2"><Clock size={15} className="mt-0.5 shrink-0" />{c.hours}</li>}
              {c?.address && <li className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0" />{c.address}</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Como comprar</h3>
            <ul className="space-y-2 text-sm text-slate-400">
              {c?.payment && <li><b className="text-slate-200 font-medium">Pagamento:</b> {c.payment}</li>}
              {c?.delivery && <li><b className="text-slate-200 font-medium">Entrega:</b> {c.delivery}</li>}
              {c?.artService && <li><b className="text-slate-200 font-medium">Arte:</b> {c.artService}</li>}
              {!c?.payment && !c?.delivery && !c?.artService && <li>Monte seu orçamento no site e finalize pelo WhatsApp.</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800"><div className="pxs-container py-5 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2"><span>© {new Date().getFullYear()} {c?.name ?? 'Gráfica'}. Todos os direitos reservados.</span><span>Valores sujeitos a confirmação no orçamento.</span></div></div>
      </footer>

      {wa && (
        <a href={waLink(wa, `Olá! Vim pelo site da ${c?.name ?? 'gráfica'}.`)} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 flex items-center justify-center hover:bg-emerald-600 hover:scale-105 transition"><MessageCircle size={26} /></a>
      )}
    </>
  );
};

export default SiteLayout;
