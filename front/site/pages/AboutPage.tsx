import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CreditCard, Download, FileText, Instagram, Mail, MapPin, MessageCircle, Palette, Phone, Clock, Truck, Printer, Sparkles } from 'lucide-react';
import { SITE, fileSize, hourLines, useSite, waLink } from '../siteApi';
import { PageHero, Reveal, SectionHead } from '../components';

const instaUrl = (v?: string | null) => (v ? (v.startsWith('http') ? v : `https://instagram.com/${v.replace('@', '')}`) : null);

/** Sobre a gráfica: história, como trabalhamos (pagamento, entrega, arte), dados da loja e catálogos em PDF. */
const AboutPage: React.FC = () => {
  const { home } = useSite();
  const c = home!.company;
  const catalogs = home!.catalogs;
  const how = [
    c?.payment && { icon: CreditCard, tone: 'bg-emerald-50 text-emerald-600', title: 'Formas de pagamento', text: c.payment },
    c?.delivery && { icon: Truck, tone: 'bg-sky-50 text-sky-600', title: 'Entrega e retirada', text: c.delivery },
    c?.artService && { icon: Palette, tone: 'bg-pink-50 text-pink-600', title: 'Criação de arte', text: c.artService },
  ].filter(Boolean) as { icon: typeof Truck; tone: string; title: string; text: string }[];
  const hours = hourLines(c?.hours);

  return (
    <>
      <PageHero eyebrow="Sobre nós" title={c?.name ? `Conheça a ${c.name}` : 'Conheça a gráfica'} text={c?.tagline ?? 'Cuidamos de cada impressão como se fosse nossa.'} crumbs={[{ label: 'Sobre' }]} />

      <div className="pxs-container py-12 grid gap-8 lg:grid-cols-5 items-start">
        <div className="lg:col-span-3 space-y-8">
          <Reveal className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <span className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Sparkles size={22} /></span>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">Nossa história</h2>
            {c?.aboutText
              ? <div className="mt-3 space-y-3 text-slate-600 leading-relaxed">{c.aboutText.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>
              : <p className="mt-3 text-slate-600 leading-relaxed">{c?.name ?? 'Nossa gráfica'} produz cartões, banners, adesivos, folders e muito mais, com atendimento próximo do início ao fim: do orçamento à entrega. Escolha seus produtos no catálogo, monte o orçamento aqui no site e finalize pelo WhatsApp.</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`${SITE}/catalogo`} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Ver o catálogo<ArrowRight size={16} /></Link>
              {c?.whatsapp && <a href={waLink(c.whatsapp, 'Olá! Vim pela página Sobre do site.')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><MessageCircle size={16} />Falar com a loja</a>}
            </div>
          </Reveal>

          {how.length > 0 && (
            <section aria-labelledby="como-trabalhamos">
              <h2 id="como-trabalhamos" className="text-lg font-semibold text-slate-900 mb-4">Como trabalhamos</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {how.map(({ icon: Icon, tone, title, text }, i) => (
                  <Reveal as="li" key={title} delay={i * 0.07} className={`rounded-2xl border border-slate-200 bg-white p-5 ${how.length === 3 && i === 2 ? 'sm:col-span-2' : ''}`}>
                    <span className={`h-10 w-10 rounded-xl flex items-center justify-center ${tone}`}><Icon size={20} /></span>
                    <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{text}</p>
                  </Reveal>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* dados da loja */}
        <aside className="lg:col-span-2 lg:sticky lg:top-24 space-y-4">
          <Reveal className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2"><Printer size={18} className="text-blue-600" />Dados da loja</h2>
            <ul className="mt-4 space-y-4 text-sm">
              {c?.address && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><MapPin size={16} /></span><div><p className="text-xs text-slate-500">Endereço</p><p className="text-slate-800 first-letter:uppercase">{c.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">Como chegar →</a></div></li>}
              {hours.length > 0 && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Clock size={16} /></span><div><p className="text-xs text-slate-500">Horário</p><ul className="text-slate-800 space-y-0.5">{hours.map((h) => <li key={h}>{h}</li>)}</ul></div></li>}
              {c?.phone && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Phone size={16} /></span><div><p className="text-xs text-slate-500">Telefone e WhatsApp</p><p className="text-slate-800">{c.phone}</p></div></li>}
              {c?.email && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Mail size={16} /></span><div className="min-w-0"><p className="text-xs text-slate-500">E-mail</p><a href={`mailto:${c.email}`} className="text-slate-800 hover:text-blue-700 break-all">{c.email}</a></div></li>}
              {c?.instagram && <li className="flex gap-3"><span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Instagram size={16} /></span><div><p className="text-xs text-slate-500">Instagram</p><a href={instaUrl(c.instagram)!} target="_blank" rel="noreferrer" className="text-slate-800 hover:text-blue-700">{c.instagram}</a></div></li>}
            </ul>
          </Reveal>
        </aside>
      </div>

      {catalogs.length > 0 && (
        <section id="catalogos" className="pxs-container pb-12">
          <SectionHead eyebrow="Catálogos e modelos" title="Baixe nossos catálogos" text="Materiais em PDF com modelos e opções para você consultar." />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogs.map((f, i) => (
              <Reveal as="li" key={f.id} delay={i * 0.05}><a href={`/api/site/catalogs/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-md transition">
                <span className="h-11 w-11 shrink-0 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center"><FileText size={22} /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900 truncate">{f.name.replace(/\.[^.]+$/, '')}</span><span className="text-xs text-slate-500">PDF · {fileSize(f.size)}</span></span>
                <Download size={17} className="text-blue-600 shrink-0" />
              </a></Reveal>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

export default AboutPage;
