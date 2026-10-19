import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, Input, EmptyState, Alert, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import type { Partner } from '../types';

type Row = { name: string; percent: string };

/** Divisão do lucro entre os sócios (ex.: Renato 30% / Gui 70%). Usada na lista de serviços. */
const ServicesProfitPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<{ partners: Partner[] }>('/services/partners'), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => { if (data) setRows(data.partners.map((p) => ({ name: p.name, percent: String(p.percent) }))); }, [data]);

  if (loading && !data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (error || !data) return <PageWrapper><ContentCard><EmptyState icon={PieChart} title="Não foi possível carregar" description={error} action={<Button onClick={() => reload()}>Tentar novamente</Button>} /></ContentCard></PageWrapper>;

  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const sum = Math.round(rows.reduce((s, r) => s + num(r.percent), 0) * 100) / 100;
  const set = (i: number, patch: Partial<Row>) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (saving) return;
    if (rows.length === 0) { setFormError('Cadastre pelo menos um sócio.'); return; }
    if (rows.some((r) => !r.name.trim())) { setFormError('Todo sócio precisa de um nome.'); return; }
    if (rows.some((r) => num(r.percent) < 0 || num(r.percent) > 100)) { setFormError('A porcentagem de cada sócio fica entre 0 e 100.'); return; }
    if (Math.abs(sum - 100) > 0.001) { setFormError(`A divisão precisa somar 100% (está em ${sum}%).`); return; }
    setSaving(true); setFormError('');
    try {
      await api.put('/services/partners', { partners: rows.map((r) => ({ name: r.name.trim(), percent: num(r.percent) })) });
      toast.success('Divisão do lucro atualizada.');
      navigate('/servicos');
    } catch (e) { setFormError(errMsg(e)); setSaving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/servicos" label="Voltar para serviços" />
        <SectionTitle title="Divisão do lucro" icon={PieChart} description="Como o lucro (venda − custo) de cada serviço é repartido entre os sócios." />
        <Alert variant="info" title="Só o administrador altera">A divisão vale para todos os serviços e aparece na lista como uma coluna por sócio.</Alert>
        <PanelCard title="Sócios">
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-3 items-end">
                <Input label={i === 0 ? 'Nome' : undefined} aria-label={`Nome do sócio ${i + 1}`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Nome" />
                <Input label={i === 0 ? '% do lucro' : undefined} aria-label={`Porcentagem do sócio ${i + 1}`} inputMode="decimal" value={r.percent} onChange={(e) => set(i, { percent: e.target.value })} />
                <Button variant="ghost" size="sm" aria-label={`Remover ${r.name || 'sócio'}`} disabled={rows.length <= 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" iconLeft={<Plus size={14} />} onClick={() => setRows((x) => [...x, { name: '', percent: '0' }])}>Adicionar sócio</Button>
              <p className={`text-sm font-semibold tabular-nums ${Math.abs(sum - 100) <= 0.001 ? 'text-emerald-700' : 'text-red-600'}`}>Total: {sum}%</p>
            </div>
          </div>
        </PanelCard>
        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => navigate('/servicos')}>Cancelar</Button>
          <Button size="sm" loading={saving} iconLeft={<Save size={14} />} onClick={save}>Salvar divisão</Button>
        </div>
      </div>
    </PageWrapper>
  );
};

export default ServicesProfitPage;
