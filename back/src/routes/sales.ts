// Orçamentos, pedidos, arquivos e indicadores do painel.
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { prisma } from "../db.js";
import { ah, HttpError, str, num, date } from "./util.js";
import { saveAttachment, filePath } from "../lib/files.js";
import { syncOrderServiceRecords } from "../lib/serviceRecords.js";
import { sendText } from "../lib/notify.js";

export const router = Router();

export const ORDER_STATUSES = ["aguardando_arquivo", "arte", "aprovacao_arte", "producao", "acabamento", "pronto", "entregue", "cancelado"] as const;
const QUOTE_STATUSES = ["rascunho", "enviado", "aprovado", "recusado"] as const;

// Itens: o total de cada linha e do documento é sempre calculado aqui, nunca confiado ao navegador
function parseItems(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, "Adicione ao menos um item.");
  return raw.map((it: any, i: number) => {
    const description = str(it.description, 300);
    if (!description) throw new HttpError(400, "Todo item precisa de descrição.");
    const quantity = Math.max(0, num(it.quantity, 1)), unitPrice = Math.max(0, num(it.unitPrice));
    return { sortOrder: i, productId: str(it.productId, 36), description, quantity, unitPrice, total: Math.round(quantity * unitPrice * 100) / 100 };
  });
}
const sumItems = (items: { total: number }[]) => Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;

// ── Orçamentos ───────────────────────────────────────────────────────────────
const quoteInclude = { customer: { select: { id: true, name: true, company: true, phone: true } }, items: { orderBy: { sortOrder: "asc" as const } } };

router.get("/quotes", ah(async (req, res) => {
  const q = str(req.query.q, 100), status = str(req.query.status, 20);
  const n = Number(q);
  res.json(await prisma.quote.findMany({
    where: { ...(status ? { status } : {}), ...(q ? { OR: [{ customer: { name: { contains: q } } }, ...(Number.isInteger(n) ? [{ number: n }] : [])] } : {}) },
    include: quoteInclude, orderBy: { createdAt: "desc" }, take: 300,
  }));
}));

router.get("/quotes/:id", ah(async (req, res) => {
  const q = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { ...quoteInclude, orders: { select: { id: true, number: true, status: true } }, attachments: true } });
  if (!q) throw new HttpError(404, "Orçamento não encontrado.");
  res.json(q);
}));

router.post("/quotes", ah(async (req, res) => {
  const b = req.body ?? {};
  if (!b.customerId) throw new HttpError(400, "Escolha o cliente.");
  const items = parseItems(b.items);
  const discount = Math.max(0, num(b.discount));
  const quote = await prisma.quote.create({
    data: {
      customerId: String(b.customerId), discount, total: Math.max(0, sumItems(items) - discount), notes: str(b.notes, 3000),
      validUntil: date(b.validUntil), createdById: req.user!.id, items: { create: items },
    },
    include: quoteInclude,
  });
  res.status(201).json(quote);
}));

router.put("/quotes/:id", ah(async (req, res) => {
  const b = req.body ?? {};
  const items = parseItems(b.items);
  const discount = Math.max(0, num(b.discount));
  const quote = await prisma.$transaction(async (tx) => {
    await tx.quoteItem.deleteMany({ where: { quoteId: req.params.id } });
    return tx.quote.update({
      where: { id: req.params.id },
      data: { customerId: b.customerId ? String(b.customerId) : undefined, discount, total: Math.max(0, sumItems(items) - discount), notes: str(b.notes, 3000), validUntil: date(b.validUntil), items: { create: items } },
      include: quoteInclude,
    });
  });
  res.json(quote);
}));

router.patch("/quotes/:id/status", ah(async (req, res) => {
  const status = String(req.body?.status);
  if (!(QUOTE_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Situação inválida.");
  res.json(await prisma.quote.update({ where: { id: req.params.id }, data: { status }, include: quoteInclude }));
}));

router.delete("/quotes/:id", ah(async (req, res) => {
  if (await prisma.order.count({ where: { quoteId: req.params.id } })) throw new HttpError(409, "Este orçamento já virou pedido e não pode ser excluído.");
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Aprova o orçamento e gera o pedido com os mesmos itens
router.post("/quotes/:id/order", ah(async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { id: req.params.id }, include: { items: { orderBy: { sortOrder: "asc" as const } } } });
  if (!quote) throw new HttpError(404, "Orçamento não encontrado.");
  if (await prisma.order.findFirst({ where: { quoteId: quote.id } })) throw new HttpError(409, "Este orçamento já virou pedido.");
  const order = await prisma.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: { status: "aprovado" } });
    const created = await tx.order.create({
      data: {
        customerId: quote.customerId, quoteId: quote.id, total: quote.total, notes: quote.notes, dueDate: date(req.body?.dueDate), createdById: req.user!.id,
        items: { create: quote.items.map((i, n) => ({ sortOrder: n, productId: i.productId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })) },
        events: { create: { status: "aguardando_arquivo", note: `Criado a partir do orçamento #${quote.number}`, userName: req.user!.name } },
      },
    });
    // os arquivos que o cliente mandou para este orçamento passam a valer também no pedido
    await tx.attachment.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: created.id } });
    await tx.note.updateMany({ where: { quoteId: quote.id, orderId: null }, data: { orderId: created.id } });
    return created;
  });
  res.status(201).json(order);
}));

