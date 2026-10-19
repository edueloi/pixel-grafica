import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Company } from '../../types';

let cache: Company | null = null;

/** Dados da empresa (nome para as mensagens, contato…). Guardados em memória: um pedido só por sessão. */
export function useCompany(): Company | null {
  const [company, setCompany] = useState<Company | null>(cache);
  useEffect(() => {
    if (cache) return;
    api.get<Company>('/company').then((c) => { cache = c; setCompany(c); }).catch(() => {});
  }, []);
  return company;
}

export const resetCompanyCache = () => { cache = null; };
