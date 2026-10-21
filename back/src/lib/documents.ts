// PDFs de Orçamento e Ordem de Serviço (pdfkit).
// Estilo de documento comercial impresso: fundo branco, tipografia (Inter) com hierarquia por peso e tamanho,
// linhas finas em vez de caixas, tabela só com linhas horizontais. O azul da marca fica apenas no logotipo.
import { getSettings } from "./settings.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { prisma } from "../db.js";
import { brl } from "./text.js";
import { filePath } from "./files.js";

const INK = "#111827", TEXT = "#374151", MUTED = "#6b7280", RULE = "#d1d5db", BLUE = "#2563eb";
const M = 44;                       // margem
const PW = 595.28, PH = 841.89;     // A4
const W = PW - M * 2;               // largura útil
const BOTTOM = PH - 82;             // limite do conteúdo (o rodapé fica abaixo)

// ── Fontes: Inter embutida (funciona igual em qualquer servidor). Sem o arquivo, cai na Helvetica padrão do PDF. ──
const require = createRequire(import.meta.url);
const FONT_FILES: Record<string, string> = { reg: "400", med: "500", semi: "600", bold: "700" };
function loadFonts(): Record<string, string> {
  try {
    const dir = path.join(path.dirname(require.resolve("@fontsource/inter/package.json")), "files");
    const files = Object.fromEntries(Object.entries(FONT_FILES).map(([k, w]) => [k, path.join(dir, `inter-latin-${w}-normal.woff`)]));
    if (Object.values(files).every((f) => fs.existsSync(f))) return files;
  } catch { /* usa o fallback */ }
  return {};
}
const FONT_PATHS = loadFonts();
const FALLBACK: Record<string, string> = { reg: "Helvetica", med: "Helvetica", semi: "Helvetica-Bold", bold: "Helvetica-Bold" };

const ORDER_STAGE: Record<string, string> = {
  aguardando_arquivo: "Aguardando arquivo", arte: "Em criação de arte", aprovacao_arte: "Aprovação da arte", producao: "Em produção",
  acabamento: "Em acabamento", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado",
};
const QUOTE_STATUS: Record<string, string> = { rascunho: "Rascunho", enviado: "Enviado", aprovado: "Aprovado", recusado: "Recusado" };

const dateBR = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const num = (v: unknown) => Number(v ?? 0);
const qty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(4, "0");
// valor unitário com as casas que precisar (tabela fechada: R$ 0,115), mínimo 2
const unitBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 5 });
const phoneBR = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p ?? "";
};
const cnpjBR = (v?: string | null) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v ?? "";
};

interface Company { logoFile?: string | null; name: string; tagline?: string | null; document?: string | null; address?: string | null; phone?: string | null; email?: string | null; instagram?: string | null; website?: string | null }
interface DocData {
  kind: "ORÇAMENTO" | "ORDEM DE SERVIÇO"; number: number; company: Company;
  meta: [string, string][];
  customer: { name: string; company?: string | null; document?: string | null; phone?: string | null; email?: string | null; address?: string };
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  discount?: number; total: number; paid?: number;
  info?: [string, string][];          // dados à esquerda dos totais (ex.: forma de entrega)
  production?: { label: string; done: boolean; date?: string | null }[]; // OS: controle de produção (já marcado pelo histórico do pedido)
  notes?: string | null; terms?: string;
  signatures: string[];               // legendas das linhas de assinatura
  signDate?: string | null;           // data ao lado da assinatura (OS entregue); vazio = campo em branco
}

async function company(): Promise<Company> {
  return (await prisma.companyProfile.findFirst()) ?? { name: "Pixel Gráfica" };
}

// logotipo: quatro "pixels" que vão clareando (azul da marca)
function mark(doc: PDFKit.PDFDocument, x: number, y: number, s: number) {
  const g = (s - 3) / 2;
  doc.save();
  ([[0, 0, 1], [1, 0, 0.62], [0, 1, 0.62], [1, 1, 0.32]] as const).forEach(([cx, cy, o]) => {
    doc.fillColor(BLUE).opacity(o).roundedRect(x + cx * (g + 3), y + cy * (g + 3), g, g, 1.8).fill();
  });
  doc.restore();
}

