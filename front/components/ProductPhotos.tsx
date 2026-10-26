import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button, IconButton, ConfirmModal, Badge, useToast } from './ui';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import type { Product } from '../types';

export const photoUrl = (id: string, thumb = true) => `/api/site/images/${id}${thumb ? '?size=thumb' : ''}`;

/** Fotos do produto: a primeira é a capa. Aparecem no site e a Pixel IA envia como exemplo no WhatsApp. */
export const ProductPhotos: React.FC<{ productId: string }> = ({ productId }) => {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const { data, loading, reload } = useLoad(() => api.get<Product>(`/products/${productId}`), [productId], { live: false });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const images = data?.images ?? [];

  const upload = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('images', f));
      await api.post(`/products/${productId}/images`, form);
      toast.success(files.length > 1 ? 'Fotos enviadas.' : 'Foto enviada.');
      reload(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const move = async (i: number, dir: -1 | 1) => {
    const ids = images.map((x) => x.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.put(`/products/${productId}/images/order`, { ids }); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await api.del(`/product-images/${removing}`); setRemoving(null); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Escolher fotos" onChange={(e) => upload(e.target.files)} />
        <Button size="sm" variant="outline" loading={busy} iconLeft={<ImagePlus size={14} />} onClick={() => input.current?.click()}>Adicionar fotos</Button>
        <span className="text-[11px] text-slate-500">JPG, PNG ou WebP, até 15 MB cada, até 20 fotos. Elas são reduzidas sozinhas para o site ficar rápido.</span>
      </div>
      {loading && !data && <p role="status" className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" />Carregando fotos…</p>}
      {data && images.length === 0 && <p className="text-xs text-slate-500 rounded-lg border border-dashed border-slate-300 p-4 text-center">Nenhuma foto ainda. Adicione ao menos uma: ela vira a capa do produto no site.</p>}
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <li key={img.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="relative aspect-square bg-slate-100">
              <img src={photoUrl(img.id)} alt={img.name} loading="lazy" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5"><Badge size="sm" color="primary">Capa</Badge></span>}
            </div>
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="flex">
                <IconButton variant="ghost" size="xs" aria-label="Mover para antes" disabled={i === 0} onClick={() => move(i, -1)}><ChevronLeft /></IconButton>
                <IconButton variant="ghost" size="xs" aria-label="Mover para depois" disabled={i === images.length - 1} onClick={() => move(i, 1)}><ChevronRight /></IconButton>
              </span>
              <IconButton variant="ghost" size="xs" aria-label={`Excluir foto ${img.name}`} onClick={() => setRemoving(img.id)}><Trash2 /></IconButton>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} variant="danger" title="Excluir foto?" confirmLabel="Excluir foto" message="A foto some do produto, do site e deixa de ser enviada pela IA." />
    </div>
  );
};
