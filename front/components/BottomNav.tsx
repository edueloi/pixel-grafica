import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { User as UserType } from '../types';
import { navigationSections, getVisibleItems } from './navigation';
import { cn } from '../src/lib/utils';

interface BottomNavProps {
  currentUser: UserType;
  onOpenMore: () => void;
}

const MAX_ITEMS = 4;

const BottomNav: React.FC<BottomNavProps> = ({ currentUser, onOpenMore }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const items = getVisibleItems(navigationSections, currentUser).slice(0, MAX_ITEMS);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-white border-t border-slate-200/60 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.path)}
            className={cn(
              "min-w-0 flex-1 flex flex-col items-center justify-center gap-1 h-12 transition-colors focus-visible:outline-blue-500",
              active ? "text-blue-600" : "text-slate-400"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span className="text-[9px] font-bold leading-none truncate max-w-full px-1">
              {item.name}
            </span>
          </button>
        );
      })}
      <button
        onClick={onOpenMore}
        type="button"
        className="min-w-0 flex-1 flex flex-col items-center justify-center gap-1 h-12 text-slate-500 transition-colors focus-visible:outline-blue-500"
      >
        <Menu className="w-4 h-4" />
        <span className="text-[9px] font-bold leading-none">Mais</span>
      </button>
    </nav>
  );
};

export default BottomNav;
