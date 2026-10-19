import React from 'react';
import {
  LayoutDashboard, Users, Package, FileText, ClipboardList, FolderOpen, MessageCircle, Bot, UserCog, Wrench, Clock, UserCheck, MessagesSquare, Archive, Settings,
} from 'lucide-react';
import type { Role, User } from '../types';

export type CountKey = 'fila' | 'meus' | 'abertos' | 'bot';
export type NavChild = { name: string; icon: React.ElementType; path: string; badgeKey?: CountKey };
export type NavItem = { name: string; icon: React.ElementType; path: string; roles?: Role[]; badgeKey?: CountKey; children?: NavChild[] };
export type NavSection = { label: string; items: NavItem[] };

// WhatsApp é um grupo com submenus; cada submenu é uma tela própria da caixa de entrada (/whatsapp/:aba)
export const whatsappTabs: (NavChild & { id: 'fila' | 'meus' | 'abertos' | 'bot' | 'encerrados' })[] = [
  { id: 'fila', name: 'Fila', icon: Clock, path: '/whatsapp/fila', badgeKey: 'fila' },
  { id: 'meus', name: 'Meus atendimentos', icon: UserCheck, path: '/whatsapp/meus', badgeKey: 'meus' },
  { id: 'abertos', name: 'Abertos', icon: MessagesSquare, path: '/whatsapp/abertos', badgeKey: 'abertos' },
  { id: 'bot', name: 'Com o bot', icon: Bot, path: '/whatsapp/bot', badgeKey: 'bot' },
  { id: 'encerrados', name: 'Encerrados', icon: Archive, path: '/whatsapp/encerrados' },
];

export const navigationSections: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { name: 'Painel', icon: LayoutDashboard, path: '/' },
      { name: 'Ordens de serviço', icon: ClipboardList, path: '/pedidos' },
      { name: 'Orçamentos', icon: FileText, path: '/orcamentos', roles: ['admin', 'atendente', 'financeiro'] },
      { name: 'Clientes', icon: Users, path: '/clientes', roles: ['admin', 'atendente', 'financeiro'] },
      { name: 'Serviços', icon: Wrench, path: '/servicos', roles: ['admin', 'atendente', 'financeiro'] },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', roles: ['admin', 'atendente'], badgeKey: 'fila', children: whatsappTabs },
      { name: 'Arquivos', icon: FolderOpen, path: '/arquivos' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { name: 'Produtos', icon: Package, path: '/produtos', roles: ['admin', 'atendente'] },
      { name: 'Bot e IA', icon: Bot, path: '/bot', roles: ['admin'] },
      { name: 'Usuários', icon: UserCog, path: '/usuarios', roles: ['admin'] },
      { name: 'Configurações', icon: Settings, path: '/configuracoes', roles: ['admin'] },
    ],
  },
];

const allowed = (item: NavItem, user: User) => !item.roles || item.roles.includes(user.role);

export const getVisibleItems = (sections: NavSection[], user: User): NavItem[] =>
  sections.flatMap((s) => s.items.filter((i) => allowed(i, user)));

export const getVisibleSections = (sections: NavSection[], user: User): NavSection[] =>
  sections.map((s) => ({ ...s, items: s.items.filter((i) => allowed(i, user)) })).filter((s) => s.items.length > 0);
