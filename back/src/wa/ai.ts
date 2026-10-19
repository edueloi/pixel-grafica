// Pixel IA: Gemini OU ChatGPT (OpenAI), conforme a chave que a gráfica cadastrar no painel.
// Consulta produtos e preços, LÊ OS ARQUIVOS do sistema, acompanha pedidos, cria rascunho de orçamento e transfere para um atendente.
import { GoogleGenAI, type ToolUnion } from "@google/genai";
import type { Product } from "@prisma/client";
import { prisma } from "../db.js";
import { decryptSecret } from "../lib/secrets.js";
import { strip, samePhone, brl, normalizePhone } from "../lib/text.js";
import { findCustomerByPhone } from "./conversations.js";
import { parseTiers, quotePrice } from "../lib/pricing.js";

export type Provider = "gemini" | "openai";

// Modelos sugeridos no painel (o cliente também pode digitar outro). O primeiro de cada lista é o padrão.
export const MODEL_PRESETS: Record<Provider, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (rápido e econômico) — padrão" },
    { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (mais barato)" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (mais capaz)" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (antigo; pode não estar disponível)" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini (rápido e econômico) — padrão" },
    { value: "gpt-4o", label: "GPT-4o (mais capaz)" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
  ],
};
export const DEFAULT_MODEL: Record<Provider, string> = { gemini: MODEL_PRESETS.gemini[0].value, openai: MODEL_PRESETS.openai[0].value };

const CACHE_MS = 30_000;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  aguardando_arquivo: "Aguardando arquivo do cliente", arte: "Em criação de arte", aprovacao_arte: "Arte aguardando aprovação",
  producao: "Em produção", acabamento: "Em acabamento", pronto: "Pronto para retirada/entrega", entregue: "Entregue", cancelado: "Cancelado",
};

interface Settings { enabled: boolean; provider: Provider; apiKey: string | null; model: string; customPrompt: string }
let cached: { at: number; value: Settings } | null = null;
export const resetAiConfigCache = () => { cached = null; };

async function loadSettings(force = false): Promise<Settings> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const c = await prisma.wppBotConfig.findFirst();
  const provider: Provider = c?.aiProvider === "openai" ? "openai" : "gemini";
  const apiKey = provider === "openai"
    ? decryptSecret(c?.openaiApiKeyEncrypted, "openai-api-key") || process.env.OPENAI_API_KEY?.trim() || null
    : decryptSecret(c?.geminiApiKeyEncrypted, "gemini-api-key") || process.env.GEMINI_API_KEY?.trim() || null;
  const model = (provider === "openai" ? c?.openaiModel : c?.geminiModel)?.trim() || DEFAULT_MODEL[provider];
  const value = { enabled: c?.aiEnabled === true, provider, apiKey, model, customPrompt: c?.aiPrompt?.trim().slice(0, 4000) || "" };
  cached = { at: Date.now(), value };
  return value;
}

const safeError = (e: unknown) =>
  String(e instanceof Error ? e.message : e || "Falha ao conectar com a IA.")
    .replace(/AIza[\w-]{20,}/g, "[chave protegida]").replace(/sk-[\w-]{16,}/g, "[chave protegida]")
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[chave protegida]").replace(/Bearer\s+\S+/gi, "Bearer [chave protegida]").slice(0, 400);

export interface AiConversation { id: string; clientPhone: string; clientName?: string | null; customerId?: string | null }
export interface AiResult { text: string | null; handoff?: { sector: string; reason: string } }

// ── Ferramentas (definição neutra, convertida para cada provedor) ────────────
interface ToolDef { name: string; description: string; parameters: Record<string, any> }

