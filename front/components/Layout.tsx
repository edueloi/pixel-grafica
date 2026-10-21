import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Menu, X, LogOut, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLive, LIVE_EVENT } from '../src/hooks/useLive';
import type { User, WppSession } from '../types';
import { api } from '../api';
import { cn } from '../src/lib/utils';
import { navigationSections, getVisibleSections, type CountKey, type NavItem } from './navigation';
import { roleLabel } from '../utils/format';
import { PixelLogo } from './PixelLogo';
import BottomNav from './BottomNav';

interface LayoutProps { currentUser: User; onLogout: () => void }

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

const Layout: React.FC<LayoutProps> = ({ currentUser, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false); // gaveta no celular
  const [isCollapsed, setIsCollapsed] = useState(false); // recolher no desktop
  const [counts, setCounts] = useState<Partial<Record<CountKey, number>>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [wpp, setWpp] = useState<WppSession['status'] | null>(null);

  useLive();
  const canSeeWpp = currentUser.role === 'admin' || currentUser.role === 'atendente';
  const visibleSections = getVisibleSections(navigationSections, currentUser);

  // Fila de espera e conexão do WhatsApp, atualizadas a cada poucos segundos
  useEffect(() => {
    if (!canSeeWpp) return;
    let alive = true;
    const tick = () => {
      api.get<Record<CountKey, number>>('/wpp/counts').then((r) => alive && setCounts(r)).catch(() => {});
      api.get<WppSession>('/wpp/status').then((r) => alive && setWpp(r.status)).catch(() => alive && setWpp(null));
    };
    tick();
    const t = setInterval(tick, 30000); // reserva; o normal é atualizar pelo aviso em tempo real
    window.addEventListener(LIVE_EVENT, tick);
    return () => { alive = false; clearInterval(t); window.removeEventListener(LIVE_EVENT, tick); };
  }, [canSeeWpp]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth < 1024) setIsCollapsed(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
  const sidebarWidth = isCollapsed ? 'w-24' : 'w-60';

  const goTo = (path: string) => { navigate(path); if (window.innerWidth < 1024) setSidebarOpen(false); };

  const Badge: React.FC<{ n?: number; floating?: boolean }> = ({ n, floating }) => (n && n > 0
    ? <span className={cn('min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-medium flex items-center justify-center', floating && 'absolute top-0.5 right-2')} aria-label={`${n} aguardando`}>{n}</span>
    : null);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path);
    const hasChildren = !!item.children?.length;
    const expanded = hasChildren && (openGroups[item.path] ?? active);
    const badge = item.badgeKey ? counts[item.badgeKey] : 0;
    const base = cn(
      'w-full flex items-center rounded-lg text-[13px] transition-colors duration-150 group relative',
      isCollapsed ? 'justify-center p-2' : 'pl-3 pr-2.5 py-2 gap-2.5 font-medium',
      active ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
    );
    return (
      <div key={item.path}>
        <button
          onClick={() => {
            if (hasChildren && !isCollapsed) {
              setOpenGroups((g) => ({ ...g, [item.path]: !expanded }));
              if (!active) goTo(item.children![0].path);
            } else goTo(hasChildren ? item.children![0].path : item.path);
          }}
          title={isCollapsed ? item.name : ''}
          aria-current={active && !hasChildren ? 'page' : undefined}
          aria-expanded={hasChildren ? expanded : undefined}
          className={base}
        >
          {!isCollapsed && <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-blue-600 transition-opacity', active ? 'opacity-100' : 'opacity-0')} />}
          <item.icon className={cn('shrink-0 transition-colors duration-150', isCollapsed ? 'w-5 h-5' : 'w-[17px] h-[17px]', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} />
          {!isCollapsed && <span className="flex-1 text-left tracking-tight whitespace-nowrap truncate">{item.name}</span>}
          {!hasChildren && <Badge n={badge} floating={isCollapsed} />}
          {hasChildren && !isCollapsed && <ChevronDown size={14} className={cn('shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />}
          {hasChildren && isCollapsed && <Badge n={badge} floating />}
        </button>
        {hasChildren && expanded && !isCollapsed && (
          <div className="mt-0.5 ml-[18px] pl-2.5 border-l border-slate-100 space-y-0.5" role="group" aria-label={item.name}>
            {item.children!.map((c) => {
              const childActive = location.pathname === c.path;
              const n = c.badgeKey ? counts[c.badgeKey] : 0;
              return (
                <button key={c.path} onClick={() => goTo(c.path)} aria-current={childActive ? 'page' : undefined}
                  className={cn('w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors',
                    childActive ? 'text-blue-600 bg-blue-50 font-medium' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50')}>
                  <c.icon className={cn('w-[15px] h-[15px] shrink-0', childActive ? 'text-blue-600' : 'text-slate-400')} />
                  <span className="flex-1 text-left truncate">{c.name}</span>
                  {c.badgeKey === 'fila' && n ? <Badge n={n} /> : n ? <span className="text-[11px] text-slate-400 tabular-nums">{n}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="h-[100dvh] w-full bg-[#f8fafc] flex overflow-hidden">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-100 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:translate-x-0 lg:static lg:h-full flex-shrink-0 flex flex-col',
        sidebarOpen ? 'translate-x-0 w-60' : '-translate-x-full lg:translate-x-0',
        !sidebarOpen && sidebarWidth,
      )}>
        <div className={cn('h-14 flex items-center border-b border-slate-100 transition-all duration-300', isCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          <PixelLogo collapsed={isCollapsed} />
          {!isCollapsed && (
            <button className="lg:hidden p-1.5 hover:bg-slate-50 rounded-lg transition-colors text-slate-400" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 px-2.5 space-y-4 overflow-y-auto no-scrollbar py-3" aria-label="Menu">
          {visibleSections.map((section) => (
            <div key={section.label} className="space-y-0.5">
              {!isCollapsed && (
                <h3 className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{section.label}</h3>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => renderItem(item))}
              </div>
              {isCollapsed && <div className="h-px bg-slate-100 mx-3 my-3" />}
            </div>
          ))}
        </nav>

        <div className="hidden lg:flex px-2.5 py-2 border-t border-slate-100">
          <button onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full py-1.5 flex items-center justify-center gap-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-[11px] font-medium">
            <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }}><ChevronRight size={14} /></motion.div>
            {!isCollapsed && 'Recolher'}
          </button>
        </div>

        <div className={cn('border-t border-slate-100 flex items-center', isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5')}>
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {currentUser.name.substring(0, 2).toUpperCase()}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate leading-none mb-0.5">{currentUser.name.split(' ')[0]}</p>
                <p className="text-[10px] text-slate-400 truncate">{roleLabel[currentUser.role]}</p>
              </div>
              <button onClick={onLogout} aria-label="Sair" title="Sair" className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-14 flex items-center justify-between gap-3 px-3 sm:px-5 flex-shrink-0 z-30 border-b border-slate-100 bg-white">
          <div className="flex min-w-0 items-center gap-3">
            <button className="lg:hidden p-2 bg-white hover:bg-slate-50 rounded-md transition-colors border border-slate-200" aria-label="Abrir menu" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
              <Menu className="w-4 h-4 text-slate-600" />
            </button>
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 truncate">
                {greeting()}, <span className="text-blue-600">{currentUser.name.split(' ')[0]}</span>
              </h2>
              <span className="hidden sm:inline text-[11px] text-slate-400 first-letter:uppercase">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>
          </div>
          {canSeeWpp && (
            <button onClick={() => navigate('/whatsapp')} title="Situação do WhatsApp"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">
              <span className={cn('w-2 h-2 rounded-full', wpp === 'connected' ? 'bg-emerald-500' : wpp === 'qr_pending' || wpp === 'connecting' ? 'bg-amber-400' : 'bg-slate-300')} />
              <span className="hidden sm:inline">{wpp === 'connected' ? 'WhatsApp conectado' : wpp === 'qr_pending' ? 'Aguardando QR' : wpp === 'connecting' ? 'Conectando…' : 'WhatsApp desconectado'}</span>
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto no-scrollbar pb-4">
          <div className="px-3 sm:px-0"><Outlet /></div>
        </main>

        <BottomNav currentUser={currentUser} onOpenMore={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
};

export default Layout;
