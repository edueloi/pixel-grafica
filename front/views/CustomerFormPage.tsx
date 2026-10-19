import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Loader2, Save } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, Input, Textarea, EmptyState, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { digits, maskCep, maskDocument, maskPhone } from '../utils/format';
import type { Customer } from '../types';

const blank = { name: '', company: '', document: '', phone: '', email: '', zip: '', street: '', number: '', district: '', city: '', state: '', notes: '' };

/** Criar e editar cliente (mesma tela). */
const CustomerFormPage: React.FC = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => (isEditing ? api.get<Customer>(`/customers/${id}`) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!data) return;
    setF({ name: data.name, company: data.company ?? '', document: maskDocument(data.document), phone: maskPhone(data.phone), email: data.email ?? '', zip: maskCep(data.zip), street: data.street ?? '', number: data.number ?? '', district: data.district ?? '', city: data.city ?? '', state: data.state ?? '', notes: data.notes ?? '' });
  }, [data]);

  if (loading && isEditing && !data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando cliente…</div></PageWrapper>;
  if (error) return <PageWrapper><ContentCard><EmptyState icon={Users} title="Não foi possível carregar o cliente" description={error} action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/clientes')}>Voltar para clientes</Button><Button onClick={() => reload()}>Tentar novamente</Button></div>} /></ContentCard></PageWrapper>;

  // Preenche o endereço pelo CEP sem apagar o que já foi digitado
  const lookupCep = async (cep: string) => {
    if (digits(cep).length !== 8) return;
    try {
      const r = await (await fetch(`https://viacep.com.br/ws/${digits(cep)}/json/`)).json();
      if (r.erro) return;
      setF((x) => ({ ...x, street: x.street || r.logradouro || '', district: x.district || r.bairro || '', city: r.localidade || x.city, state: r.uf || x.state }));
    } catch { /* o endereço pode ser digitado */ }
  };

  const save = async () => {
    if (saving) return;
    if (!f.name.trim()) { setFormError('Informe o nome do cliente.'); return; }
    if (f.phone && digits(f.phone).length < 10) { setFormError('Telefone incompleto. Informe com DDD.'); return; }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) { setFormError('E-mail inválido.'); return; }
    setSaving(true); setFormError('');
    try {
      const saved = isEditing ? await api.put<Customer>(`/customers/${id}`, f) : await api.post<Customer>('/customers', f);
      toast.success(isEditing ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      navigate(`/clientes/${saved.id}`);
    } catch (e) { setFormError(errMsg(e)); setSaving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to={isEditing ? `/clientes/${id}` : '/clientes'} label={isEditing ? 'Voltar para o cliente' : 'Voltar para clientes'} />
        <SectionTitle title={isEditing ? 'Editar cliente' : 'Novo cliente'} icon={Users} description="O WhatsApp é usado para enviar orçamentos, ordens de serviço e avisos, e para a IA reconhecer o cliente." />

        <PanelCard title="Dados do cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome" value={f.name} onChange={(e) => set('name', e.target.value)} wrapperClassName="sm:col-span-2" autoFocus={!isEditing} />
            <Input label="Empresa" value={f.company} onChange={(e) => set('company', e.target.value)} />
            <Input label="CPF / CNPJ" value={f.document} onChange={(e) => set('document', maskDocument(e.target.value))} inputMode="numeric" />
            <Input label="WhatsApp" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} inputMode="tel" placeholder="(15) 99999-9999" />
            <Input label="E-mail" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </PanelCard>
        <PanelCard title="Endereço">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="CEP" value={f.zip} onChange={(e) => { const v = maskCep(e.target.value); set('zip', v); void lookupCep(v); }} inputMode="numeric" hint="Preenche o endereço automaticamente." />
            <Input label="Rua" value={f.street} onChange={(e) => set('street', e.target.value)} />
            <Input label="Número" value={f.number} onChange={(e) => set('number', e.target.value)} />
            <Input label="Bairro" value={f.district} onChange={(e) => set('district', e.target.value)} />
            <Input label="Cidade" value={f.city} onChange={(e) => set('city', e.target.value)} />
            <Input label="UF" value={f.state} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </div>
        </PanelCard>
        <PanelCard title="Observações">
          <Textarea aria-label="Observações" value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Preferências, forma de pagamento combinada, contato de quem aprova a arte…" />
        </PanelCard>

        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => navigate(isEditing ? `/clientes/${id}` : '/clientes')}>Cancelar</Button>
          <Button size="sm" loading={saving} iconLeft={<Save size={14} />} onClick={save}>{isEditing ? 'Salvar' : 'Cadastrar'}</Button>
        </div>
      </div>
    </PageWrapper>
  );
};

export default CustomerFormPage;
