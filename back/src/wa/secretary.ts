// Modo secretária: quem é administrador (com WhatsApp no cadastro) e escreve para o número da gráfica
// conversa com a IA como dono da empresa, não como cliente nem como atendente.
// A IA consulta atendimentos, orçamentos, pedidos e clientes, e executa ações. Tudo que muda algo ou
// sai para um cliente só acontece depois de o administrador confirmar (prévia → "sim" numa mensagem seguinte).
import { GoogleGenAI, type ToolUnion } from "@google/genai";
import { prisma } from "../db.js";
import { strip, samePhone, brl, digits, normalizePhone } from "../lib/text.js";
import { quoteWithOffer, parseOptions } from "../lib/pricing.js";
import { loadSettings, safeError, toGeminiSchema, openaiRequest, runTool, findProduct, ORDER_STATUS_LABEL, type ToolDef, type Settings } from "./ai.js";

export interface AdminUser { id: string; name: string; phone: string }

export async function findAdminByPhone(phone: string): Promise<AdminUser | null> {
  const users = await prisma.user.findMany({ where: { active: true, role: "admin", phone: { not: null } } });
  const u = users.find((x) => samePhone(x.phone, phone));
  return u ? { id: u.id, name: u.name, phone: digits(u.phone) } : null;
}

// ── Memória curta da conversa e confirmações pendentes (por administrador) ───
interface Session { turns: { role: "user" | "model"; text: string }[]; at: number; turn: number; pending: Map<string, { turn: number; at: number }> }
const sessions = new Map<string, Session>();
const SESSION_MS = 45 * 60_000;
const session = (id: string): Session => {
  let s = sessions.get(id);
  if (!s || Date.now() - s.at > SESSION_MS) { s = { turns: [], at: Date.now(), turn: 0, pending: new Map() }; sessions.set(id, s); }
  s.at = Date.now();
  return s;
};

const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL);
const fmtDate = (d?: Date | null) => (d ? d.toLocaleDateString("pt-BR") : "sem data");
const ago = (d: Date) => {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};
const first = (n: string) => n.trim().split(/\s+/)[0] || n;

// ── Ferramentas ──────────────────────────────────────────────────────────────
const CONFIRM = { confirmado: { type: "boolean", description: "false na primeira chamada (só mostra a prévia). true SOMENTE depois que o administrador disse sim à prévia, numa mensagem posterior, repetindo exatamente os mesmos argumentos." } };