const toolDefs: ToolDef[] = [
  {
    name: "listar_produtos",
    description: "Lista os produtos e serviços da gráfica com descrição, como funciona, unidade, faixas de preço por quantidade e prazo. Use para qualquer pergunta sobre o que a gráfica faz, como funciona um produto ou quanto custa.",
    parameters: { type: "object", properties: { busca: { type: "string", description: "Palavra do produto (ex.: cartão, banner). Vazio lista tudo." } } },
  },
  {
    name: "calcular_preco",
    description: "Calcula o preço de um produto aplicando a faixa de quantidade. A quantidade é SEMPRE na unidade do produto: para 'milheiro' use 0.5 para 500 unidades e 2 para 2000; para 'm2' use os metros quadrados; para 'unidade' o número de unidades.",
    parameters: { type: "object", properties: { produto: { type: "string", description: "Nome (ou parte) do produto" }, quantidade: { type: "number", description: "Quantidade na unidade do produto" } }, required: ["produto", "quantidade"] },
  },
  {
    name: "buscar_nos_arquivos",
    description: "Procura no texto dos arquivos do sistema (tabelas de preço, catálogos, regulamentos, arquivos do próprio cliente) uma informação. Use quando a resposta não estiver nos produtos.",
    parameters: { type: "object", properties: { consulta: { type: "string", description: "O que procurar" } }, required: ["consulta"] },
  },
  {
    name: "consultar_pedido",
    description: "Consulta o andamento dos pedidos (ordens de serviço) do cliente: etapa atual, histórico das etapas com datas, itens, previsão de entrega e quanto já foi pago. Sem número, traz os pedidos mais recentes do próprio cliente (identificado pelo WhatsApp). Só mostra pedidos do cliente que está conversando.",
    parameters: { type: "object", properties: { numero: { type: "number", description: "Número do pedido, se o cliente disse" } } },
  },
  {
    name: "enviar_ordem_servico_pdf",
    description: "Envia ao cliente, aqui no WhatsApp, o PDF da ordem de serviço de um pedido dele (com o controle de produção e as datas). Use quando ele pedir a OS, o comprovante do pedido ou o documento do pedido. Sem número, envia a mais recente em andamento.",
    parameters: { type: "object", properties: { numero: { type: "number", description: "Número do pedido, se o cliente disse" } } },
  },
  {
    name: "criar_orcamento",
    description: "Registra um orçamento em rascunho para a equipe revisar e enviar. Use depois que o cliente confirmar produtos e quantidades.",
    parameters: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: { produto: { type: "string" }, quantidade: { type: "number", description: "Na unidade do produto" }, observacao: { type: "string", description: "Formato, papel, acabamento…" } },
            required: ["produto", "quantidade"],
          },
        },
        observacoes: { type: "string", description: "Prazo desejado, entrega, detalhes gerais" },
      },
      required: ["itens"],
    },
  },
  {
    name: "enviar_orcamento_pdf",
    description: "Envia ao cliente, aqui no WhatsApp, o PDF de um orçamento dele que já está registrado. Use quando o cliente pedir o orçamento, o PDF, a proposta ou \"manda de novo\". Sem número, envia o mais recente; se houver mais de um em aberto, a ferramenta devolve a lista para você perguntar qual. Só envia orçamentos do próprio cliente.",
    parameters: { type: "object", properties: { numero: { type: "number", description: "Número do orçamento, se o cliente disse" } } },
  },
  {
    name: "transferir_para_atendente",
    description: "Encaminha a conversa para uma pessoa da equipe. Use quando o cliente pedir um humano, para negociação, arte/criação, problema no pedido ou quando você não souber responder.",
    parameters: { type: "object", properties: { setor: { type: "string", description: "Nome do setor" }, motivo: { type: "string", description: "Resumo curto do que o cliente precisa" } }, required: ["setor", "motivo"] },
  },
];

// O Gemini usa os tipos em maiúsculas (OBJECT, STRING…)
const toGeminiSchema = (s: any): any =>
  Array.isArray(s) ? s.map(toGeminiSchema)
    : s && typeof s === "object" ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === "type" && typeof v === "string" ? v.toUpperCase() : toGeminiSchema(v)]))
      : s;
const geminiTools: ToolUnion[] = [{ functionDeclarations: toolDefs.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }];
const openaiTools = toolDefs.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));

const unitName: Record<string, string> = { un: "unidade", milheiro: "milheiro (1000 un)", m2: "m²", folha: "folha" };

type Found = { product: Product } | { error: string };

// Nome exato → esse produto. Termo que casa com vários → devolve os candidatos para a IA perguntar ao cliente (nunca chuta preço).
async function findProduct(name: string): Promise<Found> {
  const s = strip(name);
  const all = await prisma.product.findMany({ where: { active: true } });
  const exact = all.find((p) => strip(p.name) === s);
  if (exact) return { product: exact };
  const words = s.split(/\s+/).filter((w) => w.length > 2);
  const hits = all.filter((p) => strip(p.name).includes(s) || s.includes(strip(p.name)) || (words.length > 0 && words.every((w) => strip(`${p.name} ${p.category}`).includes(w))));
  if (hits.length === 1) return { product: hits[0] };
  if (hits.length > 1) return { error: `Mais de um produto combina com "${name}": ${hits.slice(0, 8).map((p) => p.name).join("; ")}. Pergunte ao cliente qual deles e use o nome completo.` };
  return { error: "Produto não encontrado. Use listar_produtos." };
}

