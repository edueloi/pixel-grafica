// Site público da gráfica (/pagina-teste-site): catálogo, ofertas, galeria, orçamento pelo site e banners.
// A parte pública não exige login; a de administração (fotos dos produtos e banners) exige.
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { prisma } from "../db.js";
import { ah, HttpError, str, num } from "./util.js";
import { requireRole } from "../auth.js";
import { filePath } from "../lib/files.js";
import { saveSiteImage } from "../lib/images.js";
import { quoteWithOffer, parseTiers, parseOptions, parseVariants, quoteSizes } from "../lib/pricing.js";
import { digits, normalizePhone, samePhone } from "../lib/text.js";
import * as wa from "../wa/index.js";
import { parseAttendants } from "../wa/conversations.js";

export const publicSite = Router();
export const adminSite = Router();

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const removeFile = (name?: string | null) => { if (name) fs.rm(filePath(name), { force: true }, () => {}); };
const sendStored = (res: any, name: string, type = "image/webp") => {
  const p = filePath(name);
  if (!fs.existsSync(p)) throw new HttpError(404, "Imagem não encontrada.");
  res.type(type).set("Cache-Control", "public, max-age=86400").sendFile(p);
};

// ── Limite simples contra abuso nos formulários públicos ─────────────────────
const hits = new Map<string, number[]>();
function tooMany(ip: string, max = 6, windowMs = 60 * 60_000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(ip, list); return true; }
  hits.set(ip, [...list, now]);
  return false;
}

// ── Aviso à equipe: pedido novo chega no WhatsApp dos atendentes, sem esperar o cliente escrever ─────
async function notifyTeam(text: string) {
  try {
    if (wa.getSessionInfo().status !== "connected") return;
    const sectors = await prisma.wppSector.findMany({ where: { isActive: true } });
    const budget = sectors.filter((x) => /or[cç]amento|venda/i.test(x.name));
    const people = (budget.length ? budget : sectors).flatMap((x) => parseAttendants(x.attendants)).filter((a) => a.available);
    const phones = [...new Set(people.map((a) => a.phone))];
    for (const p of phones) await wa.sendMessage(p, text).catch(() => false);
  } catch (e) { console.error("[site] não consegui avisar a equipe:", e); }
}

// ── Vitrine ──────────────────────────────────────────────────────────────────
const productSelect = { images: { orderBy: { sortOrder: "asc" as const }, select: { id: true } } };

function summary(p: any) {
  const offer = Number(p.offerPrice) > 0 && p.pricingMode !== "package" && Number(p.offerPrice) < Number(p.price) ? Number(p.offerPrice) : null;
  return {
    id: p.id, name: p.name, category: p.category, unit: p.unit, pricingMode: p.pricingMode, minQty: p.minQty, leadTime: p.leadTime,
    price: Number(p.price), offerPrice: offer, featured: !!p.featured, priceTiers: parseTiers(p.priceTiers), options: parseOptions(p.options), variants: parseVariants(p.variants),
    description: p.description ? String(p.description).replace(/\s+/g, " ").slice(0, 200) : null,
    images: p.images.map((i: any) => i.id),
  };
}

publicSite.get("/site/home", ah(async (_req, res) => {
  const [company, banners, products, popular, catalogs] = await Promise.all([
    prisma.companyProfile.findFirst(),
    prisma.siteBanner.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.product.findMany({ where: { active: true, showOnSite: true }, include: productSelect, orderBy: [{ featured: "desc" }, { category: "asc" }, { name: "asc" }] }),
    prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { not: null }, order: { status: { not: "cancelado" } } }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 12 }),
    prisma.attachment.findMany({ where: { kind: "catalog" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, size: true }, take: 20 }),
  ]);
  const visible = new Set(products.map((p) => p.id));
  res.json({
    company: company && {
      name: company.name, tagline: company.tagline, phone: company.phone, email: company.email, instagram: company.instagram, website: company.website,
      address: company.address, hours: company.hours, aboutText: company.aboutText, payment: company.payment, delivery: company.delivery, artService: company.artService,
      whatsapp: normalizePhone(company.phone ?? ""), hasLogo: !!company.logoFile, logoVersion: company.updatedAt.getTime(),
    },
    banners: banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, buttonText: b.buttonText, buttonUrl: b.buttonUrl, hasImage: !!b.storedName })),
    products: products.map(summary),
    popular: popular.map((r) => r.productId!).filter((id) => visible.has(id)),
    catalogs,
  });
}));