const tools: ToolDef[] = [
  { name: "resumo", description: "Visão geral agora: atendimentos abertos/na fila, orçamentos em aberto, pedidos por etapa, atrasados e a receber.", parameters: { type: "object", properties: {} } },
  {
    name: "atendimentos", description: "Lista as conversas de WhatsApp: com o bot, na fila e em atendimento (quem está atendendo, última mensagem e há quanto tempo).",
    parameters: { type: "object", properties: { situacao: { type: "string", enum: ["abertos", "fila", "em_atendimento", "com_bot", "encerrados_hoje"] } } },
  },
  {
    name: "orcamentos", description: "Lista orçamentos (mais recentes primeiro), com itens resumidos. Filtra por situação e/ou cliente.",
    parameters: { type: "object", properties: { situacao: { type: "string", enum: ["abertos", "rascunho", "enviado", "aprovado", "recusado", "todos"] }, cliente: { type: "string" }, numero: { type: "number" } } },
  },
  {
    name: "pedidos", description: "Lista ordens de serviço/pedidos com etapa, prazo, total, quanto já foi pago e quanto falta.",
    parameters: {
      type: "object",
      properties: {
        filtro: { type: "string", enum: ["abertos", "atrasados", "prontos", "a_receber", "hoje", "todos"], description: "atrasados = prazo vencido e não entregue; prontos = aguardando retirada; a_receber = com saldo em aberto" },
        cliente: { type: "string" }, numero: { type: "number" },
      },
    },
  },
  { name: "buscar_cliente", description: "Procura clientes pelo nome, empresa ou telefone. Devolve os candidatos com id e telefone. Se vier mais de um, pergunte ao administrador qual.", parameters: { type: "object", properties: { busca: { type: "string" } }, required: ["busca"] } },
  { name: "cadastrar_cliente", description: "Cadastra um cliente novo (nome + WhatsApp com DDD). Se o telefone já existir, devolve o cadastro existente.", parameters: { type: "object", properties: { nome: { type: "string" }, telefone: { type: "string" } }, required: ["nome", "telefone"] } },
  { name: "listar_produtos", description: "Catálogo ativo com preços, opcionais e fotos disponíveis.", parameters: { type: "object", properties: { busca: { type: "string" } } } },
  {
    name: "calcular_preco", description: "Preço de um produto para uma quantidade (e opcionais). Nunca estime de cabeça.",
    parameters: { type: "object", properties: { produto: { type: "string" }, quantidade: { type: "number" }, opcionais: { type: "array", items: { type: "string" } } }, required: ["produto", "quantidade"] },
  },
  {
    name: "criar_orcamento", description: "Cria um orçamento em rascunho para um cliente cadastrado (use buscar_cliente/cadastrar_cliente antes). Não envia nada ao cliente.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        itens: { type: "array", items: { type: "object", properties: { produto: { type: "string" }, quantidade: { type: "number" }, observacao: { type: "string" }, opcionais: { type: "array", items: { type: "string" } } }, required: ["produto", "quantidade"] } },
        observacoes: { type: "string" },
      },
      required: ["cliente_id", "itens"],
    },
  },
  {
    name: "enviar_orcamento", description: "Envia o PDF de um orçamento ao cliente pelo WhatsApp, com uma mensagem. EXIGE confirmação do administrador.",
    parameters: { type: "object", properties: { numero: { type: "number" }, mensagem: { type: "string", description: "Mensagem que acompanha o PDF (opcional; há uma padrão)" }, ...CONFIRM }, required: ["numero"] },
  },
  {
    name: "enviar_mensagem", description: "Envia uma mensagem de WhatsApp a um cliente cadastrado (cliente_id) OU a um número digitado (telefone). EXIGE confirmação do administrador.",
    parameters: { type: "object", properties: { cliente_id: { type: "string" }, telefone: { type: "string" }, texto: { type: "string" }, ...CONFIRM }, required: ["texto"] },
  },
  {
    name: "mudar_etapa_pedido", description: "Muda a etapa de um pedido (e, se pedido, avisa o cliente). EXIGE confirmação do administrador.",
    parameters: { type: "object", properties: { numero: { type: "number" }, etapa: { type: "string", enum: ORDER_STATUSES }, avisar_cliente: { type: "boolean" }, mensagem: { type: "string", description: "Aviso ao cliente (se avisar_cliente)" }, ...CONFIRM }, required: ["numero", "etapa"] },
  },
  { name: "orcamento_para_pedido", description: "Aprova um orçamento e gera o pedido (ordem de serviço) com os mesmos itens. EXIGE confirmação.", parameters: { type: "object", properties: { numero: { type: "number" }, prazo: { type: "string", description: "Data de entrega AAAA-MM-DD (opcional)" }, ...CONFIRM }, required: ["numero"] } },
  {
    name: "registrar_pagamento", description: "Registra um pagamento recebido de um pedido. EXIGE confirmação.",
    parameters: { type: "object", properties: { numero: { type: "number" }, valor: { type: "number" }, forma: { type: "string", enum: ["pix", "dinheiro", "cartao", "boleto", "transferencia"] }, avisar_cliente: { type: "boolean" }, ...CONFIRM }, required: ["numero", "valor"] },
  },
];

const geminiTools: ToolUnion[] = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }];
const openaiTools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));

// ── Execução ─────────────────────────────────────────────────────────────────
const customerLine = (c: { id: string; name: string; company: string | null; phone: string | null }) => ({ id: c.id, nome: c.name, empresa: c.company, telefone: c.phone });

