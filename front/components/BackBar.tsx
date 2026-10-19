import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui';

/** Barra do topo das páginas de detalhe/formulário: Voltar à esquerda, ações à direita (padrão do MFC). */
export const BackBar: React.FC<{ to: string; label: string; children?: React.ReactNode }> = ({ to, label, children }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate(to)}>{label}</Button>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
};