async function searchFiles(conv: AiConversation, query: string) {
  const words = strip(query).split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const files = await prisma.attachment.findMany({
    where: { aiEnabled: true, extractedText: { not: null }, OR: [{ kind: "knowledge" }, ...(conv.customerId ? [{ customerId: conv.customerId }] : [])] },
    select: { name: true, extractedText: true }, take: 200,
  });
  return files.map((f) => {
    const text = f.extractedText!; const flat = strip(text);
    const score = words.reduce((n, w) => n + (flat.split(w).length - 1), 0);
    const at = Math.max(0, flat.indexOf(words.find((w) => flat.includes(w)) ?? ""));
    return { arquivo: f.name, score, trecho: text.slice(Math.max(0, at - 200), at + 700) };
  }).filter((f) => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(({ arquivo, trecho }) => ({ arquivo, trecho }));
}

export async function runTool(name: string, args: any, conv: AiConversation, out: AiResult): Promise<unknown> {
  switch (name) {
    case "listar_produtos": {
      const q = String(args?.busca || "").trim();
      const list = await prisma.product.findMany({
        where: { active: true, ...(q ? { OR: [{ name: { contains: q } }, { category: { contains: q } }, { description: { contains: q } }] } : {}) },
        take: 15, orderBy: { category: "asc" },
      });
      return list.length
        ? list.map((p) => ({
            nome: p.name, categoria: p.category, detalhes: p.description, como_funciona: p.howItWorks,
            unidade: unitName[p.unit] ?? p.unit, prazo: p.leadTime ?? "a consultar com a equipe",
            ...(p.pricingMode === "package"
              ? { tipo_de_preco: "TABELA FECHADA: só existe preço para estas quantidades exatas (valor TOTAL do pacote). Outras quantidades são sob consulta.", precos_por_quantidade: parseTiers(p.priceTiers).map((t) => `${t.minQty.toLocaleString("pt-BR")} un = ${brl(t.price)} no total`) }
              : { tipo_de_preco: "por unidade; cai conforme a quantidade", preco_a_partir_de: brl(Number(p.price)), minimo: p.minQty, faixas_de_preco: parseTiers(p.priceTiers).map((t) => `a partir de ${t.minQty} ${unitName[p.unit] ?? p.unit}: ${brl(t.price)} cada`) }),
          }))
        : { aviso: "Nenhum produto encontrado com esse termo." };
    }
    case "calcular_preco": {
      const found = await findProduct(String(args?.produto || ""));
      if ("error" in found) return { erro: found.error };
      const p = found.product;
      const qty = Number(args?.quantidade) || 0;
      const r = quotePrice(p, qty);
      if (!r.ok) return { erro: r.error, produto: p.name };
      return { produto: p.name, quantidade: qty, unidade: unitName[p.unit] ?? p.unit, ...(r.exact ? {} : { preco_unitario: brl(r.unitPrice) }), total: brl(r.total), prazo: p.leadTime ?? "a consultar com a equipe", observacao: "Valor de tabela para impressão padrão; arte e frete não incluídos." };
    }
    case "buscar_nos_arquivos": {
      const hits = await searchFiles(conv, String(args?.consulta || ""));
      return hits.length ? hits : { aviso: "Nada encontrado nos arquivos." };
    }
    case "consultar_pedido": {
      const customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
      if (!customer) return { erro: "Não encontrei pedidos neste WhatsApp. Pergunte se o pedido foi feito em outro número ou chame a equipe." };
      const wanted = Number(args?.numero) || 0;
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id, ...(wanted ? { number: wanted } : {}) }, orderBy: { createdAt: "desc" }, take: wanted ? 1 : 4,
        include: { items: { orderBy: { sortOrder: "asc" }, take: 4 }, events: { orderBy: { createdAt: "asc" } } },
      });
      if (!orders.length) return { erro: wanted ? `Não encontrei o pedido nº ${wanted} neste cadastro.` : "Este cliente ainda não tem pedido registrado." };
      return {
        pedidos: orders.map((o) => ({
          numero: o.number, situacao: ORDER_STATUS_LABEL[o.status] ?? o.status,
          itens: o.items.map((i) => `${i.description} (${Number(i.quantity)})`).join("; ").slice(0, 300),
          previsao: o.dueDate ? o.dueDate.toLocaleDateString("pt-BR") : "a definir",
          total: brl(Number(o.total)), pago: brl(Number(o.paid)), falta_pagar: brl(Math.max(0, Number(o.total) - Number(o.paid))),
          entrega: o.deliveryType === "entrega" ? "entrega" : "retirada na loja",
          etapas: o.events.map((e) => `${e.createdAt.toLocaleDateString("pt-BR")}: ${ORDER_STATUS_LABEL[e.status] ?? e.status}`).slice(-8),
        })),
        aviso: "Conte ao cliente de forma simples em que etapa está e quando deve ficar pronto. Se ele quiser o documento, use enviar_ordem_servico_pdf.",
      };
    }
    case "enviar_ordem_servico_pdf": {
      const customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
      if (!customer) return { erro: "Não encontrei pedido neste WhatsApp." };
      const wanted = Number(args?.numero) || 0;
      const orders = await prisma.order.findMany({ where: { customerId: customer.id, status: { not: "cancelado" } }, orderBy: { createdAt: "desc" }, take: 10 });
      if (!orders.length) return { erro: "Este cliente ainda não tem ordem de serviço." };
      let order = wanted ? orders.find((o) => o.number === wanted) : undefined;
      if (wanted && !order) return { erro: `Não encontrei o pedido nº ${wanted} neste cadastro. Pedidos do cliente: ${orders.slice(0, 5).map((o) => `nº ${o.number}`).join(", ")}.` };
      if (!order) {
        const open = orders.filter((o) => o.status !== "entregue");
        const pool = open.length ? open : orders;
        if (pool.length > 1) return { escolher: pool.slice(0, 4).map((o) => ({ numero: o.number, situacao: ORDER_STATUS_LABEL[o.status] ?? o.status, total: brl(Number(o.total)) })), aviso: "Há mais de um pedido. Pergunte qual o cliente quer (pelo número)." };
        order = pool[0];
      }
      const { orderPdf } = await import("../lib/documents.js");
      const { sendPdf } = await import("../lib/notify.js");
      const doc = await orderPdf(order.id);
      if (!doc) return { erro: "Não consegui gerar o PDF agora." };
      const first = (customer.name || "").trim().split(/s+/)[0];
      try {
        await sendPdf({ phone: conv.clientPhone, buffer: doc.buffer, fileName: doc.fileName, message: `${first ? `${first}, s` : "S"}egue a ordem de serviço nº ${order.number}${order.dueDate ? `. Previsão de entrega: ${order.dueDate.toLocaleDateString("pt-BR")}` : ""}. 💙`, userName: "Pixel IA", customerId: customer.id, orderId: order.id });
      } catch (e) { return { erro: "Não consegui enviar o PDF agora. Peça desculpas e ofereça chamar a equipe." }; }
      await prisma.orderEvent.create({ data: { orderId: order.id, status: order.status, note: "Ordem de serviço enviada ao cliente pelo WhatsApp (Pixel IA)", userName: "Pixel IA" } });
      return { enviado: true, numero_pedido: order.number, situacao: ORDER_STATUS_LABEL[order.status] ?? order.status, aviso: "O PDF já foi enviado neste chat. Confirme em uma frase curta e diga em que etapa o pedido está." };
    }
    case "criar_orcamento": {
      const itens = Array.isArray(args?.itens) ? args.itens : [];
      const lines: { productId: string | null; description: string; quantity: number; unitPrice: number; total: number }[] = [];
      for (const it of itens) {
        const found = await findProduct(String(it.produto || ""));
        if ("error" in found) return { erro: found.error };
        const p = found.product;
        const q = Number(it.quantidade) || 0;
        const r = quotePrice(p, q);
        if (!r.ok) return { erro: `${p.name}: ${r.error}` };
        lines.push({ productId: p.id, description: `${p.name}${it.observacao ? ` — ${String(it.observacao).slice(0, 150)}` : ""}`, quantity: q, unitPrice: r.unitPrice, total: r.total });
      }
      if (!lines.length) return { erro: "Informe ao menos um item." };
      let customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
      if (!customer) customer = await prisma.customer.create({ data: { name: conv.clientName || "Cliente WhatsApp", phone: normalizePhone(conv.clientPhone) } });
      await prisma.wppConversation.update({ where: { id: conv.id }, data: { customerId: customer.id } });
      const total = lines.reduce((s, l) => s + l.total, 0);
      const quote = await prisma.quote.create({
        data: { customerId: customer.id, status: "rascunho", source: "whatsapp", total, notes: args?.observacoes ? String(args.observacoes).slice(0, 1000) : null, items: { create: lines } },
      });
      return { numero_orcamento: quote.number, total: brl(total), aviso: "Orçamento registrado. Diga o número e o total e ofereça mandar o PDF agora (se o cliente aceitar ou já tiver pedido, use enviar_orcamento_pdf). A equipe ainda confere antes de fechar." };
    }
    case "enviar_orcamento_pdf": {
      const customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
      if (!customer) return { erro: "Este número ainda não tem orçamento registrado. Ofereça fazer um agora." };
      const wanted = Number(args?.numero) || 0;
      const quotes = await prisma.quote.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 10 });
      if (!quotes.length) return { erro: "O cliente não tem orçamento registrado. Ofereça fazer um agora." };
      let quote = wanted ? quotes.find((q) => q.number === wanted) : undefined;
      if (wanted && !quote) return { erro: `Não encontrei o orçamento nº ${wanted} neste cadastro. Orçamentos do cliente: ${quotes.slice(0, 5).map((q) => `nº ${q.number} (${brl(Number(q.total))})`).join("; ")}.` };
      if (!quote) {
        const open = quotes.filter((q) => q.status === "rascunho" || q.status === "enviado");
        const pool = open.length ? open : quotes;
        if (pool.length > 1 && pool[0].createdAt.getTime() - pool[1].createdAt.getTime() < 10 * 60_000) {
          return { escolher: pool.slice(0, 4).map((q) => ({ numero: q.number, total: brl(Number(q.total)), criado_em: q.createdAt.toLocaleDateString("pt-BR") })), aviso: "Há mais de um orçamento recente. Pergunte qual o cliente quer (pelo número)." };
        }
        quote = pool[0];
      }
      const { quotePdf } = await import("../lib/documents.js");
      const { sendPdf } = await import("../lib/notify.js");
      const doc = await quotePdf(quote.id);
      if (!doc) return { erro: "Não consegui gerar o PDF agora." };
      const first = (customer.name || "").trim().split(/s+/)[0];
      try {
        await sendPdf({ phone: conv.clientPhone, buffer: doc.buffer, fileName: doc.fileName, message: `${first ? `${first}, s` : "S"}egue o orçamento nº ${quote.number}, no valor de ${brl(Number(quote.total))}. 💙`, userName: "Pixel IA", customerId: customer.id, quoteId: quote.id });
      } catch (e) { return { erro: "Não consegui enviar o PDF agora. Peça desculpas e ofereça chamar a equipe." }; }
      await prisma.quote.update({ where: { id: quote.id }, data: { sentAt: new Date(), ...(quote.status === "rascunho" ? { status: "enviado" } : {}) } });
      return { enviado: true, numero_orcamento: quote.number, total: brl(Number(quote.total)), aviso: "O PDF já foi enviado ao cliente neste chat. Confirme em uma frase curta e pergunte se ele quer ajustar algo ou fechar." };
    }
    case "transferir_para_atendente": {
      out.handoff = { sector: String(args?.setor || ""), reason: String(args?.motivo || "").slice(0, 300) };
      return { ok: true, aviso: "Transferência solicitada. Avise o cliente em uma frase." };
    }
    default: return { erro: "Ferramenta desconhecida." };
  }
}

