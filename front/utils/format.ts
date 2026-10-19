import type { OrderStatus, QuoteStatus, Role } from '../types';

export const brl = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor unitário com as casas que precisar (tabela fechada: R$ 0,115). */
export const brlUnit = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 5 });

export const dateLabel = (v?: string | Date | null) => {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v.length === 10 ? `${v}T12:00:00` : v) : v;
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};
export const dateTimeLabel = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const timeLabel = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const inputDate = (v?: string | null) => (v ? v.slice(0, 10) : '');

export const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');

export const maskPhone = (v: string | null | undefined) => {
  let d = digits(v);
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
};
export const maskDocument = (v: string | null | undefined) => {
  const d = digits(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
export const maskCep = (v: string | null | undefined) => digits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

export const normalizeText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const unitLabel: Record<string, string> = { un: 'unidade', milheiro: 'milheiro', m2: 'm²', folha: 'folha' };

export const orderStages: { id: OrderStatus; label: string; color: 'default' | 'warning' | 'primary' | 'info' | 'purple' | 'orange' | 'success' | 'danger' }[] = [
  { id: 'aguardando_arquivo', label: 'Aguardando arquivo', color: 'default' },
  { id: 'arte', label: 'Arte', color: 'purple' },
  { id: 'aprovacao_arte', label: 'Aprovação da arte', color: 'warning' },
  { id: 'producao', label: 'Produção', color: 'primary' },
  { id: 'acabamento', label: 'Acabamento', color: 'orange' },
  { id: 'pronto', label: 'Pronto', color: 'success' },
  { id: 'entregue', label: 'Entregue', color: 'default' },
  { id: 'cancelado', label: 'Cancelado', color: 'danger' },
];
export const stageOf = (s: string) => orderStages.find((x) => x.id === s) ?? orderStages[0];

export const quoteStatus: Record<QuoteStatus, { label: string; color: 'default' | 'info' | 'success' | 'danger' }> = {
  rascunho: { label: 'Rascunho', color: 'default' }, enviado: { label: 'Enviado', color: 'info' },
  aprovado: { label: 'Aprovado', color: 'success' }, recusado: { label: 'Recusado', color: 'danger' },
};

export const roleLabel: Record<Role, string> = { admin: 'Administrador', atendente: 'Atendente', producao: 'Produção', financeiro: 'Financeiro' };

export const isOverdue = (due?: string | null, status?: string) =>
  !!due && !['pronto', 'entregue', 'cancelado'].includes(status ?? '') && new Date(due).getTime() < Date.now() - 86400000 * 0;

export const waLink = (phone?: string | null, text?: string) => {
  const d = digits(phone);
  return d ? `https://wa.me/${d.startsWith('55') ? d : `55${d}`}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '';
};
