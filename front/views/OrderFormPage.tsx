import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClipboardList, Loader2, Save } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, Button, Input, Select, Textarea, EmptyState, PanelCard, DatePicker, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { ItemsEditor, sumLines } from '../components/ItemsEditor';
import { CustomerSelect } from '../components/CustomerSelect';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useSettings } from '../src/hooks/useSettings';
import { brl, inputDate } from '../utils/format';
import type { Customer, LineItem, Order, Product } from '../types';

/** Criar e editar ordem de serviço (mesma tela). O que já foi recebido é controlado na aba Pagamentos. */
const inDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const OrderFormPage: React.FC = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const meta = useLoad(() => Promise.all([api.get<Customer[]>('/customers'), api.get<Product[]>('/products'), isEditing ? api.get<Order>(`/orders/${id}`) : Promise.resolve(null)]), [id]);

  const [customerId, setCustomerId] = useState(params.get('cliente') ?? '');
  const [items, setItems] = useState<LineItem[]>([]);
  const [priority, setPriority] = useState<'normal' | 'urgente'>('normal');
  const [deliveryType, setDeliveryType] = useState<'retirada' | 'entrega'>('retirada');
  const settings = useSettings();
  const [dueDate, setDueDate] = useState('');
  // ordem nova: prazo padrão das Configurações (a pessoa ainda pode trocar a data)
  useEffect(() => { if (!isEditing && settings && settings.defaultLeadDays > 0) setDueDate((v) => v || inDays(settings.defaultLeadDays)); }, [isEditing, settings]);
  const [entry, setEntry] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const o = meta.data?.[2];
    if (!o) return;
    setCustomerId(o.customer.id); setItems(o.items); setPriority(o.priority); setDeliveryType(o.deliveryType); setDueDate(inputDate(o.dueDate)); setNotes(o.notes ?? '');
  }, [meta.data]);

  if (meta.loading && !meta.data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (meta.error || !meta.data) {
    return <PageWrapper><ContentCard><EmptyState icon={ClipboardList} title="Não foi possível carregar" description={meta.error} action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/pedidos')}>Voltar para ordens de serviço</Button><Button onClick={() => meta.reload()}>Tentar novamente</Button></div>} /></ContentCard></PageWrapper>;
  }
  const [customers, products, existing] = meta.data;
  const total = sumLines(items);
  const entryValue = Math.max(0, Number(String(entry).replace(',', '.')) || 0);
  const paid = isEditing ? existing?.paid ?? 0 : entryValue;

  const save = async () => {
    if (saving) return;
    if (!customerId) { setError('Escolha o cliente.'); return; }
    if (!items.length || items.some((i) => !i.description.trim())) { setError('Adicione os itens e preencha a descrição de cada um.'); return; }
    if (!isEditing && entryValue > total) { setError('A entrada não pode ser maior que o total do pedido.'); return; }
    if (isEditing && existing && total < existing.paid) { setError(`O total ficaria menor que o já recebido (${brl(existing.paid)}). Ajuste os pagamentos primeiro.`); return; }
    setSaving(true); setError('');
    try {
      const body = { customerId, items, priority, deliveryType, dueDate: dueDate || null, notes, ...(isEditing ? {} : { paid: entryValue }) };
      const saved = isEditing ? await api.put<Order>(`/orders/${id}`, body) : await api.post<Order>('/orders', body);
      toast.success(isEditing ? 'Ordem de serviço atualizada.' : 'Ordem de serviço criada.');
      navigate(`/pedidos/${saved.id}`);
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to={isEditing ? `/pedidos/${id}` : '/pedidos'} label={isEditing ? 'Voltar para a ordem de serviço' : 'Voltar para ordens de serviço'} />
        <SectionTitle title={isEditing ? `Editar ordem de serviço #${existing?.number}` : 'Nova ordem de serviço'} icon={ClipboardList}
          description={isEditing ? 'Atualize itens, entrega e observações. O PDF é gerado com estes dados.' : 'Escolha o cliente, monte os itens e defina a entrega.'} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <ContentCard padding="md">
              {isEditing && existing
                ? <p className="text-xs text-slate-500">Cliente: <span className="text-slate-800 font-medium">{existing.customer.name}</span></p>
                : <CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} disabled={saving} />}
            </ContentCard>
            <ContentCard padding="md"><h3 className="text-xs font-semibold text-slate-800 mb-2">Itens</h3><ItemsEditor items={items} products={products} onChange={setItems} disabled={saving} /></ContentCard>
            <ContentCard padding="md">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DatePicker label="Data de entrega" value={dueDate || null} onChange={(v) => setDueDate(v ?? '')} disabled={saving} />
                <Select label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value as 'normal' | 'urgente')} options={[{ value: 'normal', label: 'Normal' }, { value: 'urgente', label: 'Urgente' }]} disabled={saving} />
                <Select label="Entrega" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value as 'retirada' | 'entrega')} options={[{ value: 'retirada', label: 'Retirada na loja' }, { value: 'entrega', label: 'Entrega' }]} disabled={saving} />
                {!isEditing && <Input label="Entrada já recebida (R$)" type="number" min={0} step="0.01" value={entry} onChange={(e) => setEntry(e.target.value)} disabled={saving} hint="Vira o primeiro pagamento. Outros pagamentos entram na aba Pagamentos." />}
                <Textarea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} wrapperClassName="sm:col-span-2" disabled={saving} />
              </div>
            </ContentCard>
          </div>
          <aside className="lg:sticky lg:top-3 space-y-3">
            <PanelCard title="Resumo">
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-slate-500">Itens</dt><dd>{items.length}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums text-blue-700">{brl(total)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Recebido</dt><dd className="tabular-nums">{brl(paid)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">A receber</dt><dd className="tabular-nums">{brl(Math.max(0, total - paid))}</dd></div>
              </dl>
            </PanelCard>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" disabled={saving} onClick={() => navigate(isEditing ? `/pedidos/${id}` : '/pedidos')}>Cancelar</Button>
              <Button size="sm" className="flex-1" loading={saving} iconLeft={<Save size={14} />} onClick={save}>{isEditing ? 'Salvar' : 'Criar ordem'}</Button>
            </div>
          </aside>
        </div>
      </div>
    </PageWrapper>
  );
};

export default OrderFormPage;
