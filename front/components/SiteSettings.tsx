import React, { useRef, useState } from 'react';
import { Globe, ImagePlus, Pencil, Plus, Trash2, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { PanelCard, Button, IconButton, Input, Textarea, Switch, Modal, ModalFooter, ConfirmModal, Badge, EmptyState, Alert, useToast } from './ui';
import { FilesPanel } from './FilesPanel';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { useCompany, resetCompanyCache } from '../src/hooks/useCompany';

export const SITE_PATH = '/pagina-teste-site';
interface Banner { id: string; title: string; subtitle?: string | null; buttonText?: string | null; buttonUrl?: string | null; active: boolean; hasImage: boolean }
const bannerImg = (b: Banner, v = '') => `/api/site/banner/${b.id}${v ? `?v=${v}` : ''}`;

const BannerModal: React.FC<{ banner: Banner | null; onClose: () => void; onSaved: () => void }> = ({ banner, onClose, onSaved }) => {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ title: banner?.title ?? '', subtitle: banner?.subtitle ?? '', buttonText: banner?.buttonText ?? '', buttonUrl: banner?.buttonUrl ?? '', active: banner?.active ?? true });
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preview = file ? URL.createObjectURL(file) : banner?.hasImage && !removeImage ? bannerImg(banner, String(Date.now())) : null;

  const save = async () => {
    if (saving) return;
    if (!f.title.trim()) { setError('Informe o título do banner.'); return; }
    setSaving(true); setError('');
    try {
      const form = new FormData();
      Object.entries(f).forEach(([k, v]) => form.append(k, String(v)));
      if (file) form.append('image', file);
      if (removeImage && !file) form.append('removeImage', 'true');
      if (banner) await api.put(`/site-admin/banners/${banner.id}`, form); else await api.post('/site-admin/banners', form);
      toast.success('Banner salvo.'); onSaved();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" title={banner ? 'Editar banner' : 'Novo banner'}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" loading={saving} onClick={save}>Salvar</Button></ModalFooter>}>
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden">
          {preview ? <img src={preview} alt="Prévia do banner" className="w-full max-h-48 object-cover" /> : <p className="text-xs text-slate-400 text-center py-10">Sem imagem: o banner usa o fundo colorido padrão.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Escolher imagem do banner" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRemoveImage(false); }} />
          <Button size="sm" variant="outline" iconLeft={<ImagePlus size={14} />} onClick={() => input.current?.click()}>{preview ? 'Trocar imagem' : 'Escolher imagem'}</Button>
          {preview && <Button size="sm" variant="ghost" onClick={() => { setFile(null); setRemoveImage(true); }}>Remover imagem</Button>}
          <span className="text-[11px] text-slate-500 self-center">Ideal: 1920 × 700 px, horizontal. Deixe o texto longe das bordas.</span>
        </div>
        <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Cartões de visita a partir de R$ 43,90" autoFocus />
        <Input label="Texto de apoio" value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="Ex.: Entrega rápida e acabamento premium" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Texto do botão" value={f.buttonText} onChange={(e) => setF({ ...f, buttonText: e.target.value })} placeholder="Ex.: Ver ofertas" />
          <Input label="Para onde o botão leva" value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} placeholder="#ofertas, #catalogo ou um link" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} aria-label="Banner ativo" />Banner ativo (aparece no site)</label>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

