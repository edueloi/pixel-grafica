import React, { useRef, useState } from 'react';
import { Upload, Download, ExternalLink, Trash2, FileText, Image as ImageIcon, File as FileIcon, Eye, Sparkles, Loader2 } from 'lucide-react';
import { Button, IconButton, Modal, ModalFooter, ConfirmModal, Badge, EmptyState, Switch, useToast } from './ui';
import { api, errMsg, fileUrl } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { dateLabel, fileSize } from '../utils/format';
import type { FileItem } from '../types';

const iconFor = (mime: string) => (mime.startsWith('image/') ? ImageIcon : mime.includes('pdf') || mime.startsWith('text/') ? FileText : FileIcon);

export const AiTextModal: React.FC<{ file: FileItem; onClose: () => void }> = ({ file, onClose }) => {
  const { data, loading, error } = useLoad(() => api.get<{ name: string; text: string | null }>(`/files/${file.id}/text`), [file.id]);
  return (
    <Modal isOpen onClose={onClose} size="lg" title={`O que a IA lê em "${file.name}"`} footer={<ModalFooter align="left"><Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button></ModalFooter>}>
      {loading && <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Carregando…</div>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {data && (data.text
        ? <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">{data.text}</pre>
        : <p className="text-xs text-slate-500">Não foi possível extrair texto deste arquivo (imagens e artes finais não têm texto legível). Ele fica guardado, mas a IA não o consulta.</p>)}
    </Modal>
  );
};

interface Props { orderId?: string; customerId?: string; kind?: FileItem['kind']; query?: string; allowUpload?: boolean; emptyHint?: string; aiToggle?: boolean }

/** Lista + envio de arquivos. Usada no pedido, no cliente e na biblioteca de arquivos. */
export const FilesPanel: React.FC<Props> = ({ orderId, customerId, kind, query = '', allowUpload = true, emptyHint, aiToggle = true }) => {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const params = new URLSearchParams({ ...(orderId ? { orderId } : {}), ...(customerId ? { customerId } : {}), ...(kind ? { kind } : {}), ...(query ? { q: query } : {}) }).toString();
  const { data, loading, error, reload } = useLoad(() => api.get<FileItem[]>(`/files${params ? `?${params}` : ''}`), [params]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<FileItem | null>(null);
  const [reading, setReading] = useState<FileItem | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      if (orderId) form.append('orderId', orderId);
      if (customerId) form.append('customerId', customerId);
      form.append('kind', kind ?? (orderId ? 'order' : customerId ? 'customer' : 'knowledge'));
      await api.post('/files', form);
      toast.success(files.length > 1 ? 'Arquivos enviados.' : 'Arquivo enviado.');
      reload(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); if (input.current) input.current.value = ''; }
  };

  const toggleAi = async (f: FileItem, value: boolean) => {
    try { await api.patch(`/files/${f.id}`, { aiEnabled: value }); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await api.del(`/files/${removing.id}`); toast.success('Arquivo excluído.'); setRemoving(null); reload(true); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {allowUpload && (
        <div>
          <input ref={input} type="file" multiple className="hidden" aria-label="Escolher arquivos" onChange={(e) => upload(e.target.files)} />
          <Button variant="outline" size="sm" loading={uploading} iconLeft={<Upload size={14} />} onClick={() => input.current?.click()}>Enviar arquivos</Button>
          <span className="text-[11px] text-slate-500 ml-2">PDF, Word, Excel, imagens e artes (até 100 MB)</span>
        </div>
      )}
      {loading && !data && <div role="status" className="flex items-center gap-2 text-sm text-slate-500 py-4"><Loader2 size={16} className="animate-spin" />Carregando arquivos…</div>}
      {error && <EmptyState icon={FileIcon} title="Não foi possível carregar os arquivos" description={error} action={<Button size="sm" onClick={() => reload()}>Tentar novamente</Button>} />}
      {data && data.length === 0 && <EmptyState icon={FileIcon} title="Nenhum arquivo" description={emptyHint ?? 'Envie o primeiro arquivo.'} />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {data.map((f) => {
            const Icon = iconFor(f.mime);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <span className="w-8 h-8 rounded-md border border-blue-100 bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Icon size={16} /></span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[13px] text-slate-800 truncate">{f.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{[fileSize(f.size), dateLabel(f.createdAt), f.uploadedBy, f.customer?.name, f.order ? `Pedido #${f.order.number}` : ''].filter(Boolean).join(' · ')}</p>
                </div>
                {aiToggle && (
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title={f.readable ? 'A IA consulta o texto deste arquivo' : 'Sem texto legível: a IA não consegue consultar'}>
                    <Switch size="sm" checked={f.aiEnabled && !!f.readable} disabled={!f.readable} onCheckedChange={(v) => toggleAi(f, v)} aria-label={`IA pode ler ${f.name}`} />
                    <Sparkles size={12} className={f.aiEnabled && f.readable ? 'text-blue-600' : 'text-slate-300'} />IA
                  </label>
                )}
                {f.kind === 'chat' && <Badge size="sm" color="info">WhatsApp</Badge>}
                <div className="flex gap-0.5">
                  {f.readable && <IconButton variant="ghost" size="xs" aria-label={`Ver texto lido de ${f.name}`} title="Ver o que a IA lê" onClick={() => setReading(f)}><Eye /></IconButton>}
                  <IconButton variant="ghost" size="xs" aria-label={`Abrir ${f.name}`} title="Abrir" onClick={() => window.open(fileUrl(f.id), '_blank')}><ExternalLink /></IconButton>
                  <IconButton variant="ghost" size="xs" aria-label={`Baixar ${f.name}`} title="Baixar" onClick={() => window.open(fileUrl(f.id, true), '_blank')}><Download /></IconButton>
                  <IconButton variant="ghost" size="xs" aria-label={`Excluir ${f.name}`} title="Excluir" onClick={() => setRemoving(f)}><Trash2 /></IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {reading && <AiTextModal file={reading} onClose={() => setReading(null)} />}
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy} variant="danger" title="Excluir arquivo?" confirmLabel="Excluir arquivo"
        message={`"${removing?.name ?? ''}" será apagado do sistema. Não dá para desfazer.`} />
    </div>
  );
};