publicSite.get("/site/products/:id", ah(async (req, res) => {
  const p = await prisma.product.findFirst({ where: { id: req.params.id, active: true, showOnSite: true }, include: productSelect });
  if (!p) throw new HttpError(404, "Produto não encontrado.");
  const related = await prisma.product.findMany({ where: { active: true, showOnSite: true, category: p.category, id: { not: p.id } }, include: productSelect, take: 4 });
  res.json({ ...summary(p), description: p.description, howItWorks: p.howItWorks, related: related.map(summary) });
}));

publicSite.get("/site/images/:id", ah(async (req, res) => {
  const img = await prisma.productImage.findUnique({ where: { id: req.params.id } });
  if (!img) throw new HttpError(404, "Imagem não encontrada.");
  sendStored(res, req.query.size === "thumb" ? img.thumbName : img.storedName);
}));

publicSite.get("/site/banner/:id", ah(async (req, res) => {
  const b = await prisma.siteBanner.findUnique({ where: { id: req.params.id } });
  if (!b?.storedName) throw new HttpError(404, "Banner sem imagem.");
  sendStored(res, b.storedName);
}));

publicSite.get("/site/catalogs/:id", ah(async (req, res) => {
  const f = await prisma.attachment.findFirst({ where: { id: req.params.id, kind: "catalog" } });
  if (!f || !fs.existsSync(filePath(f.storedName))) throw new HttpError(404, "Catálogo não encontrado.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(filePath(f.storedName));
}));

// Preço de uma quantidade (mesma conta do orçamento e da IA, com a oferta)
publicSite.post("/site/price", ah(async (req, res) => {
  const p = await prisma.product.findFirst({ where: { id: String(req.body?.productId ?? ""), active: true, showOnSite: true } });
  if (!p) throw new HttpError(404, "Produto não encontrado.");
  const variants = parseVariants(p.variants);
  if (variants?.sizes.length && req.body?.sizes && typeof req.body.sizes === "object") {
    const s = quoteSizes(p, variants, req.body.sizes);
    return res.json(s.ok ? { ok: true, unitPrice: s.unitPrice, total: s.total, quantity: s.qty, lines: s.lines } : { ok: false, error: s.error });
  }
  const qty = Math.round(num(req.body?.quantity));
  const r = quoteWithOffer(p, qty);
  if (r.ok) return res.json({ ok: true, unitPrice: r.unitPrice, total: r.total, offerApplied: !!r.offerApplied });
  const tiers = parseTiers(p.priceTiers);
  res.json({
    ok: false,
    error: p.pricingMode === "package" && qty > 0
      ? `Para este produto temos as quantidades: ${tiers.map((t) => `${t.minQty.toLocaleString("pt-BR")} un (${brl(t.price)})`).join(", ")}. Outra quantidade? Peça um orçamento e a gente confirma.`
      : r.error,
  });
}));

// Pedido de orçamento pelo site: cria cliente (se for novo) e um rascunho no painel; devolve o link do WhatsApp já com o resumo
publicSite.post("/site/quote-request", ah(async (req, res) => {
  const b = req.body ?? {};
  if (b.website) return res.json({ ok: true }); // campo-isca: robô preenche, pessoa não
  if (tooMany(String(req.ip), 6)) throw new HttpError(429, "Muitos pedidos em pouco tempo. Tente de novo mais tarde ou fale pelo WhatsApp.");
  const name = str(b.name, 120), phone = normalizePhone(String(b.phone ?? ""));
  if (!name) throw new HttpError(400, "Informe o seu nome.");
  if (digits(phone).length < 12) throw new HttpError(400, "Informe um WhatsApp com DDD.");
  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  if (!rawItems.length) throw new HttpError(400, "Adicione ao menos um produto.");

  const products = await prisma.product.findMany({ where: { id: { in: rawItems.map((i: any) => String(i?.productId)) }, active: true, showOnSite: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: { productId: string; description: string; quantity: number; unitPrice: number; total: number; priced: boolean }[] = [];
  for (const it of rawItems) {
    const p = byId.get(String(it?.productId));
    const qty = Math.round(num(it?.quantity));
    const variants = p ? parseVariants(p.variants) : null;
    const note = str(it?.note, 150);
    if (p && variants?.sizes.length && it?.sizes && typeof it.sizes === "object") {
      // roupa: uma linha por tamanho (cada um com o acréscimo do seu tamanho) e a cor escolhida
      const sq = quoteSizes(p, variants, it.sizes);
      const color = variants.colors.find((c) => c.name === String(it?.color ?? ""))?.name;
      if (sq.ok && sq.qty <= 100_000) {
        for (const l of sq.lines) lines.push({ productId: p.id, quantity: l.quantity, priced: true, unitPrice: l.unitPrice, total: l.total, description: `${p.name}${color ? ` — Cor: ${color}` : ""} — Tam. ${l.size}${note ? ` — ${note}` : ""}` });
      } else continue;
    } else {
    if (!p || !(qty > 0) || qty > 10_000_000) continue;
    const r = quoteWithOffer(p, qty);
    lines.push({
      productId: p.id, quantity: qty, priced: r.ok, unitPrice: r.ok ? r.unitPrice : 0, total: r.ok ? r.total : 0,
      description: `${p.name}${note ? ` — ${note}` : ""}${r.ok ? "" : " (valor sob consulta)"}`,
    });
    }
    if (!p) continue;
    // acabamentos e serviços opcionais escolhidos: cada um vira uma linha própria, com o preço cadastrado no produto
    const chosen: string[] = Array.isArray(it?.extras) ? it.extras.map((x: unknown) => String(x)).slice(0, 12) : [];
    for (const opt of parseOptions(p.options).filter((o) => chosen.includes(o.name))) {
      lines.push({ productId: p.id, quantity: 1, priced: true, unitPrice: opt.price, total: opt.price, description: `${opt.kind === "servico" ? "Serviço" : "Acabamento"}: ${opt.name} (${p.name})` });
    }
  }
  if (!lines.length) throw new HttpError(400, "Os produtos escolhidos não estão mais disponíveis.");

  const last8 = digits(phone).slice(-8);
  const candidates = await prisma.customer.findMany({ where: { phone: { contains: last8 } }, take: 10 });
  const customer = candidates.find((c) => samePhone(c.phone, phone))
    ?? await prisma.customer.create({ data: { name, phone, email: str(b.email, 160) } });

  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const note = str(b.notes, 1000);
  const quote = await prisma.quote.create({
    data: {
      customerId: customer.id, status: "rascunho", source: "site", total,
      notes: `Pedido feito pelo site.${note ? ` Observações do cliente: ${note}` : ""}`,
      items: { create: lines.map((l, i) => ({ sortOrder: i, productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total })) },
    },
  });

  const company = await prisma.companyProfile.findFirst({ select: { phone: true, name: true } });
  const itemsText = lines.map((l) => `• ${l.quantity.toLocaleString("pt-BR")} × ${l.description}${l.priced ? ` — ${brl(l.total)}` : ""}`);
  // mensagem que o cliente manda à loja: já leva o número do pedido, o nome e o WhatsApp (o bot reconhece e entende o assunto)
  const text = [
    `Olá! Sou ${name}.`, `Fiz o pedido nº ${quote.number} pelo site (orçamento).`, ...itemsText,
    total > 0 ? `Total estimado: ${brl(total)}` : "", note ? `Observações: ${note}` : "", `Meu WhatsApp: ${phone.replace(/^55/, "")}`,
  ].filter(Boolean).join("\n");
  const shop = normalizePhone(company?.phone ?? "");
  const base = `${req.get("x-forwarded-proto") || req.protocol}://${req.get("host")}`;
  void notifyTeam(`🛒 *Novo pedido pelo site* nº ${quote.number}\n👤 ${name} · ${phone.replace(/^55/, "")}\n${itemsText.join("\n")}${total > 0 ? `\nTotal estimado: ${brl(total)}` : ""}${note ? `\nObs.: ${note}` : ""}\n\nAbrir no painel: ${base}/orcamentos/${quote.id}`);
  res.status(201).json({
    ok: true, number: quote.number, total, unpriced: lines.filter((l) => !l.priced).length,
    customer: { name, phone: phone.replace(/^55/, "") },
    items: lines.map((l) => ({ description: l.description, quantity: l.quantity, total: l.total, priced: l.priced })),
    whatsappUrl: shop ? `https://wa.me/${shop}?text=${encodeURIComponent(text)}` : null,
  });
}));

// ── Administração: fotos dos produtos ────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });

adminSite.post("/products/:id/images", requireRole("atendente"), upload.array("images", 10), ah(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new HttpError(400, "Escolha ao menos uma foto.");
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!p) throw new HttpError(404, "Produto não encontrado.");
  const count = await prisma.productImage.count({ where: { productId: p.id } });
  if (count + files.length > 20) throw new HttpError(400, "Cada produto aceita até 20 fotos.");
  let order = (await prisma.productImage.aggregate({ where: { productId: p.id }, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
  for (const f of files) {
    let saved;
    try { saved = await saveSiteImage(f.buffer); } catch (e: any) { throw new HttpError(400, `${f.originalname}: ${e.message}`); }
    await prisma.productImage.create({ data: { productId: p.id, name: f.originalname.slice(0, 255), ...saved, sortOrder: ++order } });
  }
  res.status(201).json(await prisma.productImage.findMany({ where: { productId: p.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sortOrder: true } }));
}));

adminSite.put("/products/:id/images/order", requireRole("atendente"), ah(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  await prisma.$transaction(ids.map((id, i) => prisma.productImage.updateMany({ where: { id, productId: req.params.id }, data: { sortOrder: i } })));
  res.json({ ok: true });
}));

adminSite.delete("/product-images/:id", requireRole("atendente"), ah(async (req, res) => {
  const img = await prisma.productImage.findUnique({ where: { id: req.params.id } });
  if (!img) throw new HttpError(404, "Foto não encontrada.");
  await prisma.productImage.delete({ where: { id: img.id } });
  removeFile(img.storedName); if (img.thumbName !== img.storedName) removeFile(img.thumbName);
  res.json({ ok: true });
}));

// ── Administração: banners do carrossel ──────────────────────────────────────
const bannerData = (b: any) => ({
  title: str(b.title, 160) ?? (() => { throw new HttpError(400, "Informe o título do banner."); })(),
  subtitle: str(b.subtitle, 300), buttonText: str(b.buttonText, 60), buttonUrl: str(b.buttonUrl, 300),
  active: b.active === undefined ? true : b.active === true || b.active === "true",
});
const bannerOut = (b: any) => ({ id: b.id, title: b.title, subtitle: b.subtitle, buttonText: b.buttonText, buttonUrl: b.buttonUrl, active: b.active, sortOrder: b.sortOrder, hasImage: !!b.storedName });

adminSite.get("/site-admin/banners", requireRole("atendente"), ah(async (_req, res) => {
  res.json((await prisma.siteBanner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).map(bannerOut));
}));

adminSite.post("/site-admin/banners", requireRole(), upload.single("image"), ah(async (req, res) => {
  const data = bannerData(req.body ?? {});
  const saved = req.file ? await saveSiteImage(req.file.buffer, { maxWidth: 1920, maxHeight: 900, thumb: false }).catch((e) => { throw new HttpError(400, e.message); }) : null;
  const order = ((await prisma.siteBanner.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
  res.status(201).json(bannerOut(await prisma.siteBanner.create({ data: { ...data, storedName: saved?.storedName ?? null, sortOrder: order } })));
}));

adminSite.put("/site-admin/banners/order", requireRole(), ah(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  await prisma.$transaction(ids.map((id, i) => prisma.siteBanner.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
}));

adminSite.put("/site-admin/banners/:id", requireRole(), upload.single("image"), ah(async (req, res) => {
  const cur = await prisma.siteBanner.findUnique({ where: { id: req.params.id } });
  if (!cur) throw new HttpError(404, "Banner não encontrado.");
  const data: any = bannerData(req.body ?? {});
  if (req.file) {
    const saved = await saveSiteImage(req.file.buffer, { maxWidth: 1920, maxHeight: 900, thumb: false }).catch((e) => { throw new HttpError(400, e.message); });
    data.storedName = saved.storedName; removeFile(cur.storedName);
  } else if (req.body?.removeImage === "true") { data.storedName = null; removeFile(cur.storedName); }
  res.json(bannerOut(await prisma.siteBanner.update({ where: { id: cur.id }, data })));
}));

adminSite.delete("/site-admin/banners/:id", requireRole(), ah(async (req, res) => {
  const cur = await prisma.siteBanner.findUnique({ where: { id: req.params.id } });
  if (!cur) throw new HttpError(404, "Banner não encontrado.");
  await prisma.siteBanner.delete({ where: { id: cur.id } });
  removeFile(cur.storedName);
  res.json({ ok: true });
}));
