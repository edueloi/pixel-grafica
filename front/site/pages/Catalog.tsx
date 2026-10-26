import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SearchX, LayoutGrid, List, X, Tag, Trophy } from 'lucide-react';
import { SITE, priceFrom, useSite } from '../siteApi';
import { ProductGrid, ProductRow, ShopShell } from '../components';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VIEW_KEY = 'pixel.site.view';

/** Catálogo em formato de painel: barra de ferramentas, filtros ativos e visão em grade ou lista. */
const Catalog: React.FC = () => {
  const { home } = useSite();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<'relevancia' | 'menor' | 'maior' | 'nome'>('relevancia');
  const [view, setView] = useState<'grade' | 'lista'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'grade'; } catch { return 'grade'; } });
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

  const title = byPopular ? 'Mais pedidos' : onlyOffers ? 'Ofertas' : category || 'Todos os produtos';
  const setParam = (k: string, v: string) => { const next = new URLSearchParams(params); v ? next.set(k, v) : next.delete(k); setParams(next, { replace: true }); };
  const pickView = (v: 'grade' | 'lista') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sem armazenamento */ } };
  const filters = [category && { label: category, clear: () => setParam('categoria', '') }, onlyOffers && { label: 'Só ofertas', clear: () => setParam('oferta', '') }, byPopular && { label: 'Mais pedidos', clear: () => setParam('ordem', '') }, q && { label: `“${q}”`, clear: () => setParam('q', '') }].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <ShopShell label={title}>
      <nav aria-label="Você está em" className="text-xs text-slate-500 mb-3"><Link to={SITE} className="hover:text-blue-700">Início</Link> <span aria-hidden="true">/</span> Catálogo{category && <> <span aria-hidden="true">/</span> {category}</>}</nav>

      {/* barra de ferramentas */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">{byPopular ? <Trophy size={22} className="text-amber-500" /> : onlyOffers ? <Tag size={22} className="text-pink-500" /> : null}{title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{list.length} {list.length === 1 ? 'produto' : 'produtos'}{products.length !== list.length ? ` de ${products.length}` : ''} · adicione ao orçamento e veja o total na hora</p>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Modo de exibição">
            <button type="button" aria-pressed={view === 'grade'} aria-label="Ver em grade" onClick={() => pickView('grade')} className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors ${view === 'grade' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}><LayoutGrid size={18} /></button>
            <button type="button" aria-pressed={view === 'lista'} aria-label="Ver em lista" onClick={() => pickView('lista')} className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors ${view === 'lista' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}><List size={18} /></button>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
          <label className="relative flex-1">
            <span className="sr-only">Buscar nesta lista</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Buscar: cartão, banner, adesivo…" className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none" />
          </label>
          {!byPopular && (
            <label className="sm:w-52">
              <span className="sr-only">Ordenar por</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:bg-white focus:border-blue-500">
                <option value="relevancia">Ordenar: destaque</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="nome">Nome (A–Z)</option>
              </select>
            </label>
          )}
        </div>
        {filters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
            <span className="text-xs text-slate-500">Filtros:</span>
            {filters.map((f) => <button key={f.label} type="button" onClick={f.clear} className="inline-flex items-center gap-1.5 h-7 pl-3 pr-2 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100" aria-label={`Remover filtro ${f.label}`}>{f.label}<X size={13} /></button>)}
            <Link to={`${SITE}/catalogo`} className="text-xs font-semibold text-slate-500 hover:text-blue-700 ml-1">Limpar tudo</Link>
          </div>
        )}
      </div>

      <div className="mt-5">
        {list.length === 0
          ? <div className="rounded-2xl bg-white border border-dashed border-slate-300 text-center py-20 text-slate-500"><SearchX size={40} className="mx-auto mb-3 opacity-60" /><p className="font-medium text-slate-700">Nenhum produto encontrado</p><p className="text-sm">Tente outra palavra ou escolha outra categoria no menu.</p></div>
          : view === 'lista'
            ? <ul className="space-y-2.5">{list.map((p) => <li key={p.id}><ProductRow p={p} badge={byPopular ? 'popular' : undefined} /></li>)}</ul>
            : <ProductGrid items={list} wide badge={byPopular ? 'popular' : undefined} />}
      </div>
    </ShopShell>
  );
};

export default Catalog;