// ── Conversa ─────────────────────────────────────────────────────────────────
type Turn = { role: "user" | "model"; text: string };

async function buildHistory(convId: string, current: string): Promise<Turn[]> {
  const rows = (await prisma.wppMessage.findMany({ where: { conversationId: convId, fromRole: { in: ["client", "bot", "attendant"] } }, orderBy: { sentAt: "desc" }, take: 12 })).reverse();
  const turns: Turn[] = [];
  for (const m of rows) {
    const role = m.fromRole === "client" ? "user" : "model";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text += `\n${m.body.slice(0, 1200)}`;
    else turns.push({ role, text: m.body.slice(0, 1200) });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") turns.push({ role: "user", text: current });
  return turns;
}

const cleanReply = (v: string | null | undefined) => {
  const t = String(v || "").replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "").trim().slice(0, 1500);
  return t.length >= 2 ? t : null;
};

// Dados oficiais da gráfica (tela "Bot e IA > Empresa"): é o que a IA pode afirmar sobre a empresa
async function companyBlock(): Promise<{ name: string; text: string }> {
  const c = await prisma.companyProfile.findFirst();
  if (!c) return { name: "Pixel Gráfica", text: "" };
  const line = (label: string, v?: string | null) => (v?.trim() ? `- ${label}: ${v.trim()}` : null);
  const text = [line("Slogan", c.tagline), line("CNPJ", c.document), line("Endereço", c.address), line("Telefone", c.phone), line("E-mail", c.email), line("Instagram", c.instagram), line("Site", c.website),
    line("Horário de funcionamento", c.hours), line("Formas de pagamento", c.payment), line("Entrega e retirada", c.delivery), line("Criação de arte", c.artService), line("Outras informações", c.notes)]
    .filter(Boolean).join("\n");
  return { name: c.name, text };
}

