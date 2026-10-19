import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Copy, Undo2, Loader2 } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, Badge, Alert, StatGrid, StatCard, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { api, errMsg, getToken } from '../api';
import { brl, dateLabel, fileSize } from '../utils/format';
import type { ImportPreview } from '../types';

interface Result { batch: string; imported: number; skippedErrors: number; skippedDuplicates: number; sum: number }

/** Importar serviços de uma planilha (xlsx, xls, ods ou csv): confere antes, grava só o que está certo e permite desfazer. */
const ServicesImportPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [skipDup, setSkipDup] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState('');

  const read = async (f: File | undefined) => {
    if (!f || reading) return;
    if (f.size > 10 * 1024 * 1024) { setError('Arquivo grande demais (máximo de 10 MB).'); return; }
    setFile(f); setPreview(null); setResult(null); setError(''); setReading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      setPreview(await api.post<ImportPreview>('/services/import/preview', form));
    } catch (e) { setError(errMsg(e)); setFile(null); } finally { setReading(false); if (input.current) input.current.value = ''; }
  };

  const importable = preview ? preview.rows.filter((r) => !r.errors.length && (!skipDup || !r.duplicate)) : [];
  const confirm = async () => {
    if (!preview || importing || !importable.length) return;
    setImporting(true); setError('');
    try {
      const r = await api.post<Result>('/services/import', { rows: importable, skipDuplicates: skipDup });
      setResult(r); setPreview(null); toast.success(`${r.imported} serviço(s) importado(s).`);
    } catch (e) { setError(errMsg(e)); } finally { setImporting(false); }
  };
  const undo = async () => {
    if (!result) return;
    try { await api.del(`/services/import/${result.batch}`); setUndone(true); toast.success('Importação desfeita.'); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to="/servicos" label="Voltar para serviços" />
        <SectionTitle title="Importar serviços" icon={Upload} description="Traga o histórico de uma planilha (Excel, LibreOffice ou CSV). Nada é gravado antes de você conferir." />

        {!result && (
          <PanelCard title="1. Escolha a planilha">
            <div className="space-y-3">
              <input ref={input} type="file" accept=".xlsx,.xls,.ods,.csv,text/csv" className="hidden" aria-label="Escolher planilha" onChange={(e) => read(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" loading={reading} iconLeft={<FileSpreadsheet size={14} />} onClick={() => input.current?.click()}>{file ? 'Trocar planilha' : 'Escolher planilha'}</Button>
                <a className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1" href={`/api/services-template.csv?token=${encodeURIComponent(getToken() || '')}`}><Download size={12} />Baixar modelo (CSV)</a>
                {file && <span className="text-xs text-slate-500">{file.name} · {fileSize(file.size)}</span>}
              </div>
              <p className="text-xs text-slate-500">A primeira linha precisa ser o cabeçalho. Reconhece a planilha de controle da gráfica: <b className="font-medium text-slate-700">Data, Cliente, Serviços executados</b> (obrigatórias), <b className="font-medium text-slate-700">Venda, Custo, Pagamento executado (%), Valor pago</b>, além de Categoria, Quantidade, Forma de pagamento, Situação e Observação. As colunas <b className="font-medium text-slate-700">Lucro e dos sócios</b> são calculadas pelo sistema e ignoradas. Linhas sem venda entram como “a orçar”. A ordem não importa e os nomes aceitam variações.</p>
              {reading && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Lendo a planilha…</div>}
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            </div>
          </PanelCard>
        )}

        {preview && (
          <>
            <PanelCard title="2. Confira antes de importar" description={`${preview.fileName} · ${preview.summary.total} linha(s) lida(s)`}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5" aria-label="Colunas reconhecidas">
                  {preview.columns.map((c, i) => <Badge key={i} size="sm" color={c.field ? 'success' : 'default'}>{c.header}{c.label ? ` → ${c.label}` : ' (ignorada)'}</Badge>)}
                </div>
                {preview.missing.length > 0 && <Alert variant="warning" title="Faltam colunas importantes">Não encontrei: {preview.missing.join(', ')}. As linhas ficam com erro até a planilha ter essas colunas.</Alert>}
                {preview.truncated && <Alert variant="warning" title={`Só as primeiras ${preview.limit} linhas foram lidas`}>Divida a planilha em partes menores e importe uma de cada vez.</Alert>}
                <StatGrid cols={4}>
                  <StatCard title="Prontas para importar" value={importable.length} icon={CheckCircle2} color="success" description={preview.summary.unpriced ? `${preview.summary.unpriced} a orçar` : undefined} />
                  <StatCard title="Com erro" value={preview.summary.errors} icon={AlertTriangle} color={preview.summary.errors ? 'danger' : 'default'} description="não serão importadas" />
                  <StatCard title="Já cadastradas" value={preview.summary.duplicates} icon={Copy} color={preview.summary.duplicates ? 'warning' : 'default'} description="mesmo dia, cliente, serviço e valor" />
                  <StatCard title="Venda a importar" value={brl(importable.reduce((s, r) => s + r.total, 0))} icon={CheckCircle2} color="info" description={`custo ${brl(importable.reduce((s, r) => s + r.cost, 0))} · lucro ${brl(importable.reduce((s, r) => s + r.total - r.cost, 0))}`} />
                </StatGrid>
                {preview.summary.duplicates > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} className="accent-blue-600" />Pular as {preview.summary.duplicates} linha(s) que já existem no sistema (recomendado)</label>
                )}
              </div>
            </PanelCard>

            <ContentCard padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[900px]">
                <caption className="sr-only">Prévia das linhas da planilha</caption>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500"><tr>
                  {['Linha', 'Data', 'Cliente', 'Serviço', 'Venda', 'Custo', 'Valor pago', 'Situação', 'Conferência'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.slice(0, 200).map((r) => (
                    <tr key={r.line} className={r.errors.length ? 'bg-red-50/60' : r.duplicate ? 'bg-slate-50' : r.paid ? 'bg-emerald-50/60' : 'bg-amber-50/60'}>
                      <td className="px-3 py-2 tabular-nums text-slate-400">{r.line}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.date ? dateLabel(r.date) : '—'}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate">{r.customerName}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate">{r.description || '—'}</td>
                      <td className="px-3 py-2 tabular-nums font-medium whitespace-nowrap">{r.total > 0 ? brl(r.total) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.total > 0 || r.cost > 0 ? brl(r.cost) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{brl(r.amountPaid)}</td>
                      <td className="px-3 py-2"><Badge size="sm" color={r.total <= 0 ? 'default' : r.paid ? 'success' : 'warning'}>{r.total <= 0 ? 'A orçar' : r.paid ? 'Pago' : r.amountPaid > 0 ? 'Pago em parte' : 'A receber'}</Badge></td>
                      <td className="px-3 py-2">{r.errors.length ? <span className="text-red-600">{r.errors.join('; ')}</span> : r.duplicate ? <span className="text-slate-600">Já cadastrado</span> : r.warnings?.length ? <span className="text-amber-700">{r.warnings.join('; ')}</span> : <span className="text-emerald-700">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 200 && <p className="text-[11px] text-slate-500 px-3 py-2 border-t border-slate-100">Mostrando as 200 primeiras de {preview.rows.length} linhas. Todas as linhas válidas serão importadas.</p>}
            </ContentCard>

            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3 pt-3 border-t border-slate-200">
              <Button variant="ghost" size="sm" disabled={importing} onClick={() => { setPreview(null); setFile(null); }}>Cancelar</Button>
              <Button size="sm" loading={importing} disabled={!importable.length} iconLeft={<Upload size={14} />} onClick={confirm}>{importable.length ? `Importar ${importable.length} serviço(s)` : 'Nada para importar'}</Button>
            </div>
          </>
        )}

        {result && (
          <PanelCard title={undone ? 'Importação desfeita' : '3. Importação concluída'} icon={CheckCircle2}>
            <div className="space-y-3 text-[13px]">
              {undone
                ? <p>Os {result.imported} serviço(s) desta importação foram removidos.</p>
                : <p><b className="font-medium">{result.imported}</b> serviço(s) importado(s), somando <b className="font-medium text-blue-700">{brl(result.sum)}</b>.{result.skippedDuplicates > 0 && ` ${result.skippedDuplicates} já existiam e foram puladas.`}{result.skippedErrors > 0 && ` ${result.skippedErrors} com erro não entraram.`}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate('/servicos?periodo=todos')}>Ver serviços</Button>
                {!undone && <Button size="sm" variant="outline" iconLeft={<Undo2 size={14} />} onClick={undo}>Desfazer esta importação</Button>}
                <Button size="sm" variant="ghost" onClick={() => { setResult(null); setUndone(false); setFile(null); }}>Importar outra planilha</Button>
              </div>
            </div>
          </PanelCard>
        )}
      </div>
    </PageWrapper>
  );
};

export default ServicesImportPage;