// ── Pedidos ──────────────────────────────────────────────────────────────────
const orderInclude = { customer: { select: { id: true, name: true, company: true, phone: true } }, items: { orderBy: { sortOrder: "asc" as const } }, _count: { select: { attachments: true } } };

router.get("/orders", ah(async (req, res) => {
  const q = str(req.query.q, 100), status = str(req.query.status, 30);
  const n = Number(q);
  res.json(await prisma.order.findMany({
    where: {
      ...(status === "abertos" ? { status: { notIn: ["entregue", "cancelado"] } } : status ? { status } : {}),
      ...(q ? { OR: [{ customer: { name: { contains: q } } }, ...(Number.isInteger(n) ? [{ number: n }] : [])] } : {}),
    },
    include: orderInclude, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 400,
  }));
}));

router.get("/orders/:id", ah(async (req, res) => {
  const o = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { customer: true, items: { orderBy: { sortOrder: "asc" as const } }, payments: { orderBy: { createdAt: "desc" } }, events: { orderBy: { createdAt: "desc" } }, attachments: { orderBy: { createdAt: "desc" } }, quote: { select: { id: true, number: true } } },
  });
  if (!o) throw new HttpError(404, "Pedido não encontrado.");
  res.json(o);
}));

router.post("/orders", ah(async (req, res) => {
  const b = req.body ?? {};
  if (!b.customerId) throw new HttpError(400, "Escolha o cliente.");
  const items = parseItems(b.items);
  const total = sumItems(items);
  const entry = Math.min(Math.max(0, num(b.paid)), total); // entrada já recebida: vira o primeiro pagamento do pedido
  const order = await prisma.order.create({
    data: {
      customerId: String(b.customerId), total, paid: entry, ...(entry > 0 ? { payments: { create: { amount: entry, note: "Entrada", userName: req.user!.name } } } : {}), priority: b.priority === "urgente" ? "urgente" : "normal",
      deliveryType: b.deliveryType === "entrega" ? "entrega" : "retirada", dueDate: date(b.dueDate), notes: str(b.notes, 3000), createdById: req.user!.id,
      items: { create: items }, events: { create: { status: "aguardando_arquivo", note: "Pedido criado", userName: req.user!.name } },
    },
    include: orderInclude,
  });
  res.status(201).json(order);
}));

router.put("/orders/:id", ah(async (req, res) => {
  const b = req.body ?? {};
  const data: any = {
    priority: b.priority === "urgente" ? "urgente" : "normal", deliveryType: b.deliveryType === "entrega" ? "entrega" : "retirada",
    dueDate: date(b.dueDate), notes: str(b.notes, 3000),
  };
  if (Array.isArray(b.items)) {
    const items = parseItems(b.items);
    data.total = sumItems(items);
    const cur = await prisma.order.findUnique({ where: { id: req.params.id }, select: { paid: true } });
    if (cur && data.total < Number(cur.paid)) throw new HttpError(400, "O novo total fica menor que o valor já recebido. Ajuste os pagamentos antes de reduzir os itens.");
    const o = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: req.params.id } });
      return tx.order.update({ where: { id: req.params.id }, data: { ...data, items: { create: items } }, include: orderInclude });
    });
    return res.json(o);
  }
  res.json(await prisma.order.update({ where: { id: req.params.id }, data, include: orderInclude }));
}));

