import React, { useState } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { PanelCard, Button, IconButton, Input, Select, Badge, ConfirmModal, useToast } from './ui';
import { api, errMsg } from '../api';
import { brl, dateTimeLabel } from '../utils/format';
import { paymentMessage } from '../utils/messages';
import type { Order, OrderPayment, Settings } from '../types';

const methods = [
  { value: '', label: 'Forma de pagamento' }, { value: 'pix', label: 'Pix' }, { value: 'dinheiro', label: 'Dinheiro' }, { value: 'credito', label: 'Cartão de crédito' },
  { value: 'debito', label: 'Cartão de débito' }, { value: 'boleto', label: 'Boleto' }, { value: 'transferencia', label: 'Transferência' },
];
const methodLabel = (m?: string | null) => methods.find((x) => x.value === m)?.label ?? m ?? '';

/** Pagamentos recebidos do pedido: soma o recebido, mostra o que falta e pode mandar o recibo por WhatsApp. */
export const PaymentsPanel: React.FC<{ order: Order; company: string; settings: Settings | null; onChanged: () => void }> = ({ order, company, settings, onChanged }) => {
  const toast = useToast();
  const remaining = Math.max(0, Math.round((order.total - order.paid) * 100) / 100);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<OrderPayment | null>(null);
  const payments = order.payments ?? [];
  const pct = order.total > 0 ? Math.min(100, Math.round((order.paid / order.total) * 100)) : 0;

  const add = async () => {
    if (saving) return;
    const value = Number(String(amount).replace(',', '.'));
    if (!(value > 0)) { setError('Informe um valor maior que zero.'); return; }
    if (value > remaining + 0.001) { setError(`O valor passa do que falta receber (${brl(remaining)}).`); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post<{ notified: boolean | null; notifyError: string | null }>(`/orders/${order.id}/payments`, {
        amount: value, method: method || null, note, notify, message: notify ? paymentMessage(order, value, company, settings) : undefined,
      });
      toast.success('Pagamento registrado.');
      if (r.notified === false) toast.warning(`Pagamento salvo, mas o recibo não foi enviado: ${r.notifyError}`);
      else if (r.notified) toast.success('Recibo enviado pelo WhatsApp.');
      setAmount(''); setMethod(''); setNote(''); setNotify(false);
      onChanged();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!removing) return;
    try { await api.del(`/orders/${order.id}/payments/${removing.id}`); toast.success('Pagamento removido.'); setRemoving(null); onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <PanelCard title="Pagamentos" description={`${brl(order.paid)} recebidos de ${brl(order.total)}`} icon={Wallet}
      action={<Badge size="sm" color={remaining === 0 && order.total > 0 ? 'success' : order.paid > 0 ? 'purple' : 'warning'}>{remaining === 0 && order.total > 0 ? 'Quitado' : `Falta ${brl(remaining)}`}</Badge>}>
      <div className="space-y-3">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quanto já foi pago">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        {payments.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0"><b className="font-medium tabular-nums">{brl(p.amount)}</b>{p.method && <span className="text-slate-500"> · {methodLabel(p.method)}</span>}{p.note && <span className="text-slate-500"> · {p.note}</span>}
                  <span className="block text-[11px] text-slate-400">{dateTimeLabel(p.createdAt)}{p.userName ? ` · ${p.userName}` : ''}</span></span>
                <IconButton variant="ghost" size="xs" aria-label={`Remover pagamento de ${brl(p.amount)}`} onClick={() => setRemoving(p)}><Trash2 /></IconButton>
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-medium text-slate-700">Registrar pagamento</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <Input label="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={remaining.toFixed(2).replace('.', ',')}
                addonRight={<button type="button" className="text-[11px] text-blue-600 hover:underline px-1" onClick={() => setAmount(remaining.toFixed(2).replace('.', ','))}>tudo</button>} />
              <Select label="Forma" value={method} onChange={(e) => setMethod(e.target.value)} options={methods.slice(1)} placeholder="Escolha" />
              <Input label="Observação" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: entrada" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-blue-600" />Enviar recibo ao cliente pelo WhatsApp</label>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end"><Button size="sm" loading={saving} iconLeft={<Plus size={14} />} onClick={add}>Registrar</Button></div>
          </div>
        )}
      </div>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} variant="danger" title="Remover pagamento?" confirmLabel="Remover pagamento"
        message={`O pagamento de ${removing ? brl(removing.amount) : ''} será removido e o valor recebido do pedido será recalculado.`} />
    </PanelCard>
  );
};