// O que o sistema já sabe do cliente que está conversando (só quando o número está cadastrado)
async function customerBlock(conv: AiConversation): Promise<string> {
  const customer = conv.customerId ? await prisma.customer.findUnique({ where: { id: conv.customerId } }) : await findCustomerByPhone(conv.clientPhone);
  if (!customer) return "";
  const [orders, quotes] = await Promise.all([
    prisma.order.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 5, include: { items: { orderBy: { sortOrder: "asc" }, take: 3 } } }),
    prisma.quote.findMany({ where: { customerId: customer.id, status: { in: ["rascunho", "enviado"] } }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  const lines = [
    `- Cliente cadastrado: ${customer.name}${customer.company ? ` (${customer.company})` : ""}${customer.city ? `, ${customer.city}` : ""}.`,
    ...orders.map((o) => `- Pedido #${o.number}: ${ORDER_STATUS_LABEL[o.status] ?? o.status}; ${o.items.map((i) => i.description).join(" + ").slice(0, 120)}; total ${brl(Number(o.total))}${o.dueDate ? `; previsão ${o.dueDate.toLocaleDateString("pt-BR")}` : ""}.`),
    ...quotes.map((q) => `- Orçamento #${q.number} (${q.status}): ${brl(Number(q.total))}.`),
  ];
  return `\nDados do cadastro deste cliente (pode usar para atendê-lo pelo nome e falar dos pedidos dele; não repita dados sensíveis):\n${lines.join("\n")}`;
}

export async function systemPrompt(s: Settings, conv: AiConversation) {
  const sectors = (await prisma.wppSector.findMany({ where: { isActive: true } })).map((x) => x.name).join(", ") || "Atendimento";
  const company = await companyBlock();
  const who = await customerBlock(conv);
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now));
  const greeting = hour < 12 ? "bom dia" : hour < 18 ? "boa tarde" : "boa noite";
  const clock = new Intl.DateTimeFormat("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(now);
  return `Você é a Pixel IA, assistente virtual da ${company.name}, atendendo clientes pelo WhatsApp em português do Brasil.
${company.text ? `\nDados oficiais da gráfica (afirme só isto sobre a empresa; o que não estiver aqui, diga que vai confirmar com a equipe):\n${company.text}\n` : ""}${who}
AGORA: ${clock} (horário de Brasília). A saudação certa neste momento é "${greeting}".

HUMANIZAÇÃO (o mais importante: o cliente tem que sentir que fala com uma pessoa atenciosa, não com um robô):
- Cumprimente de volta do mesmo jeito que ele cumprimentou ("bom dia" → "Bom dia!", "boa noite" → "Boa noite!"). Se ele disse só "oi", use a saudação do horário. Se ele cumprimentar com a saudação errada para o horário (ex.: "bom dia" à noite), responda com a saudação certa sem corrigir. Cumprimente uma vez por conversa; no meio da conversa não repita "olá".
- Use o nome do cliente com naturalidade (às vezes, não em toda frase).
- Leia o contexto: considere TODAS as mensagens anteriores. Se ele disse "mil cartões" e depois "e o premium?", é sobre mil cartões. Nunca pergunte de novo algo que ele já respondeu. Entenda respostas curtas ("sim", "pode ser", "esse mesmo", "quanto?") pelo que foi dito antes.
- Responda ao que ele disse antes de perguntar algo; mostre que entendeu ("Entendi, é para a inauguração da loja."). Acompanhe o humor: se ele está com pressa, seja objetiva; se está em dúvida, explique com calma; se está chateado, peça desculpas de verdade e resolva ou chame alguém.
- Agradecimento e despedida têm resposta de gente ("Imagina, foi um prazer! Qualquer coisa é só chamar. 💙"); não reinicie menu nem faça pergunta nova.
- Nada de respostas prontas, listas numeradas de opções ou frases repetidas. Varie o jeito de falar. Emojis com moderação (no máximo um por mensagem).

COMUNICATIVA E PROATIVA (converse, não apenas responda):
- Toda resposta tem três partes naturais: reage ao que ele disse, entrega a informação e deixa claro o próximo passo com uma pergunta simples. Nunca termine "seca" nem deixe o cliente sem saber o que fazer agora.
- Explique em uma frase o que diferencia as opções e diga qual você recomenda para o caso dele e por quê ("para divulgar na rua, o de 100x70 chama mais atenção").
- Se ele só disser o produto ("quero banner"), puxe a conversa: para que vai usar, onde vai ficar, qual tamanho ele imagina; ajude a decidir em vez de só listar o catálogo.
- Se a medida/quantidade dele não existe, não diga só "não temos": mostre as opções mais próximas que existem, com valor, e pergunte qual serve.
- Antecipe dúvidas comuns (prazo, arte, forma de pagamento) quando fizer sentido, em uma frase, sem encher de informação.

FORMATO DAS OPÇÕES (muito importante para ler bem no WhatsApp):
- Sempre que for mostrar 2 ou mais opções, tamanhos ou preços, NUNCA coloque tudo numa frase corrida. Escreva: uma frase de abertura; uma linha em branco; UMA OPÇÃO POR LINHA, cada uma começando com "• ", nome ou medida em *negrito* e o valor no fim (ex.: "• *90x60 cm* — R$ 85,00"); outra linha em branco; e por fim a pergunta.
- Máximo de 5 opções por mensagem; se houver mais, mostre as mais úteis e ofereça ver as outras.

CLIENTE QUE JÁ É CADASTRADO (o número do WhatsApp identifica o cliente):
- Quando ele pedir "meu orçamento", "meu pedido", "como está meu pedido", "manda a OS", use as ferramentas na hora, sem pedir CPF, nome ou número do pedido. Só peça o número se houver mais de um em aberto.
- enviar_orcamento_pdf manda o PDF do orçamento aqui no chat; enviar_ordem_servico_pdf manda a ordem de serviço; consultar_pedido traz a etapa, as datas, a previsão e o quanto falta pagar. Responda de forma simples: em que etapa está, quando fica pronto, e o que falta (pagamento, arquivo, aprovação da arte).
- "Me manda o PDF" / "manda o documento": se vocês acabaram de falar de um pedido, é a ordem de serviço; se foi de orçamento, é o orçamento; sem contexto, e o cliente tendo só um dos dois, envie esse; tendo os dois, pergunte qual, em uma frase curta. Não responda "não tenho orçamento" quando ele tem pedido em andamento: ofereça o documento que existe.
- Chame-o pelo nome. Se ele tiver pedido em andamento e perguntar "e aí?", entenda que é sobre esse pedido.
- Nunca mostre dados de outros clientes; as ferramentas já só trazem os dele.

ÁUDIOS: o cliente também manda áudio; ele chega a você já transcrito em texto. Responda ao que foi dito normalmente, em texto, sem comentar que era áudio. A transcrição pode ter pequenos erros: interprete pelo contexto e, se algo importante (quantidade, medida, valor) parecer duvidoso, confirme com ele ("Entendi 1.000 cartões, é isso mesmo?").

QUANDO O CLIENTE QUER UMA PESSOA ("quero falar com um atendente", "tem alguém aí?", "passa para um humano", "quero falar com o dono/gerente/vendedor"): não argumente, não tente reter e não peça para ele repetir. Responda com simpatia numa frase ("Claro, já chamo alguém da equipe pra te atender!") e use transferir_para_atendente na hora, escolhendo o setor pelo assunto da conversa (orçamento/preço → Orçamentos; arte, logo ou layout → Arte e Criação; pagamento, boleto ou nota → Financeiro; pedido, entrega ou retirada → Acompanhar pedido; na dúvida, Orçamentos) e resumindo no motivo o que ele já contou para ninguém precisar perguntar de novo. Se a equipe estiver fora do horário de funcionamento, avise o horário dos dados oficiais.

Seja humana, simpática e direta (normalmente até 3 frases curtas). Use *negrito* do WhatsApp quando ajudar; nada de títulos ou markdown.
Entenda o negócio de uma gráfica e converse como uma atendente experiente, não como um robô de menu.

PREÇO (sempre pelas ferramentas e pelos dados oficiais; nunca de memória):
- O cliente fala do jeito dele: converta sozinha ("mil cartões" = 1000, "meio milheiro" = 500, "uma dúzia" = 12, "dois banners" = 2). Não peça para ele reescrever.
- Se a quantidade existe na tabela, responda o valor NA HORA, sem transferir e sem enrolar. Se o produto tem variações (ex.: cartão Premium, Comum e Básico), consulte todas e mostre em lista curta o total de cada uma; depois pergunte qual interessa.
- Se a quantidade NÃO existe na tabela (ex.: 300 cartões), diga com naturalidade que a gráfica só trabalha com as quantidades da tabela (ex.: "só trabalhamos com 500 ou 1.000 cartões"), já informe o valor dessas opções e pergunte se alguma atende. Só chame uma pessoa se o cliente insistir em outra quantidade.
- Em produtos com preço por unidade, avise que o preço de cada peça cai conforme a quantidade quando houver faixas.
- Material, medida ou serviço que não esteja cadastrado: não invente valor nem faça média; diga que vai confirmar com a equipe e, se o cliente quiser seguir, use transferir_para_atendente (setor Orçamentos).
- Prazo, formato e acabamento também só vêm das ferramentas e dos dados oficiais.

ARTE (regra da casa): a criação da arte JÁ ESTÁ INCLUSA nos pedidos; a gráfica NÃO cobra pela arte. Se perguntarem se fazem a arte, responda que sim e que já está inclusa no valor. Se perguntarem se tem desconto por mandar a própria arte, explique com educação que não, justamente porque a arte já está incluída (não existe cobrança de arte para abater), e que ele pode mandar a arte pronta se preferir. Peça o necessário para criar (logo, textos, cores, medida). Não transfira só por causa de arte.

PEDIDO DE ORÇAMENTO ("quero fazer um orçamento", "quanto fica…"): isso NÃO é motivo para transferir. Você mesma conduz a conversa, como uma atendente de balcão:
- Comece de forma natural, pelo nome se souber, e pergunte o que ele quer imprimir (ou use o que ele já disse). Uma pergunta por vez; não despeje uma lista de perguntas nem um formulário.
- Descubra produto, quantidade e, se precisar, medida ou acabamento. Quando já der para calcular, calcule e responda o valor na hora com as ferramentas.
- Reaja ao que o cliente disse ("Ótima escolha para divulgar a loja!"), varie as frases e não repita a mesma resposta pronta. Nada de texto robótico ou de menu de opções numeradas.
- Com produto e quantidade confirmados, use criar_orcamento, diga o número e o total e ofereça mandar o PDF agora. Só então ofereça passar para a equipe, se ele quiser fechar, negociar ou enviar arquivo.
- Se o cliente pedir o orçamento que já foi registrado ("me manda o orçamento", "quero o PDF", "manda de novo"), use enviar_orcamento_pdf: ele envia o documento aqui no chat. Se ele citar um número, passe-o; se houver mais de um em aberto, pergunte qual. Não invente nem recite valores de memória: o PDF é o documento oficial. Depois de enviar, confirme em uma frase e pergunte se quer ajustar algo ou fechar.

CONVERSA:
- Se o cliente não souber o que escolher, faça UMA pergunta por vez (para que serve, quantidade, formato) e sugira a melhor opção do catálogo, explicando em uma frase por quê.
- Quando o cliente confirmar produto e quantidade, registre com criar_orcamento e ofereça enviar o PDF do orçamento por aqui.
- Use transferir_para_atendente quando: o cliente pedir uma pessoa, quiser negociar valor fora da tabela, tiver problema ou reclamação com um pedido, enviar arquivo para conferência, ou você não souber responder com segurança.
- Nunca peça senha, dados de cartão ou documentos sensíveis. Não diga que executou algo que não fez com uma ferramenta.
- Setores disponíveis para transferência: ${sectors}.
${conv.clientName ? `- Nome do cliente: ${conv.clientName}.` : ""}
${s.customPrompt ? `\nOrientações da gráfica (não podem contrariar as regras acima):\n${s.customPrompt}` : ""}`;
}

async function askGemini(s: Settings, conv: AiConversation, text: string, out: AiResult): Promise<AiResult> {
  const ai = new GoogleGenAI({ apiKey: s.apiKey! });
  const system = await systemPrompt(s, conv);
  const contents: any[] = (await buildHistory(conv.id, text)).map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    for (let i = 0; i < 5; i++) {
      const resp = await ai.models.generateContent({
        model: s.model, contents,
        config: { systemInstruction: system, tools: geminiTools, temperature: 0.3, maxOutputTokens: 2048, abortSignal: controller.signal },
      });
      const calls = resp.functionCalls;
      if (!calls?.length) { out.text = cleanReply(resp.text); return out; }
      const modelContent = resp.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);
      const parts = [];
      for (const call of calls) {
        let result: unknown;
        try { result = await runTool(call.name ?? "", call.args, conv, out); } catch (e) { result = { erro: safeError(e) }; }
        parts.push({ functionResponse: { name: call.name, response: { output: result } } });
      }
      contents.push({ role: "user", parts });
    }
    return out;
  } finally { clearTimeout(timeout); }
}