router.patch("/orders/:id/status", ah(async (req, res) => {
  const status = String(req.body?.status);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Etapa inválida.");
  const prev = await prisma.order.findUnique({ where: { id: req.params.id }, select: { status: true } });
  if (!prev) throw new HttpError(404, "Pedido não encontrado.");
  const o = await prisma.order.update({
    where: { id: req.params.id },
    data: { status, deliveredAt: status === "entregue" ? new Date() : null, events: { create: { status, note: str(req.body?.note, 500), userName: req.user!.name } } },
    include: orderInclude,
  });
  await syncOrderServiceRecords(o.id, prev.status, status, req.user!.name); // entregue → entra no registro de serviços

  // aviso opcional ao cliente (a etapa já foi gravada mesmo se o envio falhar)
  let notified: boolean | null = null, notifyError: string | null = null;
  if (req.body?.notify && str(req.body?.message, 3000)) {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: o.customer.id }, select: { phone: true } });
      await sendText(customer?.phone, str(req.body.message, 3000)!);
      notified = true;
      await prisma.orderEvent.create({ data: { orderId: o.id, status, note: "Cliente avisado pelo WhatsApp", userName: req.user!.name } });
    } catch (e) { notified = false; notifyError = (e as Error).message; }
  }
  res.json({ ...o, notified, notifyError });
}));

router.delete("/orders/:id", ah(async (req, res) => {
  if (req.user!.role !== "admin") throw new HttpError(403, "Só o administrador exclui pedidos. Prefira cancelar.");
  await prisma.order.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Arquivos ─────────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 10 } });
const fileSelect = { id: true, name: true, mime: true, size: true, kind: true, aiEnabled: true, uploadedBy: true, createdAt: true, orderId: true, customerId: true, quoteId: true, conversationId: true };

router.get("/files", ah(async (req, res) => {
  const q = str(req.query.q, 100), kind = str(req.query.kind, 20);
  const cid = req.query.customerId ? String(req.query.customerId) : null;
  const where: any = {
    ...(kind ? { kind } : {}), ...(req.query.orderId ? { orderId: String(req.query.orderId) } : {}), ...(req.query.quoteId ? { quoteId: String(req.query.quoteId) } : {}),
    // arquivos do cliente = os cadastrados nele + os que ele mandou pelo WhatsApp
    ...(cid ? { OR: [{ customerId: cid }, { conversation: { customerId: cid } }] } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };
  const rows = await prisma.attachment.findMany({
    where, orderBy: { createdAt: "desc" }, take: 300,
    select: { ...fileSelect, extractedText: false, customer: { select: { name: true } }, order: { select: { number: true } }, quote: { select: { number: true } } },
  });
  // diz se a IA conseguiu ler o conteúdo, sem mandar o texto inteiro
  const readable = new Set((await prisma.attachment.findMany({ where: { id: { in: rows.map((r) => r.id) }, extractedText: { not: null } }, select: { id: true } })).map((r) => r.id));
  // arquivo que o cliente mandou pelo WhatsApp (o resto foi produzido/enviado pela gráfica)
  const fromClient = new Set((await prisma.wppMessage.findMany({ where: { attachmentId: { in: rows.map((r) => r.id) }, fromRole: "client" }, select: { attachmentId: true } })).map((m) => m.attachmentId));
  res.json(rows.map((r) => ({ ...r, readable: readable.has(r.id), fromClient: fromClient.has(r.id) })));
}));

router.post("/files", upload.array("files", 10), ah(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, "Selecione ao menos um arquivo.");
  const b = req.body ?? {};
  const kind = ["order", "customer", "quote", "knowledge"].includes(b.kind) ? b.kind : b.orderId ? "order" : b.customerId ? "customer" : "knowledge";
  const saved = [];
  for (const f of files) {
    saved.push(await saveAttachment({
      buffer: f.buffer, name: f.originalname, mime: f.mimetype, kind, uploadedBy: req.user!.name, aiEnabled: b.aiEnabled !== "false",
      orderId: str(b.orderId, 36), quoteId: str(b.quoteId, 36), customerId: str(b.customerId, 36),
    }));
  }
  res.status(201).json(saved.map((s) => ({ ...s, extractedText: undefined, readable: !!s.extractedText })));
}));

router.get("/files/:id/download", ah(async (req, res) => {
  const f = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!f || !fs.existsSync(filePath(f.storedName))) throw new HttpError(404, "Arquivo não encontrado.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(filePath(f.storedName), (err) => { if (err && !res.headersSent) res.status(500).end(); });
}));

router.get("/files/:id/text", ah(async (req, res) => {
  const f = await prisma.attachment.findUnique({ where: { id: req.params.id }, select: { name: true, extractedText: true } });
  if (!f) throw new HttpError(404, "Arquivo não encontrado.");
  res.json({ name: f.name, text: f.extractedText });
}));

