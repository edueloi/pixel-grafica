// Autenticação, usuários, clientes e produtos.
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { signToken, requireAuth, requireRole } from "../auth.js";
import { ah, HttpError, str, num } from "./util.js";
import { digits, normalizePhone } from "../lib/text.js";
import { parseTiers } from "../lib/pricing.js";
import { storeBuffer, filePath } from "../lib/files.js";

export const publicRouter = Router();
export const router = Router();

// ── Auth ─────────────────────────────────────────────────────────────────────
publicRouter.post("/auth/login", ah(async (req, res) => {
  // entra com o usuário ("admin") ou com o e-mail
  const login = String(req.body?.username ?? req.body?.email ?? "").trim().toLowerCase();
  const user = login ? await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } }) : null;
  if (!user || !user.active || !(await bcrypt.compare(String(req.body?.password || ""), user.passwordHash))) {
    throw new HttpError(401, "Usuário ou senha incorretos.");
  }
  const u = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ token: signToken(u), user: u });
}));

router.get("/auth/me", (req, res) => res.json({ user: req.user }));

// ── Usuários (admin) ─────────────────────────────────────────────────────────
// login: 3 a 40 caracteres, minúsculo, sem espaço (letras, números, ponto, hífen, sublinhado)
const usernameOf = (v: unknown): string | null => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z0-9._-]{3,40}$/.test(s)) throw new HttpError(400, "O usuário deve ter de 3 a 40 caracteres, sem espaços (letras, números, ponto, hífen ou sublinhado).");
  return s;
};

const userOut = (u: any) => ({ id: u.id, name: u.name, username: u.username, email: u.email, role: u.role, phone: u.phone, active: u.active, createdAt: u.createdAt });

router.get("/users", requireRole(), ah(async (_req, res) => {
  res.json((await prisma.user.findMany({ orderBy: { name: "asc" } })).map(userOut));
}));

router.post("/users", requireRole(), ah(async (req, res) => {
  const b = req.body ?? {};
  const email = String(b.email || "").trim().toLowerCase();
  const username = usernameOf(b.username);
  if (!str(b.name) || !email.includes("@")) throw new HttpError(400, "Informe nome e e-mail válidos.");
  if (username && (await prisma.user.findUnique({ where: { username } }))) throw new HttpError(409, "Este usuário (login) já está em uso.");
  if (String(b.password || "").length < 6) throw new HttpError(400, "A senha precisa ter ao menos 6 caracteres.");
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "Já existe um usuário com este e-mail.");
  const u = await prisma.user.create({
    data: { name: str(b.name, 120)!, email, username, role: str(b.role, 20) ?? "atendente", phone: b.phone ? digits(b.phone) : null, passwordHash: await bcrypt.hash(String(b.password), 10) },
  });
  res.status(201).json(userOut(u));
}));

router.put("/users/:id", requireRole(), ah(async (req, res) => {
  const b = req.body ?? {};
  const data: any = {};
  if (b.username !== undefined) {
    const username = usernameOf(b.username);
    if (username && (await prisma.user.findFirst({ where: { username, id: { not: req.params.id } } }))) throw new HttpError(409, "Este usuário (login) já está em uso.");
    data.username = username;
  }
  if (b.name !== undefined) data.name = str(b.name, 120) ?? undefined;
  if (b.role !== undefined) data.role = str(b.role, 20) ?? undefined;
  if (b.phone !== undefined) data.phone = b.phone ? digits(b.phone) : null;
  if (b.active !== undefined) data.active = !!b.active;
  if (b.password) { if (String(b.password).length < 6) throw new HttpError(400, "A senha precisa ter ao menos 6 caracteres."); data.passwordHash = await bcrypt.hash(String(b.password), 10); }
  if (req.params.id === req.user!.id && data.active === false) throw new HttpError(400, "Você não pode desativar o próprio acesso.");
  res.json(userOut(await prisma.user.update({ where: { id: req.params.id }, data })));
}));

