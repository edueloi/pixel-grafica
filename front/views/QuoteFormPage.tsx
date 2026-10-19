import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileText, Loader2, Save } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, Button, Input, Textarea, EmptyState, PanelCard, DatePicker, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { ItemsEditor, sumLines } from '../components/ItemsEditor';
import { CustomerSelect } from '../components/CustomerSelect';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useSettings } from '../src/hooks/useSettings';
import { brl, inputDate } from '../utils/format';
import type { Customer, LineItem, Product, Quote } from '../types';

/** Criar e editar orçamento (mesma tela). Novo orçamento nasce como rascunho. */
const inDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const QuoteFormPage: React.FC = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const meta = useLoad(() => Promise.all([api.get<Customer[]>('/customers'), api.get<Product[]>('/products'), isEditing ? api.get<Quote>(`/quotes/${id}`) : Promise.resolve(null)]), [id]);

  const [customerId, setCustomerId] = useState(params.get('cliente') ?? '');
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const settings = useSettings();
  const [validUntil, setValidUntil] = useState('');
  // orçamento novo: validade padrão das Configurações (a pessoa ainda pode trocar a data)
  useEffect(() => { if (!isEditing && settings) setValidUntil((v) => v || inDays(settings.quoteValidityDays)); }, [isEditing, settings]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // carrega os dados do orçamento ao editar
  useEffect(() => {
    const q = meta.data?.[2];
    if (!q) return;
    setCustomerId(q.customer.id); setItems(q.items); setDiscount(String(q.discount)); setValidUntil(inputDate(q.validUntil)); setNotes(q.notes ?? '');
  }, [meta.data]);

  if (meta.loading && !meta.data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (meta.error || !meta.data) {
    return <PageWrapper><ContentCard><EmptyState icon={FileText} title="Não foi possível carregar" description={meta.error} action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/orcamentos')}>Voltar para orçamentos</Button><Button onClick={() => meta.reload()}>Tentar novamente</Button></div>} /></ContentCard></PageWrapper>;
  }
  const [customers, products, existing] = meta.data;
  const locked = !!existing && (existing.orders?.length ?? 0) > 0;
  const subtotal = sumLines(items);
  const disc = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - disc);

  const save = async () => {
    if (saving) return;
    if (!customerId) { setError('Escolha o cliente.'); return; }
    if (!items.length || items.some((i) => !i.description.trim())) { setError('Adicione os itens e preencha a descrição de cada um.'); return; }
    if (disc > subtotal) { setError('O desconto não pode ser maior que o subtotal.'); return; }
    setSaving(true); setError('');
    try {
      const body = { customerId, items, discount: disc, validUntil: validUntil || null, notes };
      const saved = isEditing ? await api.put<Quote>(`/quotes/${id}`, body) : await api.post<Quote>('/quotes', body);
      toast.success(isEditing ? 'Orçamento atualizado.' : 'Rascunho salvo. Revise e envie ao cliente.');
      navigate(`/orcamentos/${saved.id}`);
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to={isEditing ? `/orcamentos/${id}` : '/orcamentos'} label={isEditing ? 'Voltar para o orçamento' : 'Voltar para orçamentos'} />
        <SectionTitle title={isEditing ? `Editar orçamento #${existing?.number}` : 'Novo orçamento'} icon={FileText}
          description={isEditing ? 'Atualize itens, valores e condições. O PDF é gerado com estes dados.' : 'Escolha o cliente e monte os itens. Ele é salvo como rascunho até você enviar.'} />

        {locked ? (
          <ContentCard><EmptyState icon={FileText} title="Este orçamento já virou ordem de serviço" description="Para alterar itens e valores, edite a ordem de serviço." action={<Button onClick={() => navigate(`/orcamentos/${id}`)}>Voltar para o orçamento</Button>} /></ContentCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            <div className="space-y-4 min-w-0">
              <ContentCard padding="md"><CustomerSelect customers={customers} value={customerId} onChange={setCustomerId} disabled={saving} /></ContentCard>
              <ContentCard padding="md"><h3 className="text-xs font-semibold text-slate-800 mb-2">Itens</h3><ItemsEditor items={items} products={products} onChange={setItems} disabled={saving} /></ContentCard>
              <ContentCard padding="md">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Desconto (R$)" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={saving} />
                  <DatePicker label="Válido até" value={validUntil || null} onChange={(v) => setValidUntil(v ?? '')} disabled={saving} />
                  <Textarea label="Observações (prazo, entrega, condições)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} wrapperClassName="sm:col-span-2" disabled={saving} />
                </div>
              </ContentCard>
            </div>
            <aside className="lg:sticky lg:top-3 space-y-3">
              <PanelCard title="Resumo">
                <dl className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between"><dt className="text-slate-500">Itens</dt><dd>{items.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{brl(subtotal)}</dd></div>
                  {disc > 0 && <div className="flex justify-between"><dt className="text-slate-500">Desconto</dt><dd className="tabular-nums">- {brl(disc)}</dd></div>}
                  <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums text-blue-700">{brl(total)}</dd></div>
                </dl>
              </PanelCard>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1" disabled={saving} onClick={() => navigate(isEditing ? `/orcamentos/${id}` : '/orcamentos')}>Cancelar</Button>
                <Button size="sm" className="flex-1" loading={saving} iconLeft={<Save size={14} />} onClick={save}>{isEditing ? 'Salvar' : 'Salvar rascunho'}</Button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};

export default QuoteFormPage;