async function findCustomers(q: string) {
  const t = q.trim();
  const d = digits(t);
  const rows = await prisma.customer.findMany({
    where: { OR: [{ name: { contains: t } }, { company: { contains: t } }, ...(d.length >= 4 ? [{ phone: { contains: d.slice(-9) } }] : [])] },
    orderBy: { name: "asc" }, take: 8,
  });
  return rows;
}

const orderInfo = (o: any) => ({
  numero: o.number, cliente: o.customer?.name, etapa: ORDER_STATUS_LABEL[o.status] ?? o.status, prazo: fmtDate(o.dueDate), atrasado: !!o.dueDate && o.dueDate < new Date() && !["entregue", "cancelado"].includes(o.status),
  total: brl(Number(o.total)), pago: brl(Number(o.paid)), falta: brl(Math.max(0, Number(o.total) - Number(o.paid))), itens: (o.items ?? []).slice(0, 4).map((i: any) => `${i.description} x${Number(i.quantity)}`),
});

async function gate(st: Session, name: string, sig: unknown, args: any, preview: Record<string, unknown>, run: () => Promise<unknown>): Promise<unknown> {
  const key = `${name}:${JSON.stringify(sig)}`;
  const p = st.pending.get(key);
  if (args?.confirmado === true && p && p.turn < st.turn && Date.now() - p.at < 15 * 60_000) { st.pending.delete(key); return run(); }
  st.pending.set(key, { turn: st.turn, at: Date.now() });
  return { aguardando_confirmacao: true, previa: preview, instrucao: "NADA foi feito. Mostre esta prévia ao administrador (para quem, o que será feito/enviado, texto exato) e pergunte se pode executar. Só chame a ferramenta de novo com confirmado=true, mesmos argumentos, depois que ele responder que sim." };
}

const num = (v: unknown) => Number(v) || 0;

