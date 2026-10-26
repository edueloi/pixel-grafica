import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import './site.css';
import { SITE, SiteContext, lenisRef, siteGet, type SiteHome } from './siteApi';
import SiteLayout from './SiteLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductPage from './pages/ProductPage';
import QuotePage from './pages/QuotePage';
import ContactPage from './pages/ContactPage';
import AboutPage from './pages/AboutPage';
import FaqPage from './pages/FaqPage';

/** Rola para a seção do endereço (#ofertas…) ou volta ao topo ao trocar de página. */
const ScrollManager: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (!el) return;
        if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -84 }); else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(t);
    }
    if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true }); else window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
};

/** Rolagem suave só para quem usa mouse e não pediu menos movimento (no celular vale a rolagem nativa). */
const SmoothScroll: React.FC = () => {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !window.matchMedia('(pointer: fine)').matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenisRef.current = lenis;
    let raf = requestAnimationFrame(function loop(t) { lenis.raf(t); raf = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, [reduce]);
  return null;
};

/** Barra fininha no topo que mostra quanto da página já foi lida. */
const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return <motion.div aria-hidden="true" className="fixed top-0 left-0 right-0 h-[3px] origin-left bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-400 z-[80]" style={{ scaleX }} />;
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
      <SmoothScroll />
      <ScrollProgress />
      <ScrollManager />
      <div className="pxs min-h-[100dvh] flex flex-col">
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="catalogo" element={<Catalog />} />
            <Route path="produto/:id" element={<ProductPage />} />
            <Route path="orcamento" element={<QuotePage />} />
            <Route path="sobre" element={<AboutPage />} />
            <Route path="duvidas" element={<FaqPage />} />
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
