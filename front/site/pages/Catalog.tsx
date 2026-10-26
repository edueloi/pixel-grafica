import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import { priceFrom, useSite } from '../siteApi';
import { ProductGrid, ShopShell } from '../components';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catálogo: menu lateral de categorias (gaveta no celular), busca e ordenação. */
const Catalog: React.FC = () => {
  const { home } = useSite();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<'relevancia' | 'menor' | 'maior' | 'nome'>('relevancia');
  const q = params.get('q') ?? '';
  const category = params.get('categoria') ?? '';
  const onlyOffers = params.get('oferta') === '1';
  const byPopular = params.get('ordem') === 'popular';
  const products = home!.products;

  const list = useMemo(() => {
    const term = norm(q.trim());
    let out = products.filter((p) => (!category || p.category === category) && (!onlyOffers || p.offerPrice) && (!term || norm(`${p.name} ${p.category} ${p.description ?? ''}`).includes(term)));
    if (byPopular) {
      const rank = new Map(home!.popular.map((id, i) => [id, i]));
      out = out.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    } else if (sort === 'menor') out.sort((a, b) => priceFrom(a).amount - priceFrom(b).amount);
    else if (sort === 'maior') out.sort((a, b) => priceFrom(b).amount - priceFrom(a).amount);
    else if (sort === 'nome') out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return out;
  }, [products, q, category, onlyOffers, byPopular, sort, home]);

  const title = byPopular ? 'Mais pedidos' : onlyOffers ? 'Ofertas' : category || (q ? `Resultados para “${q}”` : 'Todos os produtos');
  const setQ = (v: string) => { const next = new URLSearchParams(params); v ? next.set('q', v) : next.delete('q'); setParams(next, { replace: true }); };

  return (
    <ShopShell label={title}>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600 mb-1.5">Catálogo</p>
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1.5 text-sm sm:text-base text-slate-600">{list.length} {list.length === 1 ? 'produto' : 'produtos'}. Adicione ao orçamento e veja o total na hora.</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <label className="relative flex-1">
          <span className="sr-only">Buscar nesta lista</span>
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: cartão, banner, adesivo…" className="w-full h-12 pl-11 pr-4 rounded-full border border-slate-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none" />
        </label>
        {!byPopular && (
          <label className="sm:w-52">
            <span className="sr-only">Ordenar por</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full h-12 px-4 rounded-full border border-slate-300 bg-white outline-none focus:border-blue-500">
              <option value="relevancia">Ordenar: destaque</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="nome">Nome (A–Z)</option>
            </select>
          </label>
        )}
      </div>

      {list.length === 0
        ? <div className="text-center py-20 text-slate-500"><SearchX size={40} className="mx-auto mb-3 opacity-60" /><p className="font-medium text-slate-700">Nenhum produto encontrado</p><p className="text-sm">Tente outra palavra ou escolha outra categoria no menu.</p></div>
        : <ProductGrid items={list} wide />}
    </ShopShell>
  );
};

export default Catalog;