// ── Clientes ─────────────────────────────────────────────────────────────────
const customerData = (b: any) => ({
  name: str(b.name, 160) ?? (() => { throw new HttpError(400, "Informe o nome do cliente."); })(),
  company: str(b.company, 160), document: b.document ? digits(b.document).slice(0, 20) || null : null,
  phone: b.phone ? normalizePhone(b.phone) || null : null, email: str(b.email, 160),
  zip: b.zip ? digits(b.zip).slice(0, 8) : null, street: str(b.street, 200), number: str(b.number, 20),
  district: str(b.district, 100), city: str(b.city, 100), state: str(b.state, 2)?.toUpperCase() ?? null, notes: str(b.notes, 5000),
});

router.get("/customers", ah(async (req, res) => {
  const q = str(req.query.q, 100);
  const d = q ? digits(q) : "";
  const list = await prisma.customer.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }, ...(d.length >= 3 ? [{ phone: { contains: d } }, { document: { contains: d } }] : [])] } : {}),
    },
    orderBy: { name: "asc" }, take: 500,
    include: { _count: { select: { orders: true, quotes: true } } },
  });
  res.json(list);
}));

router.get("/customers/:id", ah(async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 50 },
      quotes: { orderBy: { createdAt: "desc" }, take: 50 },
      attachments: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true, mime: true, size: true, kind: true, createdAt: true } },
      conversations: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, createdAt: true, firstMessage: true } },
    },
  });
  if (!c) throw new HttpError(404, "Cliente não encontrado.");
  res.json(c);
}));

router.post("/customers", ah(async (req, res) => { res.status(201).json(await prisma.customer.create({ data: customerData(req.body ?? {}) })); }));
router.put("/customers/:id", ah(async (req, res) => { res.json(await prisma.customer.update({ where: { id: req.params.id }, data: customerData(req.body ?? {}) })); }));
router.delete("/customers/:id", requireRole("atendente"), ah(async (req, res) => {
  const used = (await prisma.order.count({ where: { customerId: req.params.id } })) + (await prisma.quote.count({ where: { customerId: req.params.id } }));
  if (used) await prisma.customer.update({ where: { id: req.params.id }, data: { active: false } }); // tem histórico: só inativa
  else await prisma.customer.delete({ where: { id: req.params.id } });
  res.json({ ok: true, inactivated: used > 0 });
}));

// ── Produtos ─────────────────────────────────────────────────────────────────
const productData = (b: any) => ({
  name: str(b.name, 160) ?? (() => { throw new HttpError(400, "Informe o nome do produto."); })(),
  category: str(b.category, 80) ?? "Geral", description: str(b.description, 5000), howItWorks: str(b.howItWorks, 5000), priceTiers: parseTiers(b.priceTiers) as unknown as object[], unit: str(b.unit, 20) ?? "un",
  pricingMode: b.pricingMode === "package" ? "package" : "unit", leadTime: str(b.leadTime, 80),
  price: Math.max(0, num(b.price)), minQty: Math.max(1, Math.round(num(b.minQty, 1))),
  offerPrice: num(b.offerPrice) > 0 ? num(b.offerPrice) : null, featured: !!b.featured, showOnSite: b.showOnSite === undefined ? true : !!b.showOnSite,
  active: b.active === undefined ? true : !!b.active,
});
const productImages = { images: { orderBy: { sortOrder: "asc" as const }, select: { id: true, name: true, sortOrder: true } } };