/** Aba "Site" das configurações: banners do carrossel, texto "Sobre nós" e catálogos em PDF. */
export const SiteSettings: React.FC = () => {
  const toast = useToast();
  const company = useCompany();
  const { data, loading, reload } = useLoad(() => api.get<Banner[]>('/site-admin/banners'), [], { live: false });
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [removing, setRemoving] = useState<Banner | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [savingAbout, setSavingAbout] = useState(false);
  const aboutValue = about ?? (company as { aboutText?: string | null } | null)?.aboutText ?? '';

  const move = async (i: number, dir: -1 | 1) => {
    const ids = (data ?? []).map((b) => b.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.put('/site-admin/banners/order', { ids }); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };
  const toggle = async (b: Banner, active: boolean) => {
    try { const form = new FormData(); form.append('title', b.title); form.append('active', String(active)); if (b.subtitle) form.append('subtitle', b.subtitle); if (b.buttonText) form.append('buttonText', b.buttonText); if (b.buttonUrl) form.append('buttonUrl', b.buttonUrl); await api.put(`/site-admin/banners/${b.id}`, form); reload(true); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await api.del(`/site-admin/banners/${removing.id}`); setRemoving(null); reload(true); toast.success('Banner excluído.'); } catch (e) { toast.error(errMsg(e)); }
  };
  const saveAbout = async () => {
    if (about === null || savingAbout) return;
    setSavingAbout(true);
    try { await api.put('/company', { aboutText: about }); resetCompanyCache(); setAbout(null); toast.success('Texto salvo.'); } catch (e) { toast.error(errMsg(e)); } finally { setSavingAbout(false); }
  };

  return (
    <div className="space-y-3">
      <Alert variant="info" title="Site da gráfica">
        O site fica em <b>{window.location.origin}{SITE_PATH}</b>. Ele usa os produtos (com fotos, ofertas e destaques), os dados da empresa e os banners daqui. Os pedidos de orçamento feitos no site chegam no painel como rascunho.
        <span className="block mt-2"><Button size="xs" variant="outline" iconLeft={<ExternalLink size={12} />} onClick={() => window.open(SITE_PATH, '_blank')}>Abrir o site</Button></span>
      </Alert>

      <PanelCard title="Banners do carrossel" icon={Globe} description="Os banners passam sozinhos no topo do site, na ordem abaixo."
        action={<Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setEditing('new')}>Novo banner</Button>}>
        {loading && !data && <p role="status" className="text-xs text-slate-500">Carregando…</p>}
        {data && data.length === 0 && <EmptyState icon={ImagePlus} title="Nenhum banner" description="Sem banners, o site mostra uma faixa de boas-vindas padrão. Crie o primeiro para personalizar." />}
        <ul className="space-y-2">
          {(data ?? []).map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="h-14 w-28 shrink-0 rounded-md bg-gradient-to-r from-blue-600 to-blue-400 overflow-hidden">{b.hasImage && <img src={bannerImg(b)} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-800 truncate">{b.title}</p>
                <p className="text-[11px] text-slate-500 truncate">{b.subtitle || 'Sem texto de apoio'}{b.buttonText ? ` · botão “${b.buttonText}”` : ''}</p>
              </div>
              {!b.active && <Badge size="sm">Inativo</Badge>}
              <Switch size="sm" checked={b.active} onCheckedChange={(v) => toggle(b, v)} aria-label={`Banner ${b.title} ativo`} />
              <div className="flex">
                <IconButton variant="ghost" size="xs" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp /></IconButton>
                <IconButton variant="ghost" size="xs" aria-label="Descer" disabled={i === (data?.length ?? 0) - 1} onClick={() => move(i, 1)}><ChevronDown /></IconButton>
                <IconButton variant="ghost" size="xs" aria-label={`Editar ${b.title}`} onClick={() => setEditing(b)}><Pencil /></IconButton>
                <IconButton variant="ghost" size="xs" aria-label={`Excluir ${b.title}`} onClick={() => setRemoving(b)}><Trash2 /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title="Sobre a gráfica" description="Texto da seção “Sobre nós” do site (sua história, diferenciais).">
        <div className="space-y-2">
          <Textarea aria-label="Texto Sobre nós" rows={5} value={aboutValue} onChange={(e) => setAbout(e.target.value)} placeholder="Somos a Pixel Gráfica, de Tatuí. Há anos cuidamos de cada impressão como se fosse a nossa…" />
          <div className="flex justify-end"><Button size="sm" loading={savingAbout} disabled={about === null} onClick={saveAbout}>Salvar texto</Button></div>
        </div>
      </PanelCard>

      <PanelCard title="Catálogos e modelos (PDF)" description="Arquivos que o cliente baixa na seção “Catálogos” do site.">
        <FilesPanel kind="catalog" aiToggle={false} emptyHint="Envie catálogos, tabelas de modelos ou materiais em PDF." />
      </PanelCard>

      {editing && <BannerModal banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(true); }} />}
      <ConfirmModal isOpen={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} variant="danger" title="Excluir banner?" confirmLabel="Excluir banner" message={`“${removing?.title ?? ''}” sai do carrossel do site.`} />
    </div>
  );
};
