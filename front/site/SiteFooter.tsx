import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Clock, CreditCard, Instagram, Mail, MapPin, MessageCircle, Palette, Phone, Truck, ChevronRight } from 'lucide-react';
import { SITE, lenisRef, useSite, waLink } from './siteApi';

const nav = [
  { label: 'Início', to: SITE }, { label: 'Catálogo', to: `${SITE}/catalogo` },
  { label: 'Mais pedidos', to: `${SITE}/catalogo?ordem=popular` }, { label: 'Sobre', to: `${SITE}/sobre` }, { label: 'Dúvidas', to: `${SITE}/duvidas` }, { label: 'Meu orçamento', to: `${SITE}/orcamento` }, { label: 'Contato', to: `${SITE}/contato` },
];

const instaUrl = (v?: string | null) => (v ? (v.startsWith('http') ? v : `https://instagram.com/${v.replace('@', '')}`) : null);
const telHref = (v?: string | null) => (v ? `tel:+${v.replace(/\D/g, '').replace(/^(?!55)/, '55')}` : undefined);
/** 15992675429 → (15) 99267-5429 */
const fmtPhone = (v?: string | null) => {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
};
/** Horário de várias linhas (ou separado por “·”) vira uma lista limpa. */
const hourLines = (v?: string | null) => (v ? v.split(/\n+|\s·\s/).map((s) => s.replace(/[·]\s*$/, '').trim()).filter(Boolean) : []);

/** Rodapé: cartões com as informações de compra, colunas de navegação e atendimento, e barra final. */
const SiteFooter: React.FC<{ wide: boolean }> = ({ wide }) => {
  const { home } = useSite();
  const c = home?.company;
  const box = wide ? 'pxs-container-wide' : 'pxs-container';
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    (home?.products ?? []).forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  }, [home]);
  const hours = hourLines(c?.hours);
  const info = [
    c?.payment && { icon: CreditCard, tone: 'bg-emerald-500/15 text-emerald-300', title: 'Pagamento', text: c.payment },
    c?.delivery && { icon: Truck, tone: 'bg-sky-500/15 text-sky-300', title: 'Entrega e retirada', text: c.delivery },
    c?.artService && { icon: Palette, tone: 'bg-pink-500/15 text-pink-300', title: 'Criação de arte', text: c.artService },
  ].filter(Boolean) as { icon: typeof Truck; tone: string; title: string; text: string }[];
  const top = () => (lenisRef.current ? lenisRef.current.scrollTo(0) : window.scrollTo({ top: 0, behavior: 'smooth' }));

  return (
    <footer className={`bg-slate-950 text-slate-300 ${wide ? '' : 'mt-16'}`}>
      <div className="h-1 bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-400" aria-hidden="true" />

      <div className={`${box} pt-12 pb-10`}>
        {info.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-3 mb-12">
            {info.map(({ icon: Icon, tone, title, text }) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[.04] p-4 flex gap-3.5">
                <span className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${tone}`}><Icon size={22} /></span>
                <div className="min-w-0">
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-400 line-clamp-3">{text}</p>
                  <Link to={`${SITE}/duvidas`} className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-amber-300 hover:text-amber-200">Ver detalhes<ChevronRight size={14} /></Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-4 space-y-5">
            <Link to={SITE} className="inline-flex items-center gap-3" aria-label={`${c?.name ?? 'Gráfica'} — página inicial`}>
              {c?.hasLogo ? <img src={`/api/brand/logo?v=${c.logoVersion}`} alt={c.name} className="h-12 max-w-[200px] object-contain object-left" /> : <><img src="/logo-pixel.jpg" alt="" className="h-12 w-12 rounded-xl object-cover" /><span className="text-xl font-bold text-white tracking-tight">{c?.name ?? 'Gráfica'}</span></>}
            </Link>
            {c?.tagline && <p className="text-slate-400 max-w-sm">{c.tagline}</p>}
            <div className="flex flex-wrap gap-2.5">
              {c?.whatsapp && <a href={waLink(c.whatsapp, `Olá! Vim pelo site da ${c.name}.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors"><MessageCircle size={17} />Falar no WhatsApp</a>}
              {c?.instagram && <a href={instaUrl(c.instagram)!} target="_blank" rel="noreferrer" aria-label={`Instagram ${c.instagram}`} className="inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors"><Instagram size={17} />{c.instagram}</a>}
            </div>
          </div>

          <nav aria-label="Navegue" className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500 mb-4">Navegue</h3>
            <ul className="space-y-2.5 text-sm">{nav.map((n) => <li key={n.label}><Link to={n.to} className="text-slate-300 hover:text-white hover:translate-x-0.5 inline-block transition">{n.label}</Link></li>)}</ul>
          </nav>

          <nav aria-label="Categorias" className="lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500 mb-4">Categorias</h3>
            <ul className="space-y-2.5 text-sm">
              {categories.map((n) => <li key={n}><Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(n)}`} className="text-slate-300 hover:text-white hover:translate-x-0.5 inline-block transition">{n}</Link></li>)}
              {categories.length === 0 && <li className="text-slate-500">Em breve</li>}
            </ul>
          </nav>

          <div className="sm:col-span-2 lg:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500 mb-4">Atendimento</h3>
            <ul className="space-y-4 text-sm">
              {c?.phone && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-white/[.07] flex items-center justify-center text-amber-300"><Phone size={16} /></span><div><p className="text-xs text-slate-500">Telefone e WhatsApp</p><a href={telHref(c.phone)} className="text-white font-medium hover:text-amber-300">{fmtPhone(c.phone)}</a></div></li>}
              {c?.email && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-white/[.07] flex items-center justify-center text-amber-300"><Mail size={16} /></span><div className="min-w-0"><p className="text-xs text-slate-500">E-mail</p><a href={`mailto:${c.email}`} className="text-white font-medium hover:text-amber-300 break-all">{c.email}</a></div></li>}
              {c?.address && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-white/[.07] flex items-center justify-center text-amber-300"><MapPin size={16} /></span><div><p className="text-xs text-slate-500">Endereço</p><p className="text-slate-200 first-letter:uppercase">{c.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-amber-300 hover:text-amber-200">Como chegar →</a></div></li>}
              {hours.length > 0 && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-white/[.07] flex items-center justify-center text-amber-300"><Clock size={16} /></span><div><p className="text-xs text-slate-500">Horário</p><ul className="text-slate-200 space-y-0.5">{hours.map((h) => <li key={h}>{h}</li>)}</ul></div></li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className={`${box} py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500`}>
          <p>© {new Date().getFullYear()} {c?.name ?? 'Gráfica'}. Todos os direitos reservados.</p>
          <p className="hidden md:block">Valores sujeitos a confirmação no orçamento.</p>
          <button type="button" onClick={top} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-white/15 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"><ArrowUp size={14} />Voltar ao topo</button>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
