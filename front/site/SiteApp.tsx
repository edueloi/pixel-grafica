import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './site.css';
import { SITE, SiteContext, siteGet, type SiteHome } from './siteApi';
import SiteLayout from './SiteLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductPage from './pages/ProductPage';
import QuotePage from './pages/QuotePage';
import ContactPage from './pages/ContactPage';

/** Rola para a seção do endereço (#ofertas…) ou volta ao topo ao trocar de página. */
const ScrollManager: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
};

/** Site público da gráfica (rota /pagina-teste-site). Não exige login. */
const SiteApp: React.FC = () => {
  const [home, setHome] = useState<SiteHome | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    setError('');
    siteGet<SiteHome>('/home').then(setHome).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // título e descrição da página (o site de teste não é indexado: ver meta robots do index.html)
  useEffect(() => {
    const name = home?.company?.name;
    document.title = name ? `${name} · Gráfica e impressos` : 'Gráfica';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta); }
    meta.setAttribute('content', `${name ?? 'Gráfica'}: cartões de visita, banners, adesivos, impressos e muito mais. Peça seu orçamento pelo site ou pelo WhatsApp.`);
  }, [home?.company?.name]);

  return (
    <SiteContext.Provider value={{ home, error, reload }}>
      <ScrollManager />
      <div className="pxs min-h-[100dvh] flex flex-col">
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="catalogo" element={<Catalog />} />
            <Route path="produto/:id" element={<ProductPage />} />
            <Route path="orcamento" element={<QuotePage />} />
            <Route path="contato" element={<ContactPage />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </div>
    </SiteContext.Provider>
  );
};

export { SITE };
export default SiteApp;