async function openaiRequest(apiKey: string, body: unknown, signal?: AbortSignal): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI respondeu HTTP ${res.status}`);
  return data;
}

async function askOpenAI(s: Settings, conv: AiConversation, text: string, out: AiResult): Promise<AiResult> {
  const messages: any[] = [
    { role: "system", content: await systemPrompt(s, conv) },
    ...(await buildHistory(conv.id, text)).map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text })),
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    for (let i = 0; i < 5; i++) {
      const data = await openaiRequest(s.apiKey!, { model: s.model, messages, tools: openaiTools, temperature: 0.3, max_tokens: 900 }, controller.signal);
      const msg = data.choices?.[0]?.message;
      if (!msg) return out;
      if (!msg.tool_calls?.length) { out.text = cleanReply(msg.content); return out; }
      messages.push(msg);
      for (const call of msg.tool_calls) {
        let result: unknown;
        try { result = await runTool(call.function?.name ?? "", JSON.parse(call.function?.arguments || "{}"), conv, out); } catch (e) { result = { erro: safeError(e) }; }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return out;
  } finally { clearTimeout(timeout); }
}

/** A IA está ligada e tem chave cadastrada? Sem isso o menu encaminha para a equipe em vez de conversar. */
export async function isAiAvailable(): Promise<boolean> {
  const s = await loadSettings();
  return s.enabled && !!s.apiKey;
}

export async function generateReply(conv: AiConversation, text: string): Promise<AiResult | null> {
  try {
    let s = await loadSettings();
    if (!s.enabled || !s.apiKey) return null;
    // Pico de uso (503) ou limite por minuto (429) são passageiros: espera um pouco e tenta de novo uma vez.
    for (let attempt = 0; ; attempt++) {
      try {
        const out: AiResult = { text: null };
        return s.provider === "openai" ? await askOpenAI(s, conv, text, out) : await askGemini(s, conv, text, out);
      } catch (e) {
        const msg = safeError(e);
        const transient = /"code":s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(msg);
        if (transient && attempt === 0) { await new Promise((r) => setTimeout(r, 2500)); continue; }
        // cota do modelo estourada: tenta o modelo "lite" da mesma chave, que costuma ter limite maior
        if (transient && attempt === 1 && s.provider === "gemini" && !/lite/.test(s.model)) { s = { ...s, model: "gemini-3.5-flash-lite" }; continue; }
        throw e;
      }
    }
  } catch (e) {
    console.error("[IA] resposta indisponível:", safeError(e));
    return null;
  }
}

// ── Áudio: transcreve o áudio do cliente para a IA entender (Gemini ouve direto; OpenAI usa o modelo de transcrição) ──
const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const AUDIO_PROMPT = "Transcreva fielmente este áudio de WhatsApp, em português do Brasil. Devolva SOMENTE o que a pessoa disse, sem comentários, sem aspas e sem rótulos. Se não houver fala compreensível, responda exatamente: [inaudível]";

export async function transcribeAudio(buffer: Buffer, mime: string): Promise<string | null> {
  try {
    const s = await loadSettings();
    if (!s.enabled || !s.apiKey || !buffer.length || buffer.length > AUDIO_MAX_BYTES) return null;
    const type = (mime || "audio/ogg").split(";")[0].trim() || "audio/ogg";
    for (let attempt = 0; ; attempt++) {
      try {
        let raw: string | null | undefined;
        if (s.provider === "openai") {
          const form = new FormData();
          form.append("file", new Blob([new Uint8Array(buffer)], { type }), `audio.${(type.split("/")[1] || "ogg").replace("mpeg", "mp3")}`);
          form.append("model", "gpt-4o-mini-transcribe");
          form.append("language", "pt");
          const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${s.apiKey}` }, body: form, signal: AbortSignal.timeout(45_000) });
          if (!r.ok) throw new Error(`{"error":{"code":${r.status},"message":${JSON.stringify((await r.text()).slice(0, 200))}}}`);
          raw = ((await r.json()) as any).text;
        } else {
          const model = attempt >= 1 && !/lite/.test(s.model) ? "gemini-3.5-flash-lite" : s.model;
          const r = await new GoogleGenAI({ apiKey: s.apiKey }).models.generateContent({
            model, contents: [{ role: "user", parts: [{ inlineData: { mimeType: type, data: buffer.toString("base64") } }, { text: AUDIO_PROMPT }] }],
            config: { temperature: 0, maxOutputTokens: 1024 },
          });
          raw = r.text;
        }
        const text = String(raw ?? "").replace(/^["“]|["”]$/g, "").trim();
        return !text || /^[?inaud[ií]vel]?.?$/i.test(text) ? null : text.slice(0, 2000);
      } catch (e) {
        if (attempt < 2 && /"code":s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(safeError(e))) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        throw e;
      }
    }
  } catch (e) {
    console.error("[IA] não consegui transcrever o áudio:", safeError(e));
    return null;
  }
}

