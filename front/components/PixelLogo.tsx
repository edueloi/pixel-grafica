import React from 'react';
import { useBrand, logoSrc } from '../src/hooks/useBrand';

/** Marca Pixel: quatro "pixels" que vão clareando, em azul. */
export const PixelMark: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="#2563eb" />
    <g fill="#fff">
      <rect x="7" y="7" width="8" height="8" rx="1.5" />
      <rect x="17" y="7" width="8" height="8" rx="1.5" opacity=".65" />
      <rect x="7" y="17" width="8" height="8" rx="1.5" opacity=".65" />
      <rect x="17" y="17" width="8" height="8" rx="1.5" opacity=".35" />
    </g>
  </svg>
);

/** Logotipo da empresa (cadastrado em Configurações); sem ele, a marca Pixel. */
export const PixelLogo: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const brand = useBrand();
  if (brand?.hasLogo) {
    return <img src={logoSrc(brand)} alt={brand.name} className={collapsed ? 'h-7 w-7 object-contain object-left' : 'h-8 max-w-[160px] object-contain object-left'} />;
  }
  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <PixelMark size={26} className="shrink-0" />
      {!collapsed && (
        <span className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
          Pixel <span className="text-blue-600 font-medium">Gráfica</span>
        </span>
      )}
    </div>
  );
};