async function exec(name: string, args: any, admin: AdminUser, st: Session): Promise<unknown> {
  switch (name) {
    case "resumo": {
      const now = new Date();
      const [waiting, active, bot, quotesOpen, orders] = await Promise.all([
        prisma.wppConversation.count({ where: { status: "waiting" } }), prisma.wppConversation.count({ where: { status: "active" } }), prisma.wppConversation.count({ where: { status: "bot" } }),
        prisma.quote.count({ where: { status: { in: ["rascunho", "enviado"] } } }),
        prisma.order.findMany({ where: { status: { notIn: ["entregue", "cancelado"] } }, select: { status: true, dueDate: true, total: true, paid: true } }),
      ]);
      const porEtapa: Record<string, number> = {};
      for (const o of orders) porEtapa[ORDER_STATUS_LABEL[o.status] ?? o.status] = (porEtapa[ORDER_STATUS_LABEL[o.status] ?? o.status] ?? 0) + 1;
      return {
        atendimentos: { na_fila: waiting, em_atendimento: active, com_o_bot: bot }, orcamentos_em_aberto: quotesOpen, pedidos_abertos: orders.length, pedidos_por_etapa: porEtapa,
        pedidos_atrasados: orders.filter((o) => o.dueDate && o.dueDate < now).length, a_receber: brl(orders.reduce((s, o) => s + Math.max(0, Number(o.total) - Number(o.paid)), 0)),
      };
    }
    case "atendimentos": {
      const sit = String(args?.situacao || "abertos");
      const status = sit === "fila" ? ["waiting"] : sit === "em_atendimento" ? ["active"] : sit === "com_bot" ? ["bot"] : ["bot", "waiting", "active"];
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const rows = await prisma.wppConversation.findMany({
        where: sit === "encerrados_hoje" ? { status: "closed", closedAt: { gte: since } } : { status: { in: status } },
        include: { sector: { select: { name: true } }, messages: { orderBy: { sentAt: "desc" }, take: 1, select: { body: true, fromRole: true } } }, orderBy: { updatedAt: "desc" }, take: 15,
      });
      return rows.map((c) => ({ cliente: c.clientName || c.clientPhone, telefone: c.clientPhone, situacao: c.status, setor: c.sector?.name ?? null, atendente: c.attendantName ?? null, assunto: c.subject, ultima_mensagem: c.messages[0] ? `${c.messages[0].fromRole}: ${c.messages[0].body.slice(0, 140)}` : null, ha: ago(c.updatedAt) }));
    }
    case "orcamentos": {
      const sit = String(args?.situacao || "abertos");
      const where: any = {};
      if (sit === "abertos") where.status = { in: ["rascunho", "enviado"] }; else if (sit !== "todos") where.status = sit;
      if (num(args?.numero)) where.number = num(args.numero);
      if (args?.cliente) where.customer = { name: { contains: String(args.cliente) } };
      const rows = await prisma.quote.findMany({ where, include: { customer: { select: { name: true, phone: true } }, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" }, take: 12 });
      return rows.map((q) => ({ numero: q.number, cliente: q.customer.name, telefone: q.customer.phone, situacao: q.status, total: brl(Number(q.total)), origem: q.source, criado: fmtDate(q.createdAt), enviado_ao_cliente: q.sentAt ? fmtDate(q.sentAt) : "não", itens: q.items.slice(0, 4).map((i) => `${i.description} x${Number(i.quantity)}`) }));
    }
    case "pedidos": {
      const f = String(args?.filtro || "abertos");
      const where: any = {};
      const now = new Date();
      if (f === "abertos") where.status = { notIn: ["entregue", "cancelado"] };
      else if (f === "atrasados") { where.status = { notIn: ["entregue", "cancelado"] }; where.dueDate = { lt: now }; }
      else if (f === "prontos") where.status = "pronto";
      else if (f === "hoje") { const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(a); b.setDate(b.getDate() + 1); where.dueDate = { gte: a, lt: b }; where.status = { notIn: ["entregue", "cancelado"] }; }
      if (num(args?.numero)) where.number = num(args.numero);
      if (args?.cliente) where.customer = { name: { contains: String(args.cliente) } };
      let rows = await prisma.order.findMany({ where, include: { customer: { select: { name: true, phone: true } }, items: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: f === "a_receber" ? 100 : 15 });
      if (f === "a_receber") rows = rows.filter((o) => !["cancelado"].includes(o.status) && Number(o.total) - Number(o.paid) > 0.009).slice(0, 15);
      return rows.map(orderInfo);
    }
    case "buscar_cliente": return (await findCustomers(String(args?.busca || ""))).map(customerLine);
    case "cadastrar_cliente": {
      const phone = normalizePhone(String(args?.telefone || ""));
      if (digits(phone).length < 12) return { erro: "Telefone inválido: precisa de DDD (ex.: 15 99999-9999)." };
      const dup = await prisma.customer.findFirst({ where: { phone: { contains: digits(phone).slice(-8) } } });
      if (dup && samePhone(dup.phone, phone)) return { ja_existia: true, cliente: customerLine(dup) };
      const c = await prisma.customer.create({ data: { name: String(args?.nome || "").trim().slice(0, 160) || "Cliente", phone } });
      return { criado: true, cliente: customerLine(c) };
    }
    case "listar_produtos":
    case "calcular_preco": return runTool(name, args, { id: `admin:${admin.id}`, clientPhone: admin.phone }, { text: null });
    case "criar_orcamento": {
      const customer = await prisma.customer.findUnique({ where: { id: String(args?.cliente_id || "") } });
      if (!customer) return { erro: "Cliente não encontrado. Use buscar_cliente ou cadastrar_cliente." };
      const lines: { productId: string | null; description: string; quantity: number; unitPrice: number; total: number }[] = [];
      for (const it of Array.isArray(args?.itens) ? args.itens : []) {
        const found = await findProduct(String(it.produto || ""));
        if ("error" in found) return { erro: found.error };
        const p = found.product, q = num(it.quantidade);
        const r = quoteWithOffer(p, q);
        if (!r.ok) return { erro: `${p.name}: ${r.error}` };
        lines.push({ productId: p.id, description: `${p.name}${it.observacao ? ` — ${String(it.observacao).slice(0, 150)}` : ""}`, quantity: q, unitPrice: r.unitPrice, total: r.total });
        const wanted: string[] = Array.isArray(it.opcionais) ? it.opcionais.map((x: unknown) => strip(String(x))) : [];
        for (const o of parseOptions(p.options).filter((o) => wanted.includes(strip(o.name)))) lines.push({ productId: p.id, description: `${o.kind === "servico" ? "Serviço" : "Acabamento"}: ${o.name} (${p.name})`, quantity: 1, unitPrice: o.price, total: o.price });
      }
      if (!lines.length) return { erro: "Informe ao menos um item." };
      const total = lines.reduce((s, l) => s + l.total, 0);
      const quote = await prisma.quote.create({ data: { customerId: customer.id, status: "rascunho", source: "whatsapp", total, createdById: admin.id, notes: args?.observacoes ? String(args.observacoes).slice(0, 1000) : null, items: { create: lines.map((l, n) => ({ ...l, sortOrder: n })) } } });
      return { numero_orcamento: quote.number, cliente: customer.name, total: brl(total), itens: lines.map((l) => `${l.description} x${l.quantity} = ${brl(l.total)}`), aviso: "Criado em rascunho. Ofereça enviar ao cliente (enviar_orcamento)." };
    }
    case "enviar_orcamento": {
      const q = await prisma.quote.findUnique({ where: { number: num(args?.numero) }, include: { customer: true } });
      if (!q) return { erro: `Orçamento nº ${args?.numero} não encontrado.` };
      if (!q.customer.phone) return { erro: `${q.customer.name} não tem WhatsApp cadastrado.` };
      const message = String(args?.mensagem || "").trim().slice(0, 1500) || `Olá, ${first(q.customer.name)}! Segue o orçamento nº ${q.number}, no valor de ${brl(Number(q.total))}. Qualquer dúvida é só falar! 💙`;
      return gate(st, name, [q.number, message], args, { para: `${q.customer.name} (${q.customer.phone})`, orcamento: `nº ${q.number}, ${brl(Number(q.total))}`, mensagem: message }, async () => {
        const { quotePdf } = await import("../lib/documents.js");
        const { sendPdf } = await import("../lib/notify.js");
        const doc = await quotePdf(q.id);
        if (!doc) return { erro: "Não consegui gerar o PDF." };
        await sendPdf({ phone: q.customer.phone, buffer: doc.buffer, fileName: doc.fileName, message, userName: admin.name, customerId: q.customerId, quoteId: q.id });
        await prisma.quote.update({ where: { id: q.id }, data: { sentAt: new Date(), ...(q.status === "rascunho" ? { status: "enviado" } : {}) } });
        return { enviado: true, para: q.customer.name };
      });
    }
    case "enviar_mensagem": {
      const texto = String(args?.texto || "").trim().slice(0, 3000);
      if (!texto) return { erro: "Falta o texto da mensagem." };
      let name2: string | null = null, phone: string | null = null;
      if (args?.cliente_id) { const c = await prisma.customer.findUnique({ where: { id: String(args.cliente_id) } }); if (!c) return { erro: "Cliente não encontrado." }; name2 = c.name; phone = c.phone; }
      else if (args?.telefone) { phone = normalizePhone(String(args.telefone)); const c = await prisma.customer.findFirst({ where: { phone: { contains: digits(phone).slice(-8) } } }); name2 = c && samePhone(c.phone, phone) ? c.name : null; }
      if (!phone || digits(phone).length < 12) return { erro: "Sem WhatsApp válido (precisa de DDD). Peça o número ao administrador." };
      return gate(st, name, [digits(phone), texto], args, { para: `${name2 ?? "número sem cadastro"} (${phone})`, mensagem: texto }, async () => {
        const { sendText } = await import("../lib/notify.js");
        await sendText(phone, texto);
        return { enviado: true, para: name2 ?? phone };
      });
    }
    case "mudar_etapa_pedido": {
      const o = await prisma.order.findUnique({ where: { number: num(args?.numero) }, include: { customer: true } });
      if (!o) return { erro: `Pedido nº ${args?.numero} não encontrado.` };
      const etapa = String(args?.etapa);
      if (!ORDER_STATUSES.includes(etapa)) return { erro: "Etapa inválida." };
      const notify = args?.avisar_cliente === true;
      const message = String(args?.mensagem || "").trim().slice(0, 1500) || (etapa === "pronto" ? `Olá, ${first(o.customer.name)}! Seu pedido nº ${o.number} está pronto! Pode retirar ou combinar a entrega com a gente. 💙` : `Olá, ${first(o.customer.name)}! Seu pedido nº ${o.number} agora está: ${ORDER_STATUS_LABEL[etapa]}. 💙`);
      return gate(st, name, [o.number, etapa, notify, notify ? message : ""], args, { pedido: `nº ${o.number} de ${o.customer.name}`, de: ORDER_STATUS_LABEL[o.status], para: ORDER_STATUS_LABEL[etapa], avisar_cliente: notify ? `${o.customer.phone}: ${message}` : "não" }, async () => {
        await prisma.order.update({ where: { id: o.id }, data: { status: etapa, deliveredAt: etapa === "entregue" ? new Date() : null, events: { create: { status: etapa, note: "Alterado pelo administrador via WhatsApp", userName: admin.name } } } });
        const { syncOrderServiceRecords } = await import("../lib/serviceRecords.js");
        await syncOrderServiceRecords(o.id, o.status, etapa, admin.name);
        let avisado: boolean | string = false;
        if (notify) {
          try { const { sendText } = await import("../lib/notify.js"); await sendText(o.customer.phone, message); await prisma.orderEvent.create({ data: { orderId: o.id, status: etapa, note: "Cliente avisado pelo WhatsApp", userName: admin.name } }); avisado = true; }
          catch (e) { avisado = `não consegui avisar: ${(e as Error).message}`; }
        }
        return { ok: true, pedido: o.number, etapa: ORDER_STATUS_LABEL[etapa], cliente_avisado: avisado };
      });
    }
    case "orcamento_para_pedido": {
      const quote = await prisma.quote.findUnique({ where: { number: num(args?.numero) }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
      if (!quote) return { erro: `Orçamento nº ${args?.numero} não encontrado.` };
      if (await prisma.order.findFirst({ where: { quoteId: quote.id } })) return { erro: "Este orçamento já virou pedido." };
      const due = args?.prazo && /^\d{4}-\d{2}-\d{2}$/.test(String(args.prazo)) ? new Date(`${args.prazo}T12:00:00`) : null;
      return gate(st, name, [quote.number, args?.prazo ?? ""], args, { orcamento: `nº ${quote.number} de ${quote.customer.name}`, total: brl(Number(quote.total)), prazo: due ? fmtDate(due) : "sem prazo" }, async () => {
        const order = await prisma.$transaction(async (tx) => {
          await tx.quote.update({ where: { id: quote.id }, data: { status: "aprovado" } });
          const created = await tx.order.create({
            data: {
              customerId: quote.customerId, quoteId: quote.id, total: quote.total, notes: quote.notes, dueDate: due, createdById: admin.id,
              items: { create: quote.items.map((i, n) => ({ sortOrder: n, productId: i.productId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })) },
              events: { create: { status: "aguardando_arquivo", note: `Criado a partir do orçamento #${quote.number} pelo administrador via WhatsApp`, userName: admin.name } },
            },
          });
          await tx.attachment.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: created.id } });
          await tx.note.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: created.id } });
          return created;
        });
        return { ok: true, pedido: order.number, cliente: quote.customer.name, total: brl(Number(quote.total)) };
      });
    }
    case "registrar_pagamento": {
      const o = await prisma.order.findUnique({ where: { number: num(args?.numero) }, include: { customer: true } });
      if (!o) return { erro: `Pedido nº ${args?.numero} não encontrado.` };
      const amount = Math.round(num(args?.valor) * 100) / 100;
      const remaining = Math.round((Number(o.total) - Number(o.paid)) * 100) / 100;
      if (!(amount > 0)) return { erro: "Valor inválido." };
      if (amount > remaining + 0.001) return { erro: `O valor passa do que falta receber (${brl(remaining)}).` };
      const method = args?.forma ? String(args.forma).slice(0, 30) : null;
      const notify = args?.avisar_cliente === true;
      return gate(st, name, [o.number, amount, method, notify], args, { pedido: `nº ${o.number} de ${o.customer.name}`, valor: brl(amount), forma: method ?? "não informada", falta_depois: brl(remaining - amount), avisar_cliente: notify }, async () => {
        await prisma.orderPayment.create({ data: { orderId: o.id, amount, method, userName: admin.name } });
        const sum = await prisma.orderPayment.aggregate({ where: { orderId: o.id }, _sum: { amount: true } });
        const paid = Number(sum._sum.amount ?? 0);
        await prisma.order.update({ where: { id: o.id }, data: { paid } });
        await prisma.orderEvent.create({ data: { orderId: o.id, status: o.status, note: `Pagamento de ${brl(amount)} registrado${method ? ` (${method})` : ""} pelo administrador via WhatsApp`, userName: admin.name } });
        let avisado: boolean | string = false;
        if (notify) {
          const left = Math.max(0, Number(o.total) - paid);
          try { const { sendText } = await import("../lib/notify.js"); await sendText(o.customer.phone, `Olá, ${first(o.customer.name)}! Recebemos ${brl(amount)} do pedido nº ${o.number}. ${left > 0 ? `Falta ${brl(left)}.` : "Pedido quitado, obrigada! 💙"}`); avisado = true; }
          catch (e) { avisado = `não consegui avisar: ${(e as Error).message}`; }
        }
        return { ok: true, pago_total: brl(paid), falta: brl(Math.max(0, Number(o.total) - paid)), cliente_avisado: avisado };
      });
    }
    default: return { erro: "Ferramenta desconhecida." };
  }
}

