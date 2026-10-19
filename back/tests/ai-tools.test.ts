// Ferramentas da IA contra o catálogo REAL da Pixel (valores das tabelas enviadas pela gráfica).
import "../src/env.js";
import { prisma } from "../src/db.js";
import { runTool, systemPrompt } from "../src/wa/ai.js";
import { saveAttachment } from "../src/lib/files.js";

const ok = (n: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${n}${extra ? " — " + extra : ""}`);
const PHONE = "5515977776666";
const conv = { id: "", clientPhone: PHONE, clientName: "João Teste", customerId: null as string | null };
const out: any = { text: null };
const norm = (s: unknown) => String(s).replace(/ /g, " ");

// calcula e confere o total (formato brasileiro)
async function total(produto: string, quantidade: number) {
  const r: any = await runTool("calcular_preco", { produto, quantidade }, conv, out);
  return { r, total: r.total ? norm(r.total) : null };
}
const eq = async (label: string, produto: string, qty: number, expected: string) => {
  const { r, total: t } = await total(produto, qty);
  ok(label, t === `R$ ${expected}`, t ?? `erro: ${r.erro}`);
};
const refuses = async (label: string, produto: string, qty: number, match: RegExp) => {
  const { r } = await total(produto, qty);
  ok(label, !!r.erro && match.test(r.erro), r.erro ?? `calculou ${r.total}`);
};

async function main() {
  await prisma.attachment.deleteMany({ where: { name: "politica.txt" } });
  const realConv = await prisma.wppConversation.create({ data: { clientPhone: PHONE, status: "bot" } });
  conv.id = realConv.id;

  console.log("— Impressão A3 laser (por folha, faixas 1-6 / 7-12 / 13+)");
  await eq("Offset 180g: 6 folhas × 4,50", "Impressão A3 laser — Offset 180g", 6, "27,00");
  await eq("Offset 180g: 7 folhas × 3,00", "Impressão A3 laser — Offset 180g", 7, "21,00");
  await eq("Offset 180g: 12 folhas × 3,00", "Impressão A3 laser — Offset 180g", 12, "36,00");
  await eq("Offset 180g: 13 folhas × 2,50 (\"acima de 12\")", "Impressão A3 laser — Offset 180g", 13, "32,50");
  await eq("Foto Matte só frente: 3 folhas × 6,00", "Impressão A3 laser — Foto Matte 180g (só frente)", 3, "18,00");
  await eq("Foto Matte frente e verso: 7 folhas × (5,00 + 3,00 do verso)", "Impressão A3 laser — Foto Matte 180g (frente e verso)", 7, "56,00");

  console.log("— Adesivo vinil fosco");
  await eq("Folha A4: 5 × 8,00", "Adesivo vinil fosco — folha A4", 5, "40,00");
  await eq("Folha A4: 6 × 6,00", "Adesivo vinil fosco — folha A4", 6, "36,00");
  await eq("Folha A4: 20 × 5,00", "Adesivo vinil fosco — folha A4", 20, "100,00");
  await eq("Metro quadrado: 2 × 80,00", "Adesivo vinil fosco — metro quadrado", 2, "160,00");

  console.log("— Folhetos (tabela fechada: valor TOTAL por quantidade)");
  await eq("10x15 frente e verso 1.000 = 215", "Folheto 10x15 — frente e verso", 1000, "215,00");
  await eq("10x15 frente e verso 2.500 = 295", "Folheto 10x15 — frente e verso", 2500, "295,00");
  await eq("10x15 só frente 10.000 = 565", "Folheto 10x15 — só frente", 10000, "565,00");
  await eq("7x10 frente e verso 20.000 = 585", "Folheto 7x10 — frente e verso", 20000, "585,00");
  await eq("7x10 só frente 5.000 = 265", "Folheto 7x10 — só frente", 5000, "265,00");
  await refuses("quantidade fora da tabela (2.000 de 10x15) NÃO é calculada", "Folheto 10x15 — frente e verso", 2000, /só trabalha com este produto nas quantidades: 1\.000, 2\.500, 5\.000, 10\.000/);
  await refuses("abaixo da menor quantidade (500) NÃO é calculada", "Folheto 10x15 — só frente", 500, /só trabalha com este produto nas quantidades/);
  await refuses("7x10 não vende 1.000 (só a partir de 2.000)", "Folheto 7x10 — só frente", 1000, /só trabalha com este produto nas quantidades: 2\.000/);

  console.log("— Banners e faixas (preço fechado por medida)");
  await eq("90x60 × 2 = 170", "Banner / faixa 90x60 cm", 2, "170,00");
  await eq("100x200 × 1 = 195", "Banner / faixa 100x200 cm", 1, "195,00");
  await eq("40x60 × 3 = 165", "Banner / faixa 40x60 cm", 3, "165,00");
  await refuses("\"banner\" é ambíguo: devolve as medidas em vez de chutar", "banner", 1, /Mais de um produto/);

  console.log("— Cartão de visita (tabela fechada 500 / 1.000)");
  await eq("Premium 1.000 = 210", "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", 1000, "210,00");
  await eq("Premium 500 = 185", "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", 500, "185,00");
  await eq("Comum 1.000 = 155", "Cartão de visita Comum — frente e verso 300g, verniz total na frente", 1000, "155,00");
  await eq("Comum 500 = 135", "Cartão de visita Comum — frente e verso 300g, verniz total na frente", 500, "135,00");
  await eq("Básico 1.000 = 115", "Cartão de visita Básico — somente frente 250g, verniz total", 1000, "115,00");
  await eq("Básico 500 = 105", "Cartão de visita Básico — somente frente 250g, verniz total", 500, "105,00");
  await refuses("700 cartões NÃO é calculado (só 500 ou 1.000)", "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", 700, /só trabalha com este produto nas quantidades: 500, 1\.000/);
  await eq("Adicional de cantos arredondados = 25", "Adicional: cantos arredondados (somente no cartão Premium)", 1, "25,00");

  console.log("— Camisetas em DTF (preço por peça por faixa)");
  await eq("Básica 4 × 60 = 240", "Camiseta básica em DTF — estampa frente e costa", 4, "240,00");
  await eq("Básica 5 × 54 = 270", "Camiseta básica em DTF — estampa frente e costa", 5, "270,00");
  await eq("Básica 9 × 54 = 486", "Camiseta básica em DTF — estampa frente e costa", 9, "486,00");
  await eq("Básica 10 × 49 = 490", "Camiseta básica em DTF — estampa frente e costa", 10, "490,00");
  await eq("Polo/manga longa 4 × 68 = 272", "Polo / manga longa em DTF — estampa frente e costa", 4, "272,00");
  await eq("Polo/manga longa 10 × 57 = 570", "Polo / manga longa em DTF — estampa frente e costa", 10, "570,00");

  console.log("— Conferências gerais");
  await refuses("produto inexistente não inventa preço", "plotter de recorte a laser", 1, /não encontrado/);
  let r: any = await runTool("listar_produtos", { busca: "folheto" }, conv, out);
  ok("listar folhetos: 4 produtos, todos marcados como TABELA FECHADA com prazo", r.length === 4 && r.every((p: any) => /TABELA FECHADA/.test(p.tipo_de_preco) && p.prazo === "4 a 5 dias úteis"), r.map((p: any) => p.nome).join(" | "));
  r = await runTool("listar_produtos", { busca: "camiseta" }, conv, out);
  ok("camiseta: faixas por unidade e prazo 2 a 3 dias", r.length === 2 && r[0].faixas_de_preco.length === 2 && r[0].prazo === "2 a 3 dias");
  r = await runTool("listar_produtos", { busca: "vinil" }, conv, out);
  ok("vinil: descrição cita os outros tipos sob consulta", r.some((p: any) => /Holográfico/.test(p.detalhes) && /sob consulta/.test(p.detalhes)));

  console.log("— Arquivos, orçamento, pedido");
  const att = await saveAttachment({ buffer: Buffer.from("POLITICA DE TROCA\nReimpressao gratuita em ate 7 dias se houver erro de cor nosso."), name: "politica.txt", mime: "text/plain", kind: "knowledge" });
  r = await runTool("buscar_nos_arquivos", { consulta: "reimpressão erro de cor" }, conv, out);
  ok("busca dentro dos arquivos encontra o trecho", Array.isArray(r) && r[0]?.arquivo === "politica.txt" && /7 dias/.test(r[0].trecho));
  await prisma.attachment.update({ where: { id: att.id }, data: { aiEnabled: false } });
  r = await runTool("buscar_nos_arquivos", { consulta: "reimpressão erro de cor" }, conv, out);
  ok("arquivo com IA desligada não é consultado", !Array.isArray(r) && !!r.aviso);

  r = await runTool("criar_orcamento", { itens: [
    { produto: "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", quantidade: 1000 },
    { produto: "Camiseta básica em DTF — estampa frente e costa", quantidade: 10, observacao: "azul marinho" },
  ], observacoes: "Para sexta" }, conv, out);
  ok("IA cria orçamento rascunho: 210 + 490 = 700", !!r.numero_orcamento && norm(r.total) === "R$ 700,00", `#${r.numero_orcamento} ${norm(r.total)}`);
  r = await runTool("criar_orcamento", { itens: [{ produto: "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", quantidade: 700 }] }, conv, out);
  ok("orçamento recusa quantidade fora da tabela e orienta a IA a explicar (não a transferir)", !!r.erro && /só trabalha com este produto nas quantidades/.test(r.erro) && /só chame um atendente se ele insistir/.test(r.erro), r.erro);
  const q = await prisma.quote.findFirst({ where: { customer: { phone: PHONE } }, orderBy: { createdAt: "desc" }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
  ok("orçamento vem do WhatsApp, em rascunho, com cliente criado pelo telefone", q?.source === "whatsapp" && q.status === "rascunho" && q.customer.phone === PHONE && q.items.length === 2);

  const ord = await prisma.order.create({ data: { customerId: q!.customerId, total: 700, items: { create: [{ description: "Cartão de visita Premium", quantity: 1000, unitPrice: 0.21, total: 210 }] } } });
  r = await runTool("consultar_pedido", { numero: ord.number }, conv, out);
  ok("cliente consulta o próprio pedido", r.pedidos?.[0]?.numero === ord.number && !!r.pedidos[0].situacao && norm(r.pedidos[0].falta_pagar) === "R$ 700,00", JSON.stringify(r.pedidos?.[0]));
  r = await runTool("consultar_pedido", {}, conv, out);
  ok("sem número: o número do WhatsApp identifica o cliente e traz os pedidos dele", r.pedidos?.length === 1 && r.pedidos[0].numero === ord.number && Array.isArray(r.pedidos[0].etapas));
  r = await runTool("consultar_pedido", { numero: ord.number }, { ...conv, clientPhone: "5511900000000" }, out);
  ok("outro telefone NÃO vê o pedido (privacidade)", !!r.erro);

  // ── PDF do orçamento / da OS pelo chat (aqui o WhatsApp está desconectado: o envio falha, e o sistema precisa reagir bem) ──
  const other = { ...conv, clientPhone: "5511900000000", customerId: null };
  r = await runTool("enviar_orcamento_pdf", {}, other, out);
  ok("outro telefone não recebe orçamento de ninguém (privacidade)", !!r.erro && !r.enviado);
  r = await runTool("enviar_orcamento_pdf", { numero: 999999 }, conv, out);
  ok("orçamento inexistente neste cadastro: erro com a lista dos dele", !!r.erro && /Não encontrei o orçamento/.test(r.erro));
  r = await runTool("enviar_orcamento_pdf", {}, conv, out);
  ok("identifica o orçamento do cliente pelo telefone e tenta enviar (sem WhatsApp: erro amigável)", !r.enviado && /Não consegui enviar o PDF/.test(r.erro ?? ""), JSON.stringify(r));
  ok("orçamento NÃO é marcado como enviado se o envio falhou", (await prisma.quote.findUnique({ where: { id: q!.id } }))?.status === "rascunho");
  const q2 = await prisma.quote.create({ data: { customerId: q!.customerId, status: "rascunho", source: "whatsapp", total: 115, items: { create: [{ description: "Cartão básico", quantity: 500, unitPrice: 0.23, total: 115 }] } } });
  r = await runTool("enviar_orcamento_pdf", {}, conv, out);
  ok("dois orçamentos recentes: pergunta qual (não escolhe sozinha)", Array.isArray(r.escolher) && r.escolher.length === 2, JSON.stringify(r).slice(0, 160));
  r = await runTool("enviar_orcamento_pdf", { numero: q2.number }, conv, out);
  ok("com o número, escolhe o orçamento certo", /Não consegui enviar o PDF/.test(r.erro ?? "") && !r.escolher);
  await prisma.quote.delete({ where: { id: q2.id } });
  r = await runTool("enviar_ordem_servico_pdf", {}, other, out);
  ok("outro telefone não recebe OS de ninguém", !!r.erro && !r.enviado);
  r = await runTool("enviar_ordem_servico_pdf", {}, conv, out);
  ok("identifica a OS do cliente e tenta enviar (sem WhatsApp: erro amigável)", !r.enviado && /Não consegui enviar o PDF/.test(r.erro ?? ""), JSON.stringify(r));
  r = await runTool("transferir_para_atendente", { setor: "Financeiro", motivo: "boleto" }, conv, out);
  ok("transferência sinaliza o setor", out.handoff?.sector === "Financeiro");

  console.log("— O que a IA sabe: empresa e cliente");
  await prisma.companyProfile.updateMany({ data: { address: "Rua Teste, 100 — Tatuí/SP", hours: "Seg a sex 8h às 18h" } });
  await prisma.wppConversation.update({ where: { id: realConv.id }, data: { customerId: q!.customerId } });
  const prompt = await systemPrompt({ enabled: true, provider: "gemini", apiKey: "x", model: "x", customPrompt: "" }, { ...conv, customerId: q!.customerId });
  ok("prompt traz o nome e os dados da empresa", /Pixel Gráfica Tatuí/.test(prompt) && /Rua Teste, 100/.test(prompt) && /Seg a sex 8h/.test(prompt));
  ok("prompt traz o cadastro do cliente e o pedido dele", /João Teste/.test(prompt) && new RegExp(`Pedido #${ord.number}`).test(prompt));
  ok("prompt: quantidade fora da tabela → explicar as quantidades que existem (ex.: só 500 ou 1.000), sem transferir de cara", /só trabalha com as quantidades da tabela/.test(prompt) && /só trabalhamos com 500 ou 1\.000 cartões/.test(prompt) && /Só chame uma pessoa se o cliente insistir/.test(prompt));
  ok("prompt: entende o jeito de falar (mil cartões, meio milheiro, dúzia)", /"mil cartões" = 1000/.test(prompt) && /meio milheiro/.test(prompt) && /uma dúzia/.test(prompt));
  ok("prompt: arte inclusa, sem cobrança e sem desconto por arte própria", /JÁ ESTÁ INCLUSA/.test(prompt) && /NÃO cobra pela arte/.test(prompt) && /não, justamente porque a arte já está incluída/.test(prompt) && /Não transfira só por causa de arte/.test(prompt));
  ok("prompt: preço na hora quando a quantidade existe e lista as variações (Premium/Comum/Básico)", /responda o valor NA HORA/.test(prompt) && /cartão Premium, Comum e Básico/.test(prompt));
  const prof = await prisma.companyProfile.findFirst();
  ok("dados da empresa trazem a regra da arte inclusa (a IA lê isto como dado oficial)", /inclusa/.test(prof?.artService ?? "") && /não há desconto/.test(prof?.artService ?? "") && /inclusa/.test(prompt), prof?.artService ?? "");
  const cfg = await prisma.wppBotConfig.findFirst();
  ok("orientações da IA salvas não dizem mais que arte é serviço à parte", !/serviço à parte/.test(cfg?.aiPrompt ?? ""), cfg?.aiPrompt ?? "");
  await prisma.companyProfile.updateMany({ data: { address: null, hours: null } });

  await prisma.order.delete({ where: { id: ord.id } });
  await prisma.quote.deleteMany({ where: { customerId: q!.customerId } });
  await prisma.wppConversation.delete({ where: { id: realConv.id } });
  await prisma.customer.delete({ where: { id: q!.customerId } });
  await prisma.attachment.delete({ where: { id: att.id } });
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
