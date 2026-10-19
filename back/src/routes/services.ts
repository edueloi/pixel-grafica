// Registro de serviços realizados (controle de venda, custo, lucro e pagamento): lista, lançamento manual,
// divisão do lucro entre os sócios e importação de planilha (com prévia e desfazer).
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { prisma } from "../db.js";
import { requireRole } from "../auth.js";
import { ah, HttpError, str, date } from "./util.js";
import { strip } from "../lib/text.js";
import { parseSheet, normalizeInput, duplicateKey, MAX_IMPORT_ROWS, FIELD_LABEL, TEMPLATE_CSV, type ParsedRow } from "../lib/serviceImport.js";

export const router = Router();
router.use("/services", requireRole("atendente", "financeiro"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const LIMIT = 3000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Vincula ao cliente cadastrado quando o nome bate (sem acento/maiúscula); senão fica só o nome digitado
async function customerIndex() {
  const all = await prisma.customer.findMany({ where: { active: true }, select: { id: true, name: true } });
  const map = new Map<string, string>();
  for (const c of all) if (!map.has(strip(c.name))) map.set(strip(c.name), c.id);
  return (name: string) => map.get(strip(name)) ?? null;
}

// ── Sócios e divisão do lucro (ex.: Renato 30% / Gui 70%) ───────────────────
export interface Partner { name: string; percent: number }
async function getPartners(): Promise<Partner[]> {
  const raw = (await prisma.companyProfile.findFirst({ select: { partners: true } }))?.partners;
  return Array.isArray(raw) ? (raw as any[]).filter((p) => p?.name).map((p) => ({ name: String(p.name), percent: Number(p.percent) || 0 })) : [];
}

router.get("/services/partners", ah(async (_req, res) => { res.json({ partners: await getPartners() }); }));

router.put("/services/partners", requireRole(), ah(async (req, res) => {
  const list = Array.isArray(req.body?.partners) ? req.body.partners : [];
  const partners: Partner[] = list.map((p: any) => ({ name: str(p?.name, 40) ?? "", percent: r2(Number(p?.percent)) }));
  if (partners.some((p) => !p.name)) throw new HttpError(400, "Todo sócio precisa de um nome.");
  if (partners.some((p) => !Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100)) throw new HttpError(400, "A porcentagem de cada sócio vai de 0 a 100.");
  if (new Set(partners.map((p) => strip(p.name))).size !== partners.length) throw new HttpError(400, "Há dois sócios com o mesmo nome.");
  if (partners.length && Math.abs(partners.reduce((s, p) => s + p.percent, 0) - 100) > 0.01) throw new HttpError(400, "As porcentagens precisam somar 100%.");
  const cur = (await prisma.companyProfile.findFirst()) ?? (await prisma.companyProfile.create({ data: {} }));
  await prisma.companyProfile.update({ where: { id: cur.id }, data: { partners: partners as unknown as object[] } });
  res.json({ partners });
}));

// ── Lista + resumo financeiro ────────────────────────────────────────────────
router.get("/services", ah(async (req, res) => {
  const from = date(req.query.from), to = date(req.query.to);
  const q = str(req.query.q, 100), status = str(req.query.status, 10);
  const where: any = {
    ...(from || to ? { date: { ...(from ? { gte: new Date(from.getFullYear(), from.getMonth(), from.getDate()) } : {}), ...(to ? { lt: new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) } : {}) } } : {}),
    // pago = quitado; pendente = tem valor e falta receber; orcar = ainda sem valor de venda
    ...(status === "pago" ? { paid: true } : status === "pendente" ? { paid: false, total: { gt: 0 } } : status === "orcar" ? { total: 0 } : {}),
    ...(q ? { OR: [{ customerName: { contains: q } }, { description: { contains: q } }, { category: { contains: q } }] } : {}),
  };
  const [items, agg, pending, unpriced, partners] = await Promise.all([
    prisma.serviceRecord.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: LIMIT }),
    prisma.serviceRecord.aggregate({ where, _sum: { total: true, cost: true, amountPaid: true }, _count: { _all: true } }),
    prisma.serviceRecord.count({ where: { AND: [where, { paid: false, total: { gt: 0 } }] } }),
    prisma.serviceRecord.count({ where: { AND: [where, { total: 0 }] } }),
    getPartners(),
  ]);
  const total = Number(agg._sum.total ?? 0), cost = Number(agg._sum.cost ?? 0), received = Number(agg._sum.amountPaid ?? 0);
  res.json({
    items, partners, truncated: agg._count._all > LIMIT,
    summary: { count: agg._count._all, total: r2(total), cost: r2(cost), profit: r2(total - cost), received: r2(received), toReceive: r2(Math.max(0, total - received)), pendingCount: pending, unpricedCount: unpriced },
  });
}));

router.get("/services/:id", ah(async (req, res) => {
  const r = await prisma.serviceRecord.findUnique({ where: { id: req.params.id } });
  if (!r) throw new HttpError(404, "Serviço não encontrado.");
  res.json({ ...r, partners: await getPartners() });
}));

// ── CRUD ─────────────────────────────────────────────────────────────────────
const bodyToData = async (b: any) => {
  const { value, errors } = normalizeInput({ ...b, date: b.date ? new Date(String(b.date).length === 10 ? `${b.date}T12:00:00` : b.date).toISOString() : null });
  if (errors.length) throw new HttpError(400, errors[0]);
  const find = await customerIndex();
  return { ...value, date: new Date(value.date!), customerId: str(b.customerId, 36) ?? find(value.customerName) };
};