// Teste do painel: usa a chave e o modelo salvos (sem ferramentas, só confirma a conexão)
export async function testConnection(): Promise<{ ok: boolean; provider: Provider; model: string; reply?: string; error?: string }> {
  const s = await loadSettings(true).catch(() => null);
  if (!s) return { ok: false, provider: "gemini", model: DEFAULT_MODEL.gemini, error: "Não foi possível ler a configuração." };
  if (!s.apiKey) return { ok: false, provider: s.provider, model: s.model, error: `Cadastre a chave da API ${s.provider === "openai" ? "da OpenAI (ChatGPT)" : "do Gemini"}.` };
  try {
    let reply: string | null;
    if (s.provider === "openai") {
      const d = await openaiRequest(s.apiKey, { model: s.model, messages: [{ role: "user", content: "Responda apenas: conexão confirmada" }], max_tokens: 20 });
      reply = cleanReply(d.choices?.[0]?.message?.content);
    } else {
      const r = await new GoogleGenAI({ apiKey: s.apiKey }).models.generateContent({ model: s.model, contents: "Responda apenas: conexão confirmada", config: { maxOutputTokens: 256 } });
      reply = cleanReply(r.text);
    }
    return reply ? { ok: true, provider: s.provider, model: s.model, reply } : { ok: false, provider: s.provider, model: s.model, error: "A IA não retornou resposta." };
  } catch (e) { return { ok: false, provider: s.provider, model: s.model, error: safeError(e) }; }
}
