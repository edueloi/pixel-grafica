import React, { useState } from 'react';
import { UserCog, UserPlus, Pencil } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, Button, IconButton, Modal, ModalFooter, Input, Select, Switch, GridTable, EmptyState, Badge, Alert, useToast } from '../components/ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { maskPhone, roleLabel, digits } from '../utils/format';
import type { Role, User } from '../types';

const roles = (Object.keys(roleLabel) as Role[]).map((r) => ({ value: r, label: roleLabel[r] }));

const UserModal: React.FC<{ user: User | null; isSelf: boolean; onClose: () => void; onSaved: () => void }> = ({ user, isSelf, onClose, onSaved }) => {
  const toast = useToast();
  const [f, setF] = useState({ name: user?.name ?? '', username: user?.username ?? '', email: user?.email ?? '', role: (user?.role ?? 'atendente') as Role, phone: maskPhone(user?.phone), password: '', active: user?.active ?? true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (saving) return;
    if (!f.name.trim()) { setError('Informe o nome.'); return; }
    if (!user && !f.email.includes('@')) { setError('Informe um e-mail válido.'); return; }
    if ((!user || f.password) && f.password.length < 6) { setError('A senha precisa ter ao menos 6 caracteres.'); return; }
    if (f.phone && digits(f.phone).length < 10) { setError('Telefone incompleto. Informe com DDD.'); return; }
    setSaving(true); setError('');
    try {
      const body = { name: f.name, username: f.username, role: f.role, phone: f.phone, active: f.active, ...(f.password ? { password: f.password } : {}), ...(user ? {} : { email: f.email }) };
      if (user) await api.put(`/users/${user.id}`, body); else await api.post('/users', body);
      toast.success(user ? 'Usuário atualizado.' : 'Usuário criado.');
      onSaved();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title={user ? 'Editar usuário' : 'Novo usuário'}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></ModalFooter>}>
      <div className="grid grid-cols-1 gap-3">
        <Input label="Nome" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        <Input label="Usuário (login)" value={f.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))} autoCapitalize="none" hint="Com ele a pessoa entra no sistema (ex.: ana). O e-mail também funciona para entrar." />
        <Input label="E-mail" type="email" value={f.email} disabled={!!user} onChange={(e) => set('email', e.target.value)} />
        <Select label="Perfil" value={f.role} onChange={(e) => set('role', e.target.value as Role)} options={roles} />
        <Input label="WhatsApp do atendente" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} inputMode="tel" hint="Se preenchido, o bot oferece atendimentos para este número e a pessoa pode responder pelo próprio WhatsApp. Administrador com WhatsApp cadastrado conversa com a Pixel IA como secretária: consulta atendimentos, orçamentos e pedidos, e manda avisos e orçamentos aos clientes (por texto ou áudio)." />
        <Input label={user ? 'Nova senha (deixe vazio para manter)' : 'Senha'} type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} />
        {user && <div className="flex items-center gap-2 text-xs text-slate-600"><Switch checked={f.active} disabled={isSelf} onCheckedChange={(v) => set('active', v)} aria-label="Acesso ativo" />{f.active ? 'Acesso ativo' : 'Acesso desativado'}{isSelf && <span className="text-slate-400">(não dá para desativar a si mesmo)</span>}</div>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

const Users: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { data, loading, error, reload } = useLoad(() => api.get<User[]>('/users'), []);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Usuários" icon={UserCog} description={`${data?.length ?? 0} pessoas com acesso ao sistema`}
          action={<Button size="sm" iconLeft={<UserPlus size={14} />} onClick={() => setEditing(null)}>Novo usuário</Button>} />
        <Alert variant="info" title="Perfis">Administrador acessa tudo. Atendente cuida de clientes, orçamentos, pedidos e WhatsApp. Produção e Financeiro veem pedidos e arquivos.</Alert>
        <ContentCard padding="none">
          {error ? <EmptyState icon={UserCog} title="Não foi possível carregar os usuários" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /> : (
            <GridTable<User>
              noDesktopCard keyExtractor={(u) => u.id} data={data ?? []} isLoading={loading} onRowClick={(u) => setEditing(u)}
              emptyMessage={<EmptyState icon={UserCog} title="Nenhum usuário" />}
              columns={[
                { header: 'Nome', render: (u) => (<div><p className="text-xs font-medium text-slate-800">{u.name}</p><p className="text-[11px] text-slate-500 mt-0.5">{u.email}</p></div>) },
                { header: 'Perfil', render: (u) => <Badge size="sm" color={u.role === 'admin' ? 'primary' : 'default'}>{roleLabel[u.role]}</Badge> },
                { header: 'WhatsApp', hideOnMobile: true, render: (u) => <span className="text-xs">{maskPhone(u.phone) || <span className="text-slate-400">Não informado</span>}</span> },
                { header: 'Acesso', render: (u) => <Badge size="sm" dot color={u.active ? 'success' : 'default'}>{u.active ? 'Ativo' : 'Desativado'}</Badge> },
                { header: '', className: 'w-12', render: (u) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton variant="ghost" size="xs" aria-label={`Editar ${u.name}`} onClick={() => setEditing(u)}><Pencil /></IconButton></div> },
              ]}
            />
          )}
        </ContentCard>
      </div>
      {editing !== undefined && <UserModal user={editing} isSelf={editing?.id === currentUser.id} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); reload(); }} />}
    </PageWrapper>
  );
};

export default Users;
