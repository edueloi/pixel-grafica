import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import { priceFrom, useSite } from '../siteApi';
import { ProductGrid } from '../components';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Catálogo completo: busca, categorias e ordenação. */
const Catalog: React.FC = () => {
  const { home } = useSite();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<'relevancia' | 'menor' | 'maior' | 'nome'>('relevancia');
  const category = params.get('categoria') ?? '';
  const products = home!.products;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const list = useMemo(() => {
    const term = norm(q.trim());
    const out = products.filter((p) => (!category || p.category === category) && (!term || norm(`${p.name} ${p.category} ${p.description ?? ''}`).includes(term)));
    if (sort === 'menor') out.sort((a, b) => priceFrom(a).amount - priceFrom(b).amount);
    else if (sort === 'maior') out.sort((a, b) => priceFrom(b).amount - priceFrom(a).amount);
    else if (sort === 'nome') out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return out;
  }, [products, q, category, sort]);

  const pick = (c: string) => { const next = new URLSearchParams(params); c ? next.set('categoria', c) : next.delete('categoria'); setParams(next, { replace: true }); };

  return (
    <div className="pxs-container py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600 mb-2">Catálogo</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{category || 'Todos os produtos'}</h1>
        <p className="mt-2 text-slate-600">{list.length} {list.length === 1 ? 'produto' : 'produtos'}. Adicione ao orçamento e veja o total na hora.</p>
      </header>

      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Buscar produto</span>
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: cartão, banner, adesivo…" className="w-full h-12 pl-11 pr-4 rounded-full border border-slate-300 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none" />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Ordenar por</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full h-12 px-4 rounded-full border border-slate-300 bg-white outline-none focus:border-blue-500">
              <option value="relevancia">Ordenar: destaque</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="nome">Nome (A–Z)</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Categorias">
          <button type="button" aria-pressed={!category} onClick={() => pick('')} className={`shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors ${!category ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400'}`}>Todos ({products.length})</button>
          {categories.map(([name, count]) => (
            <button key={name} type="button" aria-pressed={category === name} onClick={() => pick(name)} className={`shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors ${category === name ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400'}`}>{name} ({count})</button>
          ))}
        </div>
      </div>

      {list.length === 0
        ? <div className="text-center py-20 text-slate-500"><SearchX size={40} className="mx-auto mb-3 opacity-60" /><p className="font-medium text-slate-700">Nenhum produto encontrado</p><p className="text-sm">Tente outra palavra ou limpe a categoria.</p></div>
        : <ProductGrid items={list} />}
    </div>
  );
};

export default Catalog;
