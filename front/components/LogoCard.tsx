import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { PanelCard, Button, useToast } from './ui';
import { api, errMsg } from '../api';
import { useBrand, refreshBrand, logoSrc } from '../src/hooks/useBrand';
import { resetCompanyCache } from '../src/hooks/useCompany';

/** Logotipo da empresa: aparece no login, no menu e nos PDFs de orçamento e ordem de serviço. */
export const LogoCard: React.FC = () => {
  const toast = useToast();
  const brand = useBrand();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const done = async (msg: string) => { resetCompanyCache(); await refreshBrand(); toast.success(msg); };
  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('A imagem passa de 3 MB.'); return; }
    setBusy(true);
    try { const form = new FormData(); form.append('logo', file); await api.post('/company/logo', form); await done('Logotipo atualizado.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.del('/company/logo'); await done('Logotipo removido.'); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <PanelCard title="Logotipo" description="Aparece na tela de login, no menu e nos PDFs de orçamento e ordem de serviço" icon={ImagePlus}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-20 w-40 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
          {brand?.hasLogo ? <img src={logoSrc(brand)} alt="Logotipo atual" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-slate-400">Sem logotipo</span>}
        </div>
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" aria-label="Escolher logotipo" onChange={(e) => upload(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={busy} iconLeft={<ImagePlus size={14} />} onClick={() => input.current?.click()}>{brand?.hasLogo ? 'Trocar logotipo' : 'Enviar logotipo'}</Button>
            {brand?.hasLogo && <Button size="sm" variant="outline" iconLeft={<Trash2 size={14} />} onClick={remove}>Remover</Button>}
          </div>
          <p className="text-[11px] text-slate-500">PNG ou JPG, até 3 MB. Prefira fundo transparente e imagem horizontal.</p>
        </div>
      </div>
    </PanelCard>
  );
};
