import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, Loader2, Save, Plus, Trash2, Sparkles } from 'lucide-react';
import { PageWrapper, SectionTitle, ContentCard, PanelCard, Button, IconButton, Input, Select, Textarea, Switch, EmptyState, Alert, useToast } from '../components/ui';
import { BackBar } from '../components/BackBar';
import { ProductPhotos } from '../components/ProductPhotos';
import { api, errMsg } from '../api';
import { useLoad } from '../src/hooks/useLoad';
import { unitLabel } from '../utils/format';
import type { Product } from '../types';

const units = Object.entries(unitLabel).map(([value, label]) => ({ value, label: value === 'milheiro' ? 'milheiro (1.000 un)' : label }));
type Tier = { minQty: string; price: string };

/** Criar e editar produto (mesma tela). */
const ProductFormPage: React.FC = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(async () => ({
    product: isEditing ? await api.get<Product>(`/products/${id}`) : null,
    categories: [...new Set((await api.get<Product[]>('/products?all=1')).map((p) => p.category))],
  }), [id], { live: false });

  const [aiBusy, setAiBusy] = useState(false);
  const [f, setF] = useState({ name: '', category: 'Geral', unit: 'un', pricingMode: 'unit' as 'unit' | 'package', price: '', minQty: '1', leadTime: '', description: '', howItWorks: '', active: true, showOnSite: true, featured: false, offerPrice: '' });
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [opts, setOpts] = useState<{ name: string; price: string; kind: 'acabamento' | 'servico' }[]>([]);
  const [vsizes, setVsizes] = useState<{ name: string; surcharge: string }[]>([]);
  const [vcolors, setVcolors] = useState<{ name: string; hex: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const p = data?.product;
    if (!p) return;
    setF({ name: p.name, category: p.category, unit: p.unit, pricingMode: p.pricingMode ?? 'unit', price: String(p.price), minQty: String(p.minQty), leadTime: p.leadTime ?? '', description: p.description ?? '', howItWorks: p.howItWorks ?? '', showOnSite: p.showOnSite !== false, featured: !!p.featured, offerPrice: p.offerPrice ? String(p.offerPrice) : '', active: p.active });
    setTiers((p.priceTiers ?? []).map((t) => ({ minQty: String(t.minQty), price: String(t.price) })));
    setVsizes((p.variants?.sizes ?? []).map((z) => ({ name: z.name, surcharge: z.surcharge ? String(z.surcharge) : '' })));
    setVcolors((p.variants?.colors ?? []).map((c) => ({ name: c.name, hex: c.hex ?? '#ffffff' })));
    setOpts((p.options ?? []).map((o) => ({ name: o.name, price: String(o.price), kind: o.kind })));
  }, [data]);

  if (loading && !data) return <PageWrapper><div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div></PageWrapper>;
  if (error || !data) return <PageWrapper><ContentCard><EmptyState icon={Package} title="Não foi possível carregar o produto" description={error} action={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/produtos')}>Voltar para produtos</Button><Button onClick={() => reload()}>Tentar novamente</Button></div>} /></ContentCard></PageWrapper>;

  const pack = f.pricingMode === 'package';
  const u = unitLabel[f.unit] ?? 'unidade';
  const setTier = (i: number, k: keyof Tier, v: string) => setTiers((ts) => ts.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));

  const aiFill = async () => {
    if (aiBusy) return;
    if (!f.name.trim()) { setFormError('Informe o nome do produto para a IA analisar.'); return; }
    setAiBusy(true); setFormError('');
    try {
      const parsed = tiers.map((t) => ({ minQty: Number(t.minQty), price: Number(String(t.price).replace(',', '.')) })).filter((t) => t.minQty > 0 && Number.isFinite(t.price));
      const options = opts.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), price: Number(String(o.price).replace(',', '.')) || 0, kind: o.kind }));
      const r = await api.post<{ description: string | null; howItWorks: string | null }>('/products/ai-fill', { ...f, variants: { sizes: vsizes.filter((z) => z.name.trim()).map((z) => ({ name: z.name.trim(), surcharge: Number(String(z.surcharge).replace(',', '.')) || 0 })), colors: vcolors.filter((c) => c.name.trim()) }, price: Number(String(f.price).replace(',', '.')) || 0, minQty: Number(f.minQty) || 1, priceTiers: parsed, options });
      setF((x) => ({ ...x, description: r.description ?? x.description, howItWorks: r.howItWorks ?? x.howItWorks }));
      toast.success('Textos preenchidos pela IA. Revise e salve.');
    } catch (e) { setFormError(errMsg(e)); }
    finally { setAiBusy(false); }
  };

  const save = async () => {
    if (saving) return;
    if (!f.name.trim()) { setFormError('Informe o nome do produto.'); return; }
    const parsed = tiers.map((t) => ({ minQty: Number(t.minQty), price: Number(String(t.price).replace(',', '.')) }));
    if (parsed.some((t) => !(t.minQty > 0) || !Number.isFinite(t.price) || t.price < 0)) { setFormError('Confira as faixas: quantidade e valor precisam ser números válidos.'); return; }
    if (new Set(parsed.map((t) => t.minQty)).size !== parsed.length) { setFormError('Há duas faixas com a mesma quantidade.'); return; }
    let price = Number(String(f.price).replace(',', '.'));
    let minQty = Number(f.minQty) || 1;
    if (pack) {
      if (!parsed.length) { setFormError('Tabela fechada: cadastre ao menos uma quantidade com o valor total.'); return; }
      const first = [...parsed].sort((a, b) => a.minQty - b.minQty)[0];
      price = first.price; minQty = first.minQty; // "a partir de" = menor pacote
    } else if (!Number.isFinite(price) || price < 0) { setFormError('Preço inválido.'); return; }
    const offer = Number(String(f.offerPrice).replace(',', '.')) || 0;
    if (!pack && offer > 0 && offer >= price) { setFormError('O preço de oferta precisa ser menor que o preço normal.'); return; }
    setSaving(true); setFormError('');
    try {
      const options = opts.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), price: Number(String(o.price).replace(',', '.')) || 0, kind: o.kind }));
      const variants = { sizes: vsizes.filter((z) => z.name.trim()).map((z) => ({ name: z.name.trim(), surcharge: Number(String(z.surcharge).replace(',', '.')) || 0 })), colors: vcolors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex })) };
      const body = { ...f, price, minQty, priceTiers: parsed, offerPrice: pack ? 0 : offer, options, variants };
      const saved = isEditing ? await api.put<Product>(`/products/${id}`, body) : await api.post<Product>('/products', body);
      toast.success(isEditing ? 'Produto atualizado.' : 'Produto cadastrado.');
      navigate(isEditing ? `/produtos/${saved.id}` : `/produtos/${saved.id}/editar`); // produto novo: já abre a edição para adicionar as fotos
    } catch (e) { setFormError(errMsg(e)); setSaving(false); }
  };

  return (
    <PageWrapper>
      <div className="space-y-4">
        <BackBar to={isEditing ? `/produtos/${id}` : '/produtos'} label={isEditing ? 'Voltar para o produto' : 'Voltar para produtos'} />
        <SectionTitle title={isEditing ? 'Editar produto' : 'Novo produto'} icon={Package} description="O que você escrever aqui é o que a Pixel IA informa ao cliente no WhatsApp." />

        <PanelCard title="Informações">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome" value={f.name} onChange={(e) => set('name', e.target.value)} wrapperClassName="sm:col-span-2" autoFocus={!isEditing} />
            <Input label="Categoria" value={f.category} onChange={(e) => set('category', e.target.value)} list="product-categories" />
            <datalist id="product-categories">{data.categories.map((c) => <option key={c} value={c} />)}</datalist>
            <Select label="Cobrado por" value={f.unit} onChange={(e) => set('unit', e.target.value)} options={units} />
            <Input label="Prazo de produção" value={f.leadTime} onChange={(e) => set('leadTime', e.target.value)} placeholder="Ex.: 2 a 3 dias úteis" hint="Texto livre. Vazio = a consultar com a equipe." />
            <div className="flex items-end pb-1.5 gap-2 text-xs text-slate-600"><Switch checked={f.active} onCheckedChange={(v) => set('active', v)} aria-label="Produto ativo" />{f.active ? 'Ativo' : 'Inativo (some do orçamento e da IA)'}</div>
          </div>
        </PanelCard>

        <PanelCard title="Preço">
          <div className="space-y-3">
            <Select label="Como o preço funciona" value={f.pricingMode} onChange={(e) => set('pricingMode', e.target.value as 'unit' | 'package')}
              options={[{ value: 'unit', label: `Por ${u}, com desconto por quantidade (ex.: camiseta: 1+ R$ 60, 10+ R$ 49)` }, { value: 'package', label: 'Tabela fechada: valor total por quantidade (ex.: 1.000 folhetos = R$ 215)' }]} />
            {pack
              ? <Alert variant="info" title="Tabela fechada">Só existem preços para as quantidades cadastradas abaixo. Qualquer outra quantidade é “sob consulta”: o orçamento e a IA não calculam, e o cliente é passado para uma pessoa.</Alert>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label={`Preço por ${u} (R$)`} inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} hint="Vale até a primeira faixa abaixo." />
                  <Input label="Quantidade mínima" type="number" min={1} value={f.minQty} onChange={(e) => set('minQty', e.target.value)} />
                </div>
              )}
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div><h4 className="text-xs font-semibold text-slate-800">{pack ? 'Quantidades e valores' : 'Faixas de preço por quantidade'}</h4>
                  <p className="text-[11px] text-slate-500">{pack ? 'Cada linha: a quantidade exata e o valor TOTAL cobrado por ela.' : `Quanto maior a quantidade, menor o preço de cada ${u}.`}</p></div>
                <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} onClick={() => setTiers((ts) => [...ts, { minQty: '', price: '' }])}>{pack ? 'Quantidade' : 'Faixa'}</Button>
              </div>
              {tiers.length === 0 && <p className="text-[11px] text-slate-400">{pack ? 'Nenhuma quantidade ainda.' : 'Sem faixas: o mesmo preço para qualquer quantidade.'}</p>}
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <Input label={pack ? 'Quantidade' : 'A partir de (qtd.)'} type="number" min={1} step="any" value={t.minQty} onChange={(e) => setTier(i, 'minQty', e.target.value)} />
                  <Input label={pack ? 'Valor total (R$)' : `Preço por ${u} (R$)`} inputMode="decimal" value={t.price} onChange={(e) => setTier(i, 'price', e.target.value)} />
                  <IconButton variant="ghost" size="md" aria-label="Remover linha" onClick={() => setTiers((ts) => ts.filter((_, idx) => idx !== i))}><Trash2 /></IconButton>
                </div>
              ))}
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Opcionais com preço" description="Acabamentos e serviços que o cliente marca no site (ex.: corte especial R$ 30,00, checagem profissional R$ 16,99). Cada um entra como uma linha no orçamento.">
          <div className="space-y-2">
            {opts.length === 0 && <p className="text-[11px] text-slate-400">Nenhum opcional. Este produto é vendido só com o preço acima.</p>}
            {opts.map((o, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_9rem_auto] gap-2 items-end">
                <Input label="Nome" value={o.name} onChange={(e) => setOpts((x) => x.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} placeholder="Ex.: Corte especial (+3 dias)" />
                <Input label="Valor (R$)" inputMode="decimal" value={o.price} onChange={(e) => setOpts((x) => x.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))} />
                <Select label="Tipo" value={o.kind} onChange={(e) => setOpts((x) => x.map((r, j) => (j === i ? { ...r, kind: e.target.value as 'acabamento' | 'servico' } : r)))} options={[{ value: 'acabamento', label: 'Acabamento' }, { value: 'servico', label: 'Serviço' }]} />
                <IconButton variant="ghost" size="md" aria-label="Remover opcional" onClick={() => setOpts((x) => x.filter((_, j) => j !== i))}><Trash2 /></IconButton>
              </div>
            ))}
            <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} onClick={() => setOpts((x) => [...x, { name: '', price: '', kind: 'acabamento' }])}>Opcional</Button>
          </div>
        </PanelCard>

        <PanelCard title="Tamanhos e cores (roupas)" description="Para camisetas e similares: o cliente escolhe quantas peças de cada tamanho e a cor. A faixa de preço (acima) vale pelo TOTAL de peças; o acréscimo de um tamanho é cobrado por peça desse tamanho. Deixe vazio para produtos sem variações.">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Tamanhos</p>
              {vsizes.length === 0 && <p className="text-[11px] text-slate-400">Nenhum tamanho: o produto é vendido só por quantidade.</p>}
              {vsizes.map((z, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2 items-end">
                  <Input label={i === 0 ? 'Tamanho' : undefined} aria-label="Tamanho" value={z.name} onChange={(e) => setVsizes((x) => x.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} placeholder="Ex.: M" />
                  <Input label={i === 0 ? 'Acréscimo por peça (R$)' : undefined} aria-label="Acréscimo por peça" inputMode="decimal" value={z.surcharge} onChange={(e) => setVsizes((x) => x.map((r, j) => (j === i ? { ...r, surcharge: e.target.value } : r)))} placeholder="0" />
                  <IconButton variant="ghost" size="md" aria-label="Remover tamanho" onClick={() => setVsizes((x) => x.filter((_, j) => j !== i))}><Trash2 /></IconButton>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} onClick={() => setVsizes((x) => [...x, { name: '', surcharge: '' }])}>Tamanho</Button>
                {vsizes.length === 0 && <Button variant="ghost" size="xs" onClick={() => setVsizes(['P', 'M', 'G', 'GG'].map((name) => ({ name, surcharge: '' })))}>Usar P, M, G, GG</Button>}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Cores disponíveis</p>
              {vcolors.length === 0 && <p className="text-[11px] text-slate-400">Nenhuma cor: o cliente não escolhe cor.</p>}
              {vcolors.map((c, i) => (
                <div key={i} className="grid grid-cols-[2.5rem_1fr_auto] gap-2 items-end">
                  <input type="color" aria-label="Cor" value={c.hex} onChange={(e) => setVcolors((x) => x.map((r, j) => (j === i ? { ...r, hex: e.target.value } : r)))} className="h-9 w-10 rounded-md border border-slate-300 bg-white p-0.5 cursor-pointer" />
                  <Input aria-label="Nome da cor" value={c.name} onChange={(e) => setVcolors((x) => x.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} placeholder="Ex.: Azul marinho" />
                  <IconButton variant="ghost" size="md" aria-label="Remover cor" onClick={() => setVcolors((x) => x.filter((_, j) => j !== i))}><Trash2 /></IconButton>
                </div>
              ))}
              <Button variant="outline" size="xs" iconLeft={<Plus size={12} />} onClick={() => setVcolors((x) => [...x, { name: '', hex: '#1e3a8a' }])}>Cor</Button>
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Fotos" description="Aparecem no site e a Pixel IA envia como exemplo quando o cliente pede para ver o produto.">
          {isEditing ? <ProductPhotos productId={id!} /> : <p className="text-xs text-slate-500">Cadastre o produto primeiro: logo depois do cadastro esta tela reabre para você adicionar as fotos.</p>}
        </PanelCard>

        <PanelCard title="No site" description="Como este produto aparece no site público da gráfica.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700"><Switch checked={f.showOnSite} onCheckedChange={(v) => set('showOnSite', v)} aria-label="Mostrar no site" />Mostrar no site</label>
            <label className="flex items-center gap-2 text-xs text-slate-700"><Switch checked={f.featured} onCheckedChange={(v) => set('featured', v)} aria-label="Destaque" />Destaque na página inicial</label>
            {!pack && <Input label={`Preço de oferta por ${u} (R$)`} inputMode="decimal" value={f.offerPrice} onChange={(e) => set('offerPrice', e.target.value)} placeholder="Vazio = sem oferta" hint="Aparece em “Ofertas” e vale no site, no orçamento e para a IA." wrapperClassName="sm:col-span-2" />}
          </div>
        </PanelCard>

        <PanelCard title="Textos para o cliente e para a IA" description="A IA lê o nome, os preços e os opcionais acima e escreve os dois textos. Você revisa antes de salvar." action={<Button variant="outline" size="sm" onClick={aiFill} disabled={aiBusy}>{aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{aiBusy ? 'Analisando…' : 'Preencher com a IA'}</Button>}>
          <div className="grid gap-3">
            <Textarea label="Descrição (formatos, papéis, acabamentos, valores)" value={f.description} onChange={(e) => set('description', e.target.value)} rows={5} />
            <Textarea label="Como funciona (arte, processo, cuidados)" value={f.howItWorks} onChange={(e) => set('howItWorks', e.target.value)} rows={4} hint="Ex.: como enviar a arte, o que está incluso, o que é cobrado à parte." />
          </div>
        </PanelCard>

        {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => navigate(isEditing ? `/produtos/${id}` : '/produtos')}>Cancelar</Button>
          <Button size="sm" loading={saving} iconLeft={<Save size={14} />} onClick={save}>{isEditing ? 'Salvar' : 'Cadastrar'}</Button>
        </div>
      </div>
    </PageWrapper>
  );
};

export default ProductFormPage;
