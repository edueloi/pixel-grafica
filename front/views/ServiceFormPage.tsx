import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wrench, Loader2, Save, Trash2 } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, Input, Select, Textarea, EmptyState, ConfirmModal, Alert, DatePicker, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { brl, inputDate } from '../utils/format';
import { useSettings } from '../src/hooks/useSettings';
import { methodLabel, shareOf } from './Services';
import type { Customer, Partner, ServiceRecord } from '../types';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const n = (v: string) => Number(String(v).replace(',', '.')) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Detail = ServiceRecord & { partners?: Partner[] };

/** Lançar e editar um serviço realizado (mesma tela): venda, custo, lucro, divisão entre sócios e pagamento. */
const ServiceFormPage: React.FC = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const { data, loading, error, reload } = useLoad(async () => ({
    record: isEditing ? await api.get<Detail>(`/services/${id}`).catch((e) => { if (e?.status === 404) return null; throw e; }) : null,
    customers: await api.get<Customer[]>('/customers'),
    partners: isEditing ? null : (await api.get<{ partners: Partner[] }>('/services/partners')).partners,
  }), [id]);

  const [f, setF] = useState({ date: today(), customerName: '', description: '', category: '', quantity: '1', unitPrice: '', cost: '', amountPaid: '', paymentMethod: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const r = data?.record;
    if (!r) return;
    setF({ date: inputDate(r.date), customerName: r.customerName, description: r.description, category: r.category ?? '', quantity: String(r.quantity), unitPrice: r.total > 0 ? String(r.unitPrice) : '', cost: r.cost ? String(r.cost) : '', amountPaid: r.amountPaid ? String(r.amountPaid) : '', paymentMethod: r.paymentMethod ?? '', notes: r.notes ?? '' });
  }, [data]);

  if (loading && !data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (error || !data) return <PageWrapper><ContentCard><EmptyState icon={Wrench} title="Não foi possível carregar" description={error} action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/servicos')}>Voltar para serviços</Button><Button onClick={() => reload()}>Tentar novamente</Button></div>} /></ContentCard></PageWrapper>;
  if (isEditing && !data.record) return <PageWrapper><ContentCard><EmptyState icon={Wrench} title="Serviço não encontrado" description="Ele pode ter sido excluído." action={<Button onClick={() => navigate('/servicos')}>Voltar para serviços</Button>} /></ContentCard></PageWrapper>;

  const qty = n(f.quantity);
  const unit = n(f.unitPrice);
  const total = f.unitPrice.trim() === '' ? 0 : r2(qty * unit);
  const cost = n(f.cost);
  const paid = n(f.amountPaid);
  const profit = r2(total - cost);
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  const record = data.record;
  const partners = record?.partners ?? data.partners ?? [];
  const unpriced = total <= 0;

  const save = async () => {
    if (saving) return;
    if (!f.date) { setFormError('Informe a data.'); return; }
    if (!f.description.trim()) { setFormError('Descreva o serviço.'); return; }
    if (!(qty > 0)) { setFormError('A quantidade precisa ser maior que zero.'); return; }
    if (unit < 0 || cost < 0 || paid < 0) { setFormError('Os valores não podem ser negativos.'); return; }
    if (paid > total + 0.005) { setFormError('O valor pago não pode ser maior que a venda.'); return; }
    setSaving(true); setFormError('');
    try {
      const body = { date: f.date, customerName: f.customerName, description: f.description, category: f.category, quantity: qty, unitPrice: unpriced ? 0 : unit, total, cost, amountPaid: paid, paymentMethod: f.paymentMethod || null, notes: f.notes };
      if (isEditing) await api.put(`/services/${id}`, body); else await api.post('/services', body);
      toast.success(isEditing ? 'Serviço atualizado.' : 'Serviço registrado.');
      navigate('/servicos');
    } catch (e) { setFormError(errMsg(e)); setSaving(false); }
  };

  const remove = async () => {
    try { await api.del(`/services/${id}`); toast.success('Serviço excluído.'); navigate('/servicos'); } catch (e) { toast.error(errMsg(e)); setRemoving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/servicos" label="Voltar para serviços">
          {isEditing && <Button variant="outline" size="sm" iconLeft={<Trash2 size={14} />} onClick={() => setRemoving(true)}>Excluir</Button>}
        </BackBar>
        <SectionTitle title={isEditing ? 'Editar serviço' : 'Novo serviço'} icon={Wrench} description="Registro de um serviço que a gráfica realizou." />
        {record?.source === 'pedido' && <Alert variant="info" title="Veio de um pedido entregue">Este registro foi criado sozinho quando o pedido foi entregue. Se o pedido for reaberto, ele sai do registro.</Alert>}

        <PanelCard title="O serviço">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DatePicker label="Data" value={f.date || null} max={today()} onChange={(v) => set('date', v ?? '')} />
            <Input label="Cliente" value={f.customerName} onChange={(e) => set('customerName', e.target.value)} list="service-customers" placeholder="Nome (deixe vazio para cliente avulso)" hint="Se o nome for de um cliente cadastrado, fica vinculado a ele." />
            <datalist id="service-customers">{data.customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Input label="Serviço" value={f.description} onChange={(e) => set('description', e.target.value)} wrapperClassName="sm:col-span-2" placeholder="Ex.: Banner 90x60 cm" autoFocus={!isEditing} />
            <Input label="Categoria" value={f.category} onChange={(e) => set('category', e.target.value)} list="service-categories" placeholder="Ex.: Banner e faixa" hint="As sugestões vêm de Configurações." />
            <datalist id="service-categories">{(settings?.categories ?? []).map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </PanelCard>

        <PanelCard title="Venda e custo" description="Deixe o valor em branco se o serviço ainda vai ser orçado.">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Input label="Quantidade" inputMode="decimal" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />
            <Input label="Valor unitário (R$)" inputMode="decimal" value={f.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="a orçar" />
            <Input label="Custo (R$)" inputMode="decimal" value={f.cost} onChange={(e) => set('cost', e.target.value)} placeholder="0,00" />
            <div className="pb-2"><p className="text-[11px] text-slate-500">Venda</p><p className="text-base font-semibold tabular-nums text-blue-700">{unpriced ? 'A orçar' : brl(total)}</p></div>
          </div>
          {!unpriced && (
            <dl className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><dt className="text-[11px] text-slate-500">Lucro</dt><dd className={`text-sm font-semibold tabular-nums ${profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{brl(profit)}</dd></div>
              {partners.map((p) => <div key={p.name}><dt className="text-[11px] text-slate-500">{p.name} · {p.percent}%</dt><dd className="text-sm font-semibold tabular-nums text-slate-800">{brl(shareOf(profit, p.percent))}</dd></div>)}
            </dl>
          )}
        </PanelCard>

        <PanelCard title="Pagamento">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Input label="Valor pago (R$)" inputMode="decimal" value={f.amountPaid} onChange={(e) => set('amountPaid', e.target.value)} placeholder="0,00" disabled={unpriced} />
              {!unpriced && <button type="button" className="mt-1 text-[11px] text-blue-700 hover:underline" onClick={() => set('amountPaid', String(total))}>Quitar (pago por inteiro)</button>}
            </div>
            <div className="pb-2"><p className="text-[11px] text-slate-500">Pagamento executado</p><p className="text-base font-semibold tabular-nums">{unpriced ? '—' : `${pct}%`}</p></div>
            <Select label="Forma de pagamento" value={f.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} placeholder="Não informada" options={Object.entries(methodLabel).map(([value, label]) => ({ value, label }))} />
          </div>
        </PanelCard>
        <PanelCard title="Observações"><Textarea aria-label="Observações" value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={3} /></PanelCard>

        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => navigate('/servicos')}>Cancelar</Button>
          <Button size="sm" loading={saving} iconLeft={<Save size={14} />} onClick={save}>{isEditing ? 'Salvar' : 'Registrar'}</Button>
        </div>
      </div>
      <ConfirmModal isOpen={removing} onClose={() => setRemoving(false)} onConfirm={remove} variant="danger" title="Excluir serviço?" confirmLabel="Excluir serviço" message="O registro será removido do histórico. Não dá para desfazer." />
    </PageWrapper>
  );
};

export default ServiceFormPage;