router.post("/services", ah(async (req, res) => {
  const data = await bodyToData(req.body ?? {});
  res.status(201).json(await prisma.serviceRecord.create({ data: { ...data, source: "manual", createdBy: req.user!.name } }));
}));

router.put("/services/:id", ah(async (req, res) => {
  const data = await bodyToData(req.body ?? {});
  res.json(await prisma.serviceRecord.update({ where: { id: req.params.id }, data }));
}));

router.delete("/services/:id", ah(async (req, res) => {
  await prisma.serviceRecord.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ── Importação ───────────────────────────────────────────────────────────────
router.get("/services-template.csv", ah(async (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=modelo-servicos.csv");
  res.send("﻿" + TEMPLATE_CSV); // BOM: o Excel abre com acentos certos
}));

const sums = (rows: { total: number; cost: number; amountPaid: number }[]) => ({
  sum: r2(rows.reduce((s, r) => s + r.total, 0)), cost: r2(rows.reduce((s, r) => s + r.cost, 0)), paid: r2(rows.reduce((s, r) => s + r.amountPaid, 0)),
});

// 1) Prévia: lê e valida, mas NÃO grava nada
router.post("/services/import/preview", upload.single("file"), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Escolha uma planilha para importar.");
  let parsed;
  const partners = await getPartners();
  try { parsed = parseSheet(req.file.buffer, req.file.originalname, partners.map((p) => p.name)); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const { rows, columns, truncated, missing } = parsed;
  if (!rows.length) throw new HttpError(400, "Não encontrei nenhuma linha de serviço depois do cabeçalho.");

  // duplicados: já existe no sistema o mesmo dia + cliente + serviço + valor
  const dates = rows.filter((r) => r.date).map((r) => new Date(r.date!).getTime());
  if (dates.length) {
    const existing = await prisma.serviceRecord.findMany({ where: { date: { gte: new Date(Math.min(...dates) - 86400e3), lte: new Date(Math.max(...dates) + 86400e3) } }, select: { date: true, customerName: true, description: true, total: true } });
    const keys = new Set(existing.map((e) => duplicateKey({ ...e, total: Number(e.total) })));
    for (const r of rows) r.duplicate = !r.errors.length && keys.has(duplicateKey(r));
  }
  const valid = rows.filter((r) => !r.errors.length && !r.duplicate);
  res.json({
    fileName: req.file.originalname, rows, truncated, limit: MAX_IMPORT_ROWS,
    columns: columns.map((c) => ({ header: c.header, field: c.field, label: c.field ? FIELD_LABEL[c.field] : null })), missing: missing.map((f) => FIELD_LABEL[f]),
    summary: {
      total: rows.length, valid: valid.length, errors: rows.filter((r) => r.errors.length).length, duplicates: rows.filter((r) => r.duplicate).length,
      unpriced: valid.filter((r) => r.total === 0).length, ...sums(valid),
    },
  });
}));

// 2) Confirmação: valida DE NOVO no servidor, pula erros e duplicados e grava com um código de lote (permite desfazer)
router.post("/services/import", ah(async (req, res) => {
  const incoming: ParsedRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!incoming.length) throw new HttpError(400, "Nada para importar.");
  if (incoming.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Importe no máximo ${MAX_IMPORT_ROWS} linhas por vez.`);
  const skipDuplicates = req.body?.skipDuplicates !== false;

  const checked = incoming.map((r) => normalizeInput(r as any));
  const good = checked.filter((c) => !c.errors.length).map((c) => c.value);
  const skippedErrors = checked.length - good.length;

  let toSave = good, skippedDuplicates = 0;
  if (skipDuplicates && good.length) {
    const times = good.map((r) => new Date(r.date!).getTime());
    const existing = await prisma.serviceRecord.findMany({ where: { date: { gte: new Date(Math.min(...times) - 86400e3), lte: new Date(Math.max(...times) + 86400e3) } }, select: { date: true, customerName: true, description: true, total: true } });
    const keys = new Set(existing.map((e) => duplicateKey({ ...e, total: Number(e.total) })));
    toSave = good.filter((r) => !keys.has(duplicateKey(r)));
    skippedDuplicates = good.length - toSave.length;
  }
  if (!toSave.length) throw new HttpError(400, "Nenhuma linha nova para importar (tudo com erro ou já cadastrado).");

  const find = await customerIndex();
  const batch = crypto.randomUUID();
  await prisma.serviceRecord.createMany({
    data: toSave.map((r) => ({ ...r, date: new Date(r.date!), customerId: find(r.customerName), source: "importacao", importBatch: batch, createdBy: req.user!.name })),
  });
  res.status(201).json({ batch, imported: toSave.length, skippedErrors, skippedDuplicates, unpriced: toSave.filter((r) => r.total === 0).length, ...sums(toSave) });
}));

// 3) Desfazer uma importação inteira
router.delete("/services/import/:batch", ah(async (req, res) => {
  const r = await prisma.serviceRecord.deleteMany({ where: { importBatch: req.params.batch, source: "importacao" } });
  if (!r.count) throw new HttpError(404, "Importação não encontrada (já desfeita?).");
  res.json({ ok: true, removed: r.count });
}));
