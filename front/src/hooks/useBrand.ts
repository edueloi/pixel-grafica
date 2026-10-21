import { useEffect, useState } from 'react';

export interface Brand { name: string; hasLogo: boolean; v: number }

let cache: Brand | null = null;
const subs = new Set<(b: Brand | null) => void>();

const load = () => fetch('/api/brand').then((r) => (r.ok ? r.json() : null)).then((b: Brand | null) => { cache = b; subs.forEach((f) => f(b)); }).catch(() => {});

/** Nome e logotipo da empresa (rota pública: funciona também na tela de login). */
export function useBrand(): Brand | null {
  const [brand, setBrand] = useState<Brand | null>(cache);
  useEffect(() => {
    subs.add(setBrand);
    if (!cache) void load();
    return () => { subs.delete(setBrand); };
  }, []);
  return brand;
}

/** Chamar depois de trocar/remover o logotipo para o menu e o login atualizarem. */
export const refreshBrand = () => load();
export const logoSrc = (b: Brand) => `/api/brand/logo?v=${b.v}`;