function render(d: DocData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `${d.kind} ${pad(d.number)}`, Author: d.company.name, Creator: "Pixel Gráfica" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // registra as fontes (ou usa o fallback)
    const F: Record<string, string> = {};
    for (const k of Object.keys(FONT_FILES)) {
      if (FONT_PATHS[k]) { doc.registerFont(`Inter-${k}`, FONT_PATHS[k]); F[k] = `Inter-${k}`; } else F[k] = FALLBACK[k];
    }

    let y = M;
    const hOf = (text: string, width: number, font = F.reg, size = 9.5) => { doc.font(font).fontSize(size); return doc.heightOfString(text, { width }); };
    const ensure = (h: number, again?: () => void) => { if (y + h > BOTTOM) { doc.addPage(); y = M; again?.(); } };
    const line = (x1: number, y1: number, x2: number, y2: number, color = RULE, w = 0.5) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(w).strokeColor(color).stroke();
    const label = (t: string, x: number, yy: number, width: number, align: "left" | "right" = "left") =>
      doc.font(F.med).fontSize(7).fillColor(MUTED).text(t.toUpperCase(), x, yy, { width, align, characterSpacing: 0.7 });

    // ── Cabeçalho: empresa à esquerda, documento à direita ──
    // logotipo cadastrado nas configurações; sem ele, usa a marca padrão
    let tx = M + 42;
    const logoPath = d.company.logoFile ? filePath(d.company.logoFile) : null;
    let drewLogo = false;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const img = (doc as any).openImage(logoPath) as { width: number; height: number };
        const s = Math.min(42 / img.height, 120 / img.width);
        doc.image(logoPath, M, y, { width: img.width * s, height: img.height * s });
        tx = M + img.width * s + 12; drewLogo = true;
      } catch { /* imagem inválida: cai na marca padrão */ }
    }
    if (!drewLogo) mark(doc, M, y + 1, 30);
    const tw = 300;
    doc.font(F.bold).fontSize(14).fillColor(INK).text(d.company.name, tx, y, { width: tw });
    let ly = y + 19;
    const contact = [d.company.phone && `Tel. ${phoneBR(d.company.phone)}`, d.company.instagram, d.company.email, d.company.website].filter(Boolean).join("   ·   ");
    const head = [d.company.tagline, d.company.document && `CNPJ ${cnpjBR(d.company.document)}`, d.company.address, contact].filter(Boolean) as string[];
    for (const l of head) { doc.font(F.reg).fontSize(8).fillColor(MUTED).text(l, tx, ly, { width: tw }); ly += hOf(l, tw, F.reg, 8) + 1.8; }
    const rw = 170, rx = M + W - rw;
    doc.font(F.semi).fontSize(8.5).fillColor(MUTED).text(d.kind, rx, y + 2, { width: rw, align: "right", characterSpacing: 1.4 });
    doc.font(F.bold).fontSize(23).fillColor(INK).text(`Nº ${pad(d.number)}`, rx, y + 15, { width: rw, align: "right" });
    y = Math.max(ly, y + 50) + 8;
    line(M, y, M + W, y, INK, 1.3);
    y += 11;

    // ── Dados do documento: colunas sem caixa ──
    const cw = W / d.meta.length;
    d.meta.forEach(([l, v], i) => {
      const x = M + i * cw;
      label(l, x, y, cw - 8);
      doc.font(F.semi).fontSize(10.5).fillColor(INK).text(v, x, y + 11, { width: cw - 8 });
    });
    y += 36;
    line(M, y, M + W, y);
    y += 16;

    // ── Título de seção: texto em caixa-alta e filete fino ──
    const section = (title: string, minBelow = 34) => {
      ensure(24 + minBelow);
      doc.font(F.semi).fontSize(8).fillColor(INK).text(title.toUpperCase(), M, y, { characterSpacing: 1.1 });
      y += 13;
      line(M, y, M + W, y, INK, 0.6);
      y += 9;
    };
    // campos: rótulo pequeno em cima, valor embaixo, sem bordas; a altura vem do maior texto (nada fica por cima de nada)
    const fields = (cells: { label: string; value?: string | null; w: number }[], x0 = M) => {
      const vals = cells.map((c) => (c.value && String(c.value).trim()) || "—");
      const h = Math.max(...cells.map((c, i) => hOf(vals[i], c.w - 14))) + 11;
      ensure(h + 8);
      let x = x0;
      cells.forEach((c, i) => {
        label(c.label, x, y, c.w - 14);
        doc.font(F.reg).fontSize(9.5).fillColor(vals[i] === "—" ? MUTED : INK).text(vals[i], x, y + 10, { width: c.w - 14 });
        x += c.w;
      });
      y += h + 8;
    };

    // ── Cliente ──
    section("Cliente", 80);
    fields([{ label: "Nome", value: d.customer.name, w: W * 0.62 }, { label: "CPF / CNPJ", value: d.customer.document ? cnpjBR(d.customer.document) : "", w: W * 0.38 }]);
    fields([{ label: "Empresa", value: d.customer.company, w: W * 0.34 }, { label: "WhatsApp", value: phoneBR(d.customer.phone), w: W * 0.24 }, { label: "E-mail", value: d.customer.email, w: W * 0.42 }]);
    fields([{ label: "Endereço", value: d.customer.address, w: W }]);
    y += 8;

    // ── Itens: só linhas horizontais ──
    const c = { n: 26, qty: 62, unit: 82, tot: 88 };
    const dw = W - c.n - c.qty - c.unit - c.tot;
    const xs = [M, M + c.n, M + c.n + dw, M + c.n + dw + c.qty, M + c.n + dw + c.qty + c.unit];
    const itemsHeader = () => {
      line(M, y, M + W, y, INK, 0.9);
      doc.font(F.semi).fontSize(7.5).fillColor(INK);
      doc.text("Nº", xs[0], y + 7, { width: c.n - 6, characterSpacing: 0.6 });
      doc.text("DESCRIÇÃO DO PRODUTO / SERVIÇO", xs[1], y + 7, { width: dw - 10, characterSpacing: 0.6 });
      doc.text("QTD.", xs[2], y + 7, { width: c.qty, align: "right", characterSpacing: 0.6 });
      doc.text("VALOR UNIT.", xs[3], y + 7, { width: c.unit, align: "right", characterSpacing: 0.6 });
      doc.text("TOTAL", xs[4], y + 7, { width: c.tot, align: "right", characterSpacing: 0.6 });
      y += 22;
      line(M, y, M + W, y, INK, 0.6);
    };
    section("Itens", 70);
    itemsHeader();
    d.items.forEach((it, i) => {
      const h = Math.max(26, hOf(it.description, dw - 12) + 16);
      ensure(h, itemsHeader);
      doc.font(F.reg).fontSize(8.5).fillColor(MUTED).text(String(i + 1).padStart(2, "0"), xs[0], y + 9, { width: c.n - 6 });
      doc.font(F.reg).fontSize(9.5).fillColor(INK).text(it.description, xs[1], y + 8, { width: dw - 12 });
      doc.fillColor(TEXT).text(qty(it.quantity), xs[2], y + 8, { width: c.qty, align: "right" });
      doc.text(unitBR(it.unitPrice), xs[3], y + 8, { width: c.unit, align: "right" });
      doc.font(F.semi).fillColor(INK).text(brl(it.total), xs[4], y + 8, { width: c.tot, align: "right" });
      y += h;
      line(M, y, M + W, y, i === d.items.length - 1 ? INK : RULE, i === d.items.length - 1 ? 0.9 : 0.4);
    });
    y += 14;

    // ── Totais (direita) e informações (esquerda) ──
    const sub = d.items.reduce((s, i) => s + i.total, 0);
    const rows: { l: string; v: string; strong?: boolean }[] = [{ l: "Subtotal", v: brl(sub) }];
    if ((d.discount ?? 0) > 0) rows.push({ l: "Desconto", v: `- ${brl(d.discount!)}` });
    rows.push({ l: "Total", v: brl(d.total), strong: true });
    if (d.paid !== undefined) { rows.push({ l: "Já recebido", v: brl(d.paid) }); rows.push({ l: "A receber", v: brl(Math.max(0, d.total - d.paid)), strong: true }); }
    const tbw = 224, tbx = M + W - tbw;
    ensure(rows.length * 22 + 6);
    const topY = y;
    let ry = topY;
    rows.forEach((r) => {
      const rh = r.strong ? 26 : 20;
      if (r.strong) line(tbx, ry, tbx + tbw, ry, INK, 0.9);
      doc.font(r.strong ? F.bold : F.reg).fontSize(r.strong ? 11.5 : 9.5).fillColor(r.strong ? INK : TEXT);
      doc.text(r.strong ? r.l.toUpperCase() : r.l, tbx, ry + (r.strong ? 8 : 5), { width: 110, characterSpacing: r.strong ? 0.8 : 0 });
      doc.text(r.v, tbx + 100, ry + (r.strong ? 7.5 : 5), { width: tbw - 100, align: "right" });
      ry += rh;
    });
    let leftEnd = topY;
    if (d.info?.length) {
      const save = y; y = topY;
      for (const [l, v] of d.info) fields([{ label: l, value: v, w: W - tbw - 24 }]);
      leftEnd = y; y = save;
    }
    y = Math.max(ry, leftEnd) + 12;

    // ── Controle de produção (OS) ──
    if (d.production?.length) {
      const steps = d.production, sw = W / steps.length;
      const labelH = Math.max(...steps.map((s) => hOf(s.label, sw - 26, F.reg, 8.5)));
      section("Controle de produção", labelH + 30);
      ensure(labelH + 26);
      steps.forEach((s, i) => {
        const x = M + i * sw;
        doc.rect(x, y + 2, 10, 10).lineWidth(0.9).strokeColor(INK).stroke();
        if (s.done) doc.moveTo(x + 2, y + 7.2).lineTo(x + 4.4, y + 10).lineTo(x + 8.6, y + 3.6).lineWidth(1.5).strokeColor(INK).stroke(); // ✓ marcado
        doc.font(s.done ? F.semi : F.reg).fontSize(8.5).fillColor(INK).text(s.label, x + 16, y + 2.4, { width: sw - 26 });
        const dateY = y + 5 + labelH;
        if (s.done && s.date) doc.font(F.reg).fontSize(8).fillColor(TEXT).text(s.date, x + 16, dateY, { width: sw - 22 });
        else doc.font(F.reg).fontSize(7.5).fillColor(MUTED).text("____ / ____ / ____", x + 16, dateY, { width: sw - 22 });
      });
      y += labelH + 28;
    }

    // ── Observações / Condições: texto corrido, sem caixa ──
    const paragraph = (title: string, body: string, size = 9.5, color = INK) => {
      const h = hOf(body, W, F.reg, size) + 4;
      section(title, Math.min(h, 50));
      ensure(h);
      doc.font(F.reg).fontSize(size).fillColor(color).text(body, M, y, { width: W, lineGap: 1.5 });
      y += h + 12;
    };
    if (d.notes?.trim()) paragraph("Observações", d.notes.trim());
    if (d.terms) paragraph("Condições", d.terms, 8.5, MUTED);

    // ── Assinaturas ──
    ensure(80);
    y += 30;
    const half = (W - 44) / d.signatures.length;
    d.signatures.forEach((caption, i) => {
      const x = M + i * (half + 44);
      line(x, y, x + half, y, INK, 0.7);
      doc.font(F.reg).fontSize(8.5).fillColor(TEXT).text(caption, x, y + 5, { width: half, align: "center" });
    });
    doc.font(F.reg).fontSize(8.5).fillColor(d.signDate ? TEXT : MUTED).text(`Data: ${d.signDate ?? "____ / ____ / ________"}`, M, y + 28, { width: W, align: "right" });

    // ── Rodapé em todas as páginas ──
    const stamp = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const foot = [d.company.name, d.company.document && `CNPJ ${cnpjBR(d.company.document)}`, d.company.address].filter(Boolean).join("   ·   ");
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // sem isso o texto do rodapé abriria uma página nova
      line(M, PH - 64, M + W, PH - 64, RULE, 0.6);
      doc.font(F.reg).fontSize(7.5).fillColor(MUTED).text(foot, M, PH - 55, { width: W - 140, height: 24 });
      doc.text(`Página ${i + 1} de ${pages.count}`, M, PH - 55, { width: W, align: "right", lineBreak: false });
      doc.text(`Emitido em ${stamp}`, M, PH - 44, { width: W, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

const addressOf = (c: { street?: string | null; number?: string | null; district?: string | null; city?: string | null; state?: string | null; zip?: string | null }) =>
  [c.street && `${c.street}${c.number ? `, ${c.number}` : ""}`, c.district, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`, c.zip && `CEP ${String(c.zip).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`].filter(Boolean).join(" · ");

export async function quotePdf(quoteId: string): Promise<{ buffer: Buffer; fileName: string; number: number } | null> {
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { customer: true, items: { orderBy: { sortOrder: "asc" as const } } } });
  if (!q) return null;
  const [co, settings] = await Promise.all([company(), getSettings()]);
  const buffer = await render({
    kind: "ORÇAMENTO", number: q.number, company: co,
    meta: [["Data de emissão", dateBR(q.createdAt)], ["Válido até", dateBR(q.validUntil)], ["Situação", QUOTE_STATUS[q.status] ?? q.status]],
    customer: { name: q.customer.name, company: q.customer.company, document: q.customer.document, phone: q.customer.phone, email: q.customer.email, address: addressOf(q.customer) },
    items: q.items.map((i) => ({ description: i.description, quantity: num(i.quantity), unitPrice: num(i.unitPrice), total: num(i.total) })),
    discount: num(q.discount), total: num(q.total), notes: q.notes,
    terms: settings.quoteTerms || undefined,
    signatures: [`De acordo — ${q.customer.name}`, co.name],
  });
  return { buffer, fileName: `Orcamento-${pad(q.number)}-Pixel.pdf`, number: q.number };
}

export async function orderPdf(orderId: string): Promise<{ buffer: Buffer; fileName: string; number: number } | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: { orderBy: { sortOrder: "asc" as const } }, events: { orderBy: { createdAt: "asc" as const } } } });
  if (!o) return null;
  const [co, settings] = await Promise.all([company(), getSettings()]);

  // Controle de produção já marcado pelo histórico: o passo vale como feito quando o pedido já chegou à etapa seguinte,
  // e a data é a de quando isso aconteceu (primeiro registro daquela etapa ou de uma posterior).
  const flow = ["aguardando_arquivo", "arte", "aprovacao_arte", "producao", "acabamento", "pronto", "entregue"];
  const now = flow.indexOf(o.status); // cancelado = -1: nada marcado
  const production = [
    { label: "Arquivo recebido", stage: "arte" }, { label: "Arte aprovada", stage: "producao" }, { label: "Impressão", stage: "acabamento" },
    { label: "Acabamento e conferência", stage: "pronto" }, { label: "Entrega", stage: "entregue" },
  ].map(({ label, stage }) => {
    const idx = flow.indexOf(stage);
    const done = now >= idx;
    const when = done ? o.events.find((e) => flow.indexOf(e.status) >= idx) : undefined;
    return { label, done, date: when ? dateBR(when.createdAt) : null };
  });
  const buffer = await render({
    kind: "ORDEM DE SERVIÇO", number: o.number, company: co,
    meta: [["Abertura", dateBR(o.createdAt)], ["Entrega prevista", dateBR(o.dueDate)], ["Etapa atual", ORDER_STAGE[o.status] ?? o.status], ["Prioridade", o.priority === "urgente" ? "URGENTE" : "Normal"]],
    customer: { name: o.customer.name, company: o.customer.company, document: o.customer.document, phone: o.customer.phone, email: o.customer.email, address: addressOf(o.customer) },
    items: o.items.map((i) => ({ description: i.description, quantity: num(i.quantity), unitPrice: num(i.unitPrice), total: num(i.total) })),
    total: num(o.total), paid: num(o.paid), notes: o.notes, terms: settings.orderTerms || undefined, production, signDate: o.status === "entregue" ? (production[production.length - 1].date ?? (o.deliveredAt ? dateBR(o.deliveredAt) : null)) : null,
    info: [["Forma de entrega", o.deliveryType === "entrega" ? "Entrega" : "Retirada na loja"], ["Situação do pagamento", num(o.paid) >= num(o.total) && num(o.total) > 0 ? "Quitado" : num(o.paid) > 0 ? "Pago parcialmente" : "Aguardando pagamento"]],
    signatures: ["Cliente — recebi e conferi os itens acima", `Responsável — ${co.name}`],
  });
  return { buffer, fileName: `OS-${pad(o.number)}-Pixel.pdf`, number: o.number };
}