// ── Prompt e laço da IA ──────────────────────────────────────────────────────
async function systemFor(admin: AdminUser): Promise<string> {
  const company = await prisma.companyProfile.findFirst();
  const now = new Date();
  return [
    `Você é a secretária executiva da ${company?.name || "Pixel Gráfica"}, conversando no WhatsApp com ${admin.name}, ADMINISTRADOR (dono/gestor). Aqui ele NÃO é cliente: é quem manda na empresa. Trate-o com proximidade e respeito, sem enrolação.`,
    `Hoje é ${now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}, ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
    "", "COMO AGIR",
    "- Entenda o pedido (às vezes vem de áudio transcrito, com erros de grafia/nome) e resolva com as ferramentas. Consultas (resumo, atendimentos, orçamentos, pedidos, clientes, preços) você faz na hora, sem pedir licença.",
    "- Nunca invente dados: nomes, números, valores, prazos e situações vêm SÓ das ferramentas. Se a ferramenta não trouxer, diga que não encontrou.",
    "- Respostas curtas, no estilo WhatsApp: use *negrito* para o essencial e listas simples. Sem tabelas, sem markdown de título. Em listas longas, mostre os mais importantes e ofereça o resto.",
    "- Cliente com nome repetido ou parecido: liste as opções (nome, empresa, final do telefone) numeradas e pergunte qual. Cliente que não existe: pergunte se cadastra (nome + WhatsApp). Se ele ditar/digitar um número, use-o e confirme nome e número na prévia.",
    "- Para criar orçamento: confirme produtos e quantidades (use calcular_preco/listar_produtos), crie com criar_orcamento e mostre o total. Depois pergunte se envia ao cliente.",
    "- AÇÕES QUE MUDAM ALGO OU SAEM PARA UM CLIENTE (enviar_orcamento, enviar_mensagem, mudar_etapa_pedido, orcamento_para_pedido, registrar_pagamento): chame a ferramenta primeiro SEM confirmar para gerar a prévia, mostre a ele para quem vai, o que será feito e o texto exato, e pergunte \"posso enviar?\" (ou equivalente). Só depois do \"sim\" dele, chame de novo com confirmado=true e os MESMOS argumentos (mesmo texto). Se ele corrigir algo, gere nova prévia.",
    "- Mensagens que você escreve para clientes: simpáticas, na voz da gráfica, com o primeiro nome do cliente, curtas e sem inventar fatos (prazos, valores) que não tenha confirmado. Se o administrador ditar o que quer dizer, mantenha o sentido dele.",
    "- Se ele pedir algo que você não consegue (ex.: editar cadastro, apagar, relatórios fora das ferramentas), diga com franqueza e indique o painel.",
    "- Depois de executar, confirme em uma linha o que foi feito (e se o cliente foi avisado). Sem emojis exagerados.",
  ].join("\n");
}

type Turn = { role: "user" | "model"; text: string };
async function runAgent(s: Settings, system: string, history: Turn[], run: (name: string, args: any) => Promise<unknown>): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const clean = (t: string | null | undefined) => String(t || "").replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "").trim().slice(0, 3500) || null;
  try {
    if (s.provider === "openai") {
      const messages: any[] = [{ role: "system", content: system }, ...history.map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text }))];
      for (let i = 0; i < 8; i++) {
        const data = await openaiRequest(s.apiKey!, { model: s.model, messages, tools: openaiTools, temperature: 0.3, max_tokens: 1200 }, controller.signal);
        const msg = data.choices?.[0]?.message;
        if (!msg) return null;
        if (!msg.tool_calls?.length) return clean(msg.content);
        messages.push(msg);
        for (const call of msg.tool_calls) {
          let result: unknown;
          try { result = await run(call.function?.name ?? "", JSON.parse(call.function?.arguments || "{}")); } catch (e) { result = { erro: safeError(e) }; }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      return null;
    }
    const ai = new GoogleGenAI({ apiKey: s.apiKey! });
    const contents: any[] = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
    for (let i = 0; i < 8; i++) {
      const resp = await ai.models.generateContent({ model: s.model, contents, config: { systemInstruction: system, tools: geminiTools, temperature: 0.3, maxOutputTokens: 3000, abortSignal: controller.signal } });
      const calls = resp.functionCalls;
      if (!calls?.length) return clean(resp.text);
      const modelContent = resp.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);
      const parts = [];
      for (const call of calls) {
        let result: unknown;
        try { result = await run(call.name ?? "", call.args); } catch (e) { result = { erro: safeError(e) }; }
        parts.push({ functionResponse: { name: call.name, response: { output: result } } });
      }
      contents.push({ role: "user", parts });
    }
    return null;
  } finally { clearTimeout(timeout); }
}

/** Responde a uma mensagem (já em texto) do administrador. Devolve o texto a enviar a ele. */
export async function adminReply(admin: AdminUser, text: string): Promise<string> {
  const s = await loadSettings();
  if (!s.enabled || !s.apiKey) return "A IA está desligada ou sem chave. Ligue em *Bot e IA* no painel para eu poder ajudar por aqui. 🙏";
  const st = session(admin.id);
  st.turn++;
  const history: Turn[] = [...st.turns.slice(-14), { role: "user", text }];
  const system = await systemFor(admin);
  const run = (name: string, args: any) => exec(name, args, admin, st);
  let reply: string | null = null;
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    try { reply = await runAgent(s, system, history, run); }
    catch (e) {
      const msg = safeError(e);
      console.error("[Secretária] erro:", msg);
      if (attempt === 0 && /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(msg)) await new Promise((r) => setTimeout(r, 2500)); else break;
    }
  }
  if (!reply) return "Tive um problema para processar agora. Pode repetir em instantes? 🙏";
  st.turns.push({ role: "user", text }, { role: "model", text: reply });
  if (st.turns.length > 20) st.turns.splice(0, st.turns.length - 20);
  return reply;
}