router.get("/products", ah(async (req, res) => {
  const q = str(req.query.q, 100);
  res.json(await prisma.product.findMany({
    where: { ...(req.query.all === "1" ? {} : { active: true }), ...(q ? { OR: [{ name: { contains: q } }, { category: { contains: q } }] } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }], include: productImages,
  }));
}));
router.get("/products/:id", ah(async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id }, include: productImages });
  if (!p) throw new HttpError(404, "Produto não encontrado.");
  res.json(p);
}));
router.post("/products", requireRole("atendente"), ah(async (req, res) => { res.status(201).json(await prisma.product.create({ data: productData(req.body ?? {}) })); }));
router.put("/products/:id", requireRole("atendente"), ah(async (req, res) => { res.json(await prisma.product.update({ where: { id: req.params.id }, data: productData(req.body ?? {}) })); }));
router.delete("/products/:id", requireRole("atendente"), ah(async (req, res) => {
  const used = (await prisma.quoteItem.count({ where: { productId: req.params.id } })) + (await prisma.orderItem.count({ where: { productId: req.params.id } }));
  if (used) await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
  else await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true, inactivated: used > 0 });
}));

// ── Dados da empresa (a IA e as respostas prontas usam) ─────────────────────
const COMPANY_FIELDS = { aboutText: 3000, name: 120, tagline: 160, document: 20, address: 300, phone: 40, email: 160, instagram: 120, website: 160, hours: 300, payment: 500, delivery: 500, artService: 500, notes: 4000 } as const;
const getCompany = async () => (await prisma.companyProfile.findFirst()) ?? prisma.companyProfile.create({ data: {} });

router.get("/company", ah(async (_req, res) => { res.json(await getCompany()); }));
router.put("/company", requireRole(), ah(async (req, res) => {
  const cur = await getCompany(), b = req.body ?? {}, data: Record<string, string | null> = {};
  for (const [k, max] of Object.entries(COMPANY_FIELDS)) if (b[k] !== undefined) data[k] = str(b[k], max);
  if (!data.name && "name" in data) throw new HttpError(400, "Informe o nome da empresa.");
  res.json(await prisma.companyProfile.update({ where: { id: cur.id }, data }));
}));

// ── Logotipo (aparece no login, no menu e nos PDFs) ──────────────────────────
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]), JPG = Buffer.from([0xff, 0xd8, 0xff]);
const removeLogoFile = (name?: string | null) => { if (name) fs.rm(filePath(name), { force: true }, () => {}); };

// público: a tela de login precisa do logo antes de entrar
publicRouter.get("/brand", ah(async (_req, res) => {
  const c = await prisma.companyProfile.findFirst({ select: { name: true, logoFile: true, updatedAt: true } });
  res.json({ name: c?.name ?? "Pixel Gráfica", hasLogo: !!c?.logoFile, v: c?.updatedAt.getTime() ?? 0 });
}));
publicRouter.get("/brand/logo", ah(async (_req, res) => {
  const c = await prisma.companyProfile.findFirst({ select: { logoFile: true, logoMime: true } });
  if (!c?.logoFile || !fs.existsSync(filePath(c.logoFile))) throw new HttpError(404, "Sem logotipo.");
  res.type(c.logoMime || "image/png").set("Cache-Control", "public, max-age=3600").sendFile(filePath(c.logoFile));
}));

router.post("/company/logo", requireRole(), logoUpload.single("logo"), ah(async (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, "Escolha uma imagem.");
  const isPng = f.buffer.subarray(0, 4).equals(PNG), isJpg = f.buffer.subarray(0, 3).equals(JPG);
  if (!isPng && !isJpg) throw new HttpError(400, "Use uma imagem PNG ou JPG (até 3 MB).");
  const cur = await getCompany();
  const logoFile = storeBuffer(f.buffer, isPng ? "logo.png" : "logo.jpg");
  const saved = await prisma.companyProfile.update({ where: { id: cur.id }, data: { logoFile, logoMime: isPng ? "image/png" : "image/jpeg" } });
  removeLogoFile(cur.logoFile);
  res.json(saved);
}));
router.delete("/company/logo", requireRole(), ah(async (_req, res) => {
  const cur = await getCompany();
  removeLogoFile(cur.logoFile);
  res.json(await prisma.companyProfile.update({ where: { id: cur.id }, data: { logoFile: null, logoMime: null } }));
}));

export { requireAuth };