router.patch("/files/:id", ah(async (req, res) => {
  const data: any = {};
  if (req.body?.aiEnabled !== undefined) data.aiEnabled = !!req.body.aiEnabled;
  if (str(req.body?.name, 255)) data.name = str(req.body.name, 255);
  // vínculo com orçamento/pedido (null desvincula); o arquivo continua no cliente e na conversa
  for (const k of ["quoteId", "orderId"] as const) {
    if (req.body?.[k] === undefined) continue;
    const id = req.body[k] === null ? null : str(req.body[k], 36);
    if (id && !(k === "quoteId" ? await prisma.quote.findUnique({ where: { id }, select: { id: true } }) : await prisma.order.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, k === "quoteId" ? "Orçamento não encontrado." : "Pedido não encontrado.");
    data[k] = id;
  }
  res.json(await prisma.attachment.update({ where: { id: req.params.id }, data, select: fileSelect }));
}));

router.delete("/files/:id", ah(async (req, res) => {
  const f = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!f) throw new HttpError(404, "Arquivo não encontrado.");
  await prisma.attachment.delete({ where: { id: f.id } });
  fs.rm(filePath(f.storedName), { force: true }, () => {});
  res.json({ ok: true });
}));

// ── Indicadores ──────────────────────────────────────────────────────────────
router.get("/dashboard", ah(async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const soon = new Date(now.getTime() + 3 * 86400000);
  const [byStatus, monthOrders, lateOrders, dueSoon, openQuotes, waiting, active, customers, files] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: monthStart }, status: { not: "cancelado" } }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    prisma.order.count({ where: { dueDate: { lt: now }, status: { notIn: ["pronto", "entregue", "cancelado"] } } }),
    prisma.order.findMany({ where: { dueDate: { gte: now, lte: soon }, status: { notIn: ["pronto", "entregue", "cancelado"] } }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 8 }),
    prisma.quote.count({ where: { status: { in: ["rascunho", "enviado"] } } }),
    prisma.wppConversation.count({ where: { status: "waiting" } }),
    prisma.wppConversation.count({ where: { status: "active" } }),
    prisma.customer.count({ where: { active: true } }),
    prisma.attachment.count(),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const received = Number(monthOrders._sum.paid ?? 0), total = Number(monthOrders._sum.total ?? 0);
  res.json({
    counts, openOrders: ORDER_STATUSES.filter((s) => !["entregue", "cancelado"].includes(s)).reduce((n, s) => n + (counts[s] ?? 0), 0),
    month: { orders: monthOrders._count._all, revenue: total, received, toReceive: Math.max(0, total - received) },
    lateOrders, dueSoon, openQuotes, waiting, active, customers, files,
  });
}));

// ── Indicadores detalhados (abas do painel) ──────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

