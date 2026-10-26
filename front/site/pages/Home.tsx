import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, MessageCircle, Calculator, ListChecks, Send, Download, FileText, CreditCard, Truck, Palette, Printer, ChevronDown, HelpCircle, Zap } from 'lucide-react';
import { SITE, fileSize, useSite, waLink, type SiteProduct } from '../siteApi';
import { HeroCarousel, Marquee, ProductGrid, SectionHead, ProductImage, Reveal, categoryIcon, slidesFrom, type Slide } from '../components';

const Faq: React.FC<{ items: { q: string; a: string }[] }> = ({ items }) => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {items.map((it, i) => (
        <li key={it.q}>
          <h3>
            <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-slate-900 hover:bg-slate-50">
              {it.q}<motion.span animate={{ rotate: open === i ? 180 : 0 }} className="shrink-0 text-blue-600"><ChevronDown size={20} /></motion.span>
            </button>
          </h3>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div id={`faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <p className="px-5 pb-5 text-slate-600 leading-relaxed whitespace-pre-line">{it.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </li>
      ))}
    </ul>
  );
};

const Home: React.FC = () => {
  const { home } = useSite();
  const c = home!.company;
  const products = home!.products;

  const offers = useMemo(() => products.filter((p) => p.offerPrice), [products]);
  const popular = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return home!.popular.map((id) => byId.get(id)).filter(Boolean) as SiteProduct[];
  }, [home, products]);
  const featured = useMemo(() => products.filter((p) => p.featured), [products]);
  const showcase = popular.length >= 2 ? popular.slice(0, 8) : (featured.length ? featured : products).slice(0, 8);
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number; cover: SiteProduct }>();
    for (const p of products) {
      const e = map.get(p.category);
      if (!e) map.set(p.category, { name: p.category, count: 1, cover: p });
      else { e.count++; if (!e.cover.images.length && p.images.length) e.cover = p; }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [products]);

  // produtos da colagem do banner: prioriza os que têm foto
  const collage = useMemo(() => {
    const pool = [...offers, ...featured, ...popular, ...products];
    const seen = new Set<string>();
    const uniq = pool.filter((p) => !seen.has(p.id) && seen.add(p.id));
    return [...uniq.filter((p) => p.images.length), ...uniq.filter((p) => !p.images.length)].slice(0, 3);
  }, [offers, featured, popular, products]);

  // sem banners cadastrados, o carrossel nasce com chamadas padrão (dá para trocar em Configurações → Site)
  const slides: Slide[] = home!.banners.length ? slidesFrom(home!.banners) : [
    { key: 'd1', title: c?.tagline || 'Impressos que valorizam a sua marca', subtitle: 'Cartões, banners, adesivos, folders e muito mais. Monte o orçamento aqui no site e finalize pelo WhatsApp.', buttonText: 'Ver catálogo', buttonUrl: `${SITE}/catalogo`, collage },
    ...(offers.length ? [{ key: 'd2', title: 'Ofertas imperdíveis', subtitle: 'Produtos com preço especial. Aproveite enquanto durar.', buttonText: 'Ver ofertas', buttonUrl: '#ofertas', collage: offers.slice(0, 3) }] : []),
    { key: 'd3', title: 'Orçamento rápido, do seu jeito', subtitle: 'Escolha os produtos, veja os valores e fale com a gente em poucos cliques.', buttonText: 'Montar meu orçamento', buttonUrl: `${SITE}/orcamento`, collage: [...collage].reverse() },
  ];

  const info = [
    c?.payment && { icon: CreditCard, title: 'Pagamento', text: c.payment },
    c?.delivery && { icon: Truck, title: 'Entrega e retirada', text: c.delivery },
    c?.artService && { icon: Palette, title: 'Criação de arte', text: c.artService },
  ].filter(Boolean) as { icon: typeof Truck; title: string; text: string }[];

  const faq = [
    { q: 'Como faço um orçamento?', a: 'Escolha os produtos no catálogo, ajuste a quantidade e as opções, e adicione ao orçamento. Depois é só enviar o pedido: ele chega para a nossa equipe e você continua pelo WhatsApp para enviar a arte e combinar prazo e entrega.' },
    c?.payment && { q: 'Quais as formas de pagamento?', a: c.payment },
    c?.delivery && { q: 'Como funciona a entrega?', a: c.delivery },
    c?.artService && { q: 'A criação da arte está inclusa?', a: c.artService },
    c?.hours && { q: 'Qual o horário de atendimento?', a: c.hours.replace(/\s*·\s*\n/g, '\n') },
    c?.address && { q: 'Onde fica a loja?', a: c.address },
  ].filter(Boolean) as { q: string; a: string }[];

  return (
    <>
      <HeroCarousel slides={slides} />

      {/* diferenciais */}
      <section aria-label="Diferenciais" className="pxs-container -mt-8 relative z-10">
        <ul className="grid gap-3 sm:grid-cols-3">
          {[{ icon: Calculator, t: 'Orçamento na hora', d: 'Veja o valor enquanto escolhe a quantidade.' }, { icon: MessageCircle, t: 'Atendimento no WhatsApp', d: 'Tire dúvidas e acompanhe seu pedido com quem entende.' }, { icon: Printer, t: 'Qualidade de gráfica', d: 'Acabamento cuidado em cada peça produzida.' }].map(({ icon: Icon, t, d }, i) => (
            <Reveal as="li" key={t} delay={i * 0.08} className="flex items-start gap-3 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-900/5 p-4">
              <span className="h-11 w-11 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Icon size={22} /></span>
              <div><p className="font-semibold text-slate-900">{t}</p><p className="text-sm text-slate-600">{d}</p></div>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* faixa de categorias que rola sozinha */}
      {categories.length > 2 && (
        <section aria-label="Categorias em destaque" className="pt-14">
          <Marquee label="Categorias">
            {categories.map((cat) => {
              const Icon = categoryIcon(cat.name);
              return <Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(cat.name)}`} className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 hover:shadow-md transition"><Icon size={17} className="text-blue-600" />{cat.name}</Link>;
            })}
          </Marquee>
        </section>
      )}

      {/* categorias */}
      {categories.length > 0 && (
        <section id="categorias" className="pxs-container pt-20">
          <SectionHead eyebrow="Categorias" title="O que você precisa imprimir?" text="Escolha uma categoria e veja os modelos e valores." action={<Link to={`${SITE}/catalogo`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">Ver tudo<ArrowRight size={16} /></Link>} />
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {categories.slice(0, 8).map((cat, i) => {
              const Icon = categoryIcon(cat.name);
              return (
                <Reveal as="li" key={cat.name} delay={Math.min(i, 7) * 0.05} className="min-w-0">
                  <Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(cat.name)}`} className="group relative block aspect-[5/4] rounded-2xl overflow-hidden bg-slate-100">
                    <ProductImage p={cat.cover} className="absolute inset-0 h-full w-full group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-3.5 text-white flex items-end justify-between gap-2">
                      <div className="min-w-0"><p className="font-semibold leading-tight line-clamp-2">{cat.name}</p><p className="text-xs text-slate-200">{cat.count} {cat.count === 1 ? 'produto' : 'produtos'}</p></div>
                      <span className="h-9 w-9 shrink-0 rounded-full bg-white/20 backdrop-blur flex items-center justify-center group-hover:bg-amber-400 group-hover:text-slate-900 transition-colors"><Icon size={18} /></span>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </ul>
        </section>
      )}

      {/* ofertas */}
      {offers.length > 0 && (
        <section id="ofertas" className="pxs-container pt-20">
          <SectionHead eyebrow="Ofertas" title="Preços especiais" text="Condições promocionais que valem no orçamento do site." action={<Link to={`${SITE}/catalogo?oferta=1`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">Ver todas as ofertas<ArrowRight size={16} /></Link>} />
          <ProductGrid items={offers.slice(0, 8)} />
        </section>
      )}

      {/* mais pedidos */}
      {showcase.length > 0 && (
        <section id="mais-pedidos" className="pxs-container pt-20">
          <SectionHead eyebrow={popular.length >= 2 ? 'Mais pedidos' : 'Destaques'} title={popular.length >= 2 ? 'O que nossos clientes mais pedem' : 'Produtos em destaque'} action={<Link to={`${SITE}/catalogo`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">Catálogo completo<ArrowRight size={16} /></Link>} />
          <ProductGrid items={showcase} badge={popular.length >= 2 ? 'popular' : undefined} />
        </section>
      )}

      {/* faixa de chamada */}
      <section className="pxs-container pt-20" aria-label="Orçamento pelo WhatsApp">
        <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-400 via-amber-300 to-pink-400 px-6 py-8 sm:px-10 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4"><span className="h-14 w-14 rounded-2xl bg-white/60 flex items-center justify-center text-slate-900"><Zap size={28} /></span><div><p className="text-xl sm:text-2xl font-bold text-slate-900">Precisa para hoje? Fale com a gente.</p><p className="text-slate-800/80 text-sm sm:text-base">Confirmamos prazo e disponibilidade pelo WhatsApp.</p></div></div>
          {c?.whatsapp && <a href={waLink(c.whatsapp, 'Olá! Preciso de um orçamento com urgência.')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-slate-900 text-white font-semibold hover:bg-slate-800 hover:scale-[1.03] transition"><MessageCircle size={18} />Chamar no WhatsApp</a>}
        </Reveal>
      </section>

      {/* como pedir */}
      <section id="como-pedir" className="mt-20 bg-slate-50 border-y border-slate-200">
        <div className="pxs-container py-16">
          <SectionHead eyebrow="Passo a passo" title="Como pedir seu orçamento" />
          <ol className="grid gap-5 md:grid-cols-3">
            {[{ icon: ListChecks, t: 'Escolha os produtos', d: 'Navegue pelo catálogo, veja fotos, valores por quantidade e adicione ao orçamento.' }, { icon: Calculator, t: 'Monte seu orçamento', d: 'Ajuste as quantidades, marque os opcionais e confira o total estimado.' }, { icon: Send, t: 'Envie e fale com a gente', d: 'Mande o pedido e continue pelo WhatsApp para enviar a arte e combinar a entrega.' }].map(({ icon: Icon, t, d }, i) => (
              <Reveal as="li" key={t} delay={i * 0.1} className="relative rounded-2xl bg-white border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                <span className="absolute -top-3 left-6 h-7 min-w-7 px-2 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <Icon size={28} className="text-blue-600" /><h3 className="mt-3 font-semibold text-slate-900">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p>
              </Reveal>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={`${SITE}/catalogo`} className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700">Começar pelo catálogo<ArrowRight size={18} /></Link>
            {c?.whatsapp && <a href={waLink(c.whatsapp, 'Olá! Gostaria de fazer um orçamento.')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-emerald-500 text-white font-semibold hover:bg-emerald-600"><MessageCircle size={18} />Prefiro o WhatsApp</a>}
          </div>
        </div>
      </section>

      {/* catálogos em PDF */}
      {home!.catalogs.length > 0 && (
        <section id="catalogos" className="pxs-container pt-20">
          <SectionHead eyebrow="Catálogos e modelos" title="Baixe nossos catálogos" text="Materiais em PDF com modelos e opções para você consultar." />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home!.catalogs.map((f, i) => (
              <Reveal as="li" key={f.id} delay={i * 0.05}><a href={`/api/site/catalogs/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-md transition">
                <span className="h-12 w-12 shrink-0 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center"><FileText size={24} /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900 truncate">{f.name.replace(/\.[^.]+$/, '')}</span><span className="text-xs text-slate-500">PDF · {fileSize(f.size)}</span></span>
                <Download size={18} className="text-blue-600 shrink-0" />
              </a></Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* sobre */}
      {(c?.aboutText || info.length > 0) && (
        <section id="sobre" className="pxs-container pt-20">
          <div className="grid gap-8 lg:grid-cols-5 items-start">
            <div className="lg:col-span-3">
              <SectionHead eyebrow="Sobre nós" title={c?.name ? `Conheça a ${c.name}` : 'Conheça a gráfica'} />
              {c?.aboutText && <Reveal className="space-y-3 text-slate-600 leading-relaxed">{c.aboutText.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</Reveal>}
            </div>
            {info.length > 0 && (
              <ul className="lg:col-span-2 space-y-3">
                {info.map(({ icon: Icon, title, text }, i) => (
                  <Reveal as="li" key={title} delay={i * 0.08} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><span className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Icon size={20} /></span><div className="min-w-0"><p className="font-semibold text-slate-900">{title}</p><p className="text-sm text-slate-600 whitespace-pre-line break-words">{text}</p></div></Reveal>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* dúvidas frequentes */}
      {faq.length > 1 && (
        <section id="duvidas" className="pxs-container pt-20">
          <SectionHead eyebrow="Dúvidas frequentes" title="Perguntas que sempre recebemos" action={<span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-slate-500"><HelpCircle size={16} />Não achou? Chame no WhatsApp.</span>} />
          <Reveal className="max-w-3xl"><Faq items={faq} /></Reveal>
        </section>
      )}

      {/* chamada final */}
      <section className="pxs-container pt-20">
        <Reveal className="pxs-hero-bg relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12 text-center text-white">
          <div className="pxs-dots absolute inset-0" />
          <span className="pxs-float absolute left-8 top-8 h-10 w-10 rounded-full bg-cyan-400/80 hidden sm:block" /><span className="pxs-float absolute right-12 bottom-10 h-14 w-14 rounded-full bg-pink-500/80 hidden sm:block" style={{ animationDelay: '1.4s' }} />
          <div className="relative">
            <h2 className="text-2xl sm:text-4xl font-bold">Pronto para tirar o projeto do papel?</h2>
            <p className="mt-3 text-slate-200 max-w-xl mx-auto">Monte o orçamento agora ou fale com a gente: respondemos para combinar arte, prazo e entrega.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to={`${SITE}/orcamento`} className="pxs-shimmer inline-flex items-center gap-2 h-12 px-7 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300">Meu orçamento<ArrowRight size={18} /></Link>
              <Link to={`${SITE}/contato`} className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-white/15 text-white font-semibold hover:bg-white/25 border border-white/30">Falar com a loja</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default Home;
