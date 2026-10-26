import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Calculator, ListChecks, Send, Download, FileText, CreditCard, Truck, Palette, Printer } from 'lucide-react';
import { SITE, fileSize, useSite, waLink } from '../siteApi';
import { HeroCarousel, ProductGrid, SectionHead, ProductImage, slidesFrom, type Slide } from '../components';

const Home: React.FC = () => {
  const { home } = useSite();
  const c = home!.company;
  const products = home!.products;

  const offers = useMemo(() => products.filter((p) => p.offerPrice), [products]);
  const popular = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const real = home!.popular.map((id) => byId.get(id)).filter(Boolean) as typeof products;
    return real;
  }, [home, products]);
  const featured = useMemo(() => products.filter((p) => p.featured), [products]);
  const showcase = popular.length >= 2 ? popular.slice(0, 8) : (featured.length ? featured : products).slice(0, 8);
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number; cover?: typeof products[number] }>();
    for (const p of products) {
      const e = map.get(p.category) ?? { name: p.category, count: 0 };
      e.count++;
      if (!e.cover || (!e.cover.images.length && p.images.length)) e.cover = p;
      map.set(p.category, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [products]);

  // sem banners cadastrados, o carrossel nasce com chamadas padrão (dá para trocar em Configurações → Site)
  const slides: Slide[] = home!.banners.length ? slidesFrom(home!.banners) : [
    { key: 'd1', title: c?.tagline || 'Impressos que valorizam a sua marca', subtitle: 'Cartões, banners, adesivos, folders e muito mais. Monte o orçamento aqui no site e finalize pelo WhatsApp.', buttonText: 'Ver catálogo', buttonUrl: `${SITE}/catalogo` },
    ...(offers.length ? [{ key: 'd2', title: 'Ofertas imperdíveis', subtitle: 'Produtos com preço especial por tempo limitado.', buttonText: 'Ver ofertas', buttonUrl: '#ofertas' }] : []),
    { key: 'd3', title: 'Orçamento rápido, do seu jeito', subtitle: 'Escolha os produtos, veja os valores e fale com a gente em poucos cliques.', buttonText: 'Montar meu orçamento', buttonUrl: `${SITE}/orcamento` },
  ];

  const info = [
    c?.payment && { icon: CreditCard, title: 'Pagamento', text: c.payment },
    c?.delivery && { icon: Truck, title: 'Entrega e retirada', text: c.delivery },
    c?.artService && { icon: Palette, title: 'Criação de arte', text: c.artService },
  ].filter(Boolean) as { icon: typeof Truck; title: string; text: string }[];

  return (
    <>
      <HeroCarousel slides={slides} />

      {/* diferenciais */}
      <section aria-label="Diferenciais" className="pxs-container -mt-8 relative z-10">
        <ul className="grid gap-3 sm:grid-cols-3">
          {[{ icon: Calculator, t: 'Orçamento na hora', d: 'Veja o valor enquanto escolhe a quantidade.' }, { icon: MessageCircle, t: 'Atendimento no WhatsApp', d: 'Tire dúvidas e acompanhe seu pedido com quem entende.' }, { icon: Printer, t: 'Qualidade de gráfica', d: 'Acabamento cuidado em cada peça produzida.' }].map(({ icon: Icon, t, d }) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-900/5 p-4">
              <span className="h-11 w-11 shrink-0 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Icon size={22} /></span>
              <div><p className="font-semibold text-slate-900">{t}</p><p className="text-sm text-slate-600">{d}</p></div>
            </li>
          ))}
        </ul>
      </section>

      {/* categorias */}
      {categories.length > 0 && (
        <section id="categorias" className="pxs-container pt-16">
          <SectionHead eyebrow="Categorias" title="O que você precisa imprimir?" text="Escolha uma categoria e veja os modelos e valores." />
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {categories.slice(0, 8).map((cat) => (
              <li key={cat.name}>
                <Link to={`${SITE}/catalogo?categoria=${encodeURIComponent(cat.name)}`} className="group relative block aspect-[5/4] rounded-2xl overflow-hidden bg-slate-100">
                  {cat.cover && <ProductImage p={cat.cover} className="absolute inset-0 h-full w-full group-hover:scale-105 transition-transform duration-500" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3.5 text-white"><p className="font-semibold leading-tight">{cat.name}</p><p className="text-xs text-slate-200">{cat.count} {cat.count === 1 ? 'produto' : 'produtos'}</p></div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ofertas */}
      {offers.length > 0 && (
        <section id="ofertas" className="pxs-container pt-20">
          <SectionHead eyebrow="Ofertas" title="Preços especiais" text="Condições promocionais que valem no orçamento do site." action={<Link to={`${SITE}/catalogo`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">Ver todos os produtos<ArrowRight size={16} /></Link>} />
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

      {/* como pedir */}
      <section id="como-pedir" className="mt-20 bg-slate-50 border-y border-slate-200">
        <div className="pxs-container py-16">
          <SectionHead eyebrow="Passo a passo" title="Como pedir seu orçamento" />
          <ol className="grid gap-5 md:grid-cols-3">
            {[{ icon: ListChecks, t: 'Escolha os produtos', d: 'Navegue pelo catálogo, veja fotos, valores por quantidade e adicione ao orçamento.' }, { icon: Calculator, t: 'Monte seu orçamento', d: 'Ajuste as quantidades, conte o que precisa em cada item e confira o total estimado.' }, { icon: Send, t: 'Envie e fale com a gente', d: 'Mande o pedido e continue pelo WhatsApp para enviar a arte e combinar entrega.' }].map(({ icon: Icon, t, d }, i) => (
              <li key={t} className="relative rounded-2xl bg-white border border-slate-200 p-6">
                <span className="absolute -top-3 left-6 h-7 min-w-7 px-2 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <Icon size={28} className="text-blue-600" /><h3 className="mt-3 font-semibold text-slate-900">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p>
              </li>
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
            {home!.catalogs.map((f) => (
              <li key={f.id}><a href={`/api/site/catalogs/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-md transition">
                <span className="h-12 w-12 shrink-0 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center"><FileText size={24} /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900 truncate">{f.name.replace(/\.[^.]+$/, '')}</span><span className="text-xs text-slate-500">PDF · {fileSize(f.size)}</span></span>
                <Download size={18} className="text-blue-600 shrink-0" />
              </a></li>
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
              {c?.aboutText && <div className="space-y-3 text-slate-600 leading-relaxed">{c.aboutText.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div>}
            </div>
            {info.length > 0 && (
              <ul className="lg:col-span-2 space-y-3">
                {info.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><span className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Icon size={20} /></span><div><p className="font-semibold text-slate-900">{title}</p><p className="text-sm text-slate-600">{text}</p></div></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* chamada final */}
      <section className="pxs-container pt-20">
        <div className="pxs-hero-bg relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12 text-center text-white">
          <div className="pxs-dots absolute inset-0" />
          <div className="relative">
            <h2 className="text-2xl sm:text-4xl font-bold">Pronto para tirar o projeto do papel?</h2>
            <p className="mt-3 text-slate-200 max-w-xl mx-auto">Monte o orçamento agora ou fale com a gente: respondemos para combinar arte, prazo e entrega.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to={`${SITE}/orcamento`} className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300">Meu orçamento<ArrowRight size={18} /></Link>
              <Link to={`${SITE}/contato`} className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-white/15 text-white font-semibold hover:bg-white/25 border border-white/30">Falar com a loja</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