router.get("/dashboard/insights", ah(async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const notOpen = ["pronto", "entregue", "cancelado"];

  const [records, company, items, lateList, receivables, quoteGroups, events, convWeek, convToday, newCustomers] = await Promise.all([
    prisma.serviceRecord.findMany({ where: { date: { gte: seriesStart } }, select: { date: true, customerName: true, description: true, total: true, cost: true, amountPaid: true, paymentMethod: true } }),
    prisma.companyProfile.findFirst({ select: { partners: true } }),
    prisma.orderItem.findMany({ where: { order: { createdAt: { gte: seriesStart }, status: { not: "cancelado" } } }, select: { description: true, quantity: true, total: true } }),
    prisma.order.findMany({ where: { dueDate: { lt: now }, status: { notIn: notOpen } }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 8 }),
    prisma.order.findMany({ where: { status: { not: "cancelado" } }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.quote.groupBy({ by: ["status"], where: { createdAt: { gte: seriesStart } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.orderEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { order: { select: { number: true, customer: { select: { name: true } } } } } }),
    prisma.wppConversation.findMany({ where: { createdAt: { gte: weekAgo } }, select: { status: true, closedBy: true, attendantId: true, sectorId: true, createdAt: true, acceptedAt: true, queuedAt: true } }),
    prisma.wppConversation.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
  ]);

  // série de 6 meses (serviços)
  const months: { key: string; label: string; revenue: number; cost: number; profit: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: ymKey(d), label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), revenue: 0, cost: 0, profit: 0 });
  }
  const sum = (from: Date, to?: Date) => {
    let revenue = 0, cost = 0, received = 0, count = 0, unpriced = 0;
    for (const r of records) {
      if (r.date < from || (to && r.date >= to)) continue;
      const t = Number(r.total); count++;
      if (t <= 0) { unpriced++; continue; }
      revenue += t; cost += Number(r.cost); received += Number(r.amountPaid);
    }
    return { revenue: r2(revenue), cost: r2(cost), profit: r2(revenue - cost), received: r2(received), toReceive: r2(Math.max(0, revenue - received)), count, unpriced };
  };
  const byMethod: Record<string, number> = {}, custMap = new Map<string, { name: string; total: number; count: number }>();
  for (const r of records) {
    const t = Number(r.total);
    const m = months.find((x) => x.key === ymKey(r.date));
    if (m && t > 0) { m.revenue += t; m.cost += Number(r.cost); }
    if (r.date >= monthStart && Number(r.amountPaid) > 0) byMethod[r.paymentMethod ?? "outro"] = (byMethod[r.paymentMethod ?? "outro"] ?? 0) + Number(r.amountPaid);
    if (t > 0) { const c = custMap.get(r.customerName) ?? { name: r.customerName, total: 0, count: 0 }; c.total += t; c.count++; custMap.set(r.customerName, c); }
  }
  for (const m of months) { m.revenue = r2(m.revenue); m.cost = r2(m.cost); m.profit = r2(m.revenue - m.cost); }

  const prodMap = new Map<string, { name: string; quantity: number; total: number }>();
  for (const i of items) { const k = i.description.replace(/\s+/g, " ").trim(); const p = prodMap.get(k) ?? { name: k, quantity: 0, total: 0 }; p.quantity += Number(i.quantity); p.total += Number(i.total); prodMap.set(k, p); }

  const open = receivables.filter((o) => Number(o.total) - Number(o.paid) > 0.005 && o.status !== "cancelado").slice(0, 8)
    .map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, total: Number(o.total), paid: Number(o.paid), status: o.status }));

  const q = Object.fromEntries(quoteGroups.map((g) => [g.status, { count: g._count._all, total: Number(g._sum.total ?? 0) }]));
  const decided = (q.aprovado?.count ?? 0) + (q.recusado?.count ?? 0);
  const quoteCount = quoteGroups.reduce((n, g) => n + g._count._all, 0);

  // atendimento (últimos 7 dias)
  const waits = convWeek.filter((c) => c.acceptedAt).map((c) => (c.acceptedAt!.getTime() - c.queuedAt.getTime()) / 60000);
  const perDay: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    perDay.push({ label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), count: convWeek.filter((c) => c.createdAt >= d && c.createdAt < new Date(d.getTime() + 86400000)).length });
  }
  const closed = convWeek.filter((c) => c.status === "closed");
  const botOnly = closed.filter((c) => !c.attendantId).length;

  const profit = (from: Date, to?: Date) => sum(from, to).profit;
  let partners: { name: string; percent: number }[] = [];
  try { if (Array.isArray(company?.partners)) partners = company!.partners as typeof partners; } catch { /* sem sócios */ }
  const cur = sum(monthStart), prev = sum(prevStart, monthStart);

  res.json({
    finance: { current: cur, previous: prev, partners: partners.map((p) => ({ ...p, amount: r2((profit(monthStart) * p.percent) / 100) })), series: months, byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount: r2(amount) })).sort((a, b) => b.amount - a.amount) },
    topCustomers: [...custMap.values()].sort((a, b) => b.total - a.total).slice(0, 6).map((c) => ({ ...c, total: r2(c.total) })),
    topProducts: [...prodMap.values()].sort((a, b) => b.total - a.total).slice(0, 6).map((p) => ({ ...p, total: r2(p.total) })),
    lateList: lateList.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, dueDate: o.dueDate, status: o.status })),
    receivables: open,
    quotes: { count: quoteCount, approved: q.aprovado?.count ?? 0, refused: q.recusado?.count ?? 0, pending: (q.rascunho?.count ?? 0) + (q.enviado?.count ?? 0), pendingTotal: r2((q.rascunho?.total ?? 0) + (q.enviado?.total ?? 0)), conversion: decided ? Math.round(((q.aprovado?.count ?? 0) / decided) * 100) : null },
    recent: events.map((e) => ({ id: e.id, status: e.status, note: e.note, userName: e.userName, createdAt: e.createdAt, number: e.order.number, customer: e.order.customer.name })),
    wpp: { today: convToday, week: convWeek.length, resolvedByBot: botOnly, closed: closed.length, avgWaitMin: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null, perDay },
    newCustomers,
  });
}));
