// Dados de EXEMPLO para ver o sistema cheio (clientes, orçamentos, ordens de serviço, serviços, conversas).
//   npm run db:demo           cria (só se ainda não existir)
//   npm run db:demo -- --reset  apaga os de exemplo e cria de novo
//   npm run db:demo:clear     apaga só os de exemplo
// Tudo é marcado com "[DEMO]" (clientes e serviços) e usa telefones FALSOS (15 99000-00xx): nada é enviado a ninguém.
import "../src/env.js";
import { prisma } from "../src/db.js";
import { quotePrice } from "../src/lib/pricing.js";

const TAG = "[DEMO]";
const phone = (i: number) => `551599000${String(i).padStart(4, "0")}`;
const noon = (offsetDays: number, hour = 12) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hour, 0, 0, 0); return d; };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

// gerador pseudo-aleatório fixo: o exemplo é sempre o mesmo
let seed = 20260417;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const CUSTOMERS = [
  ["Marcos Oliveira", "Padaria Pão Quente", "Rua XV de Novembro", "120", "Centro"],
  ["Camila Ferreira", "Studio Bella Pele", "Av. Dr. Laurindo Minhoto", "455", "Jardim Lucila"],
  ["José Antônio Lima", "Mercadinho Bom Preço", "Rua Cel. Lúcio Dias Batista", "88", "Vila Dom Bosco"],
  ["Renata Souza", "Escola Pequeno Aprendiz", "Rua Quinze de Novembro", "310", "Centro"],
  ["Carlos Eduardo Martins", "Auto Peças Tatuí", "Av. Mauro Ribeiro Vilaça", "1.020", "Jardim Wanda"],
  ["Pastor Ricardo", "Igreja Batista Vida Nova", "Rua Padre Anchieta", "75", "Vila Esperança"],
  ["Diego Santos", "Barbearia Navalha", "Rua José Bonifácio", "231", "Centro"],
  ["Dra. Fernanda Alves", "Clínica Sorriso", "Rua Tenente Antônio de Oliveira", "64", "Centro"],
  ["Luciana Costa", "Pizzaria Forno a Lenha", "Av. Eduardo Pereira de Almeida", "905", "Jardim Rosa"],
  ["Patrícia Rocha", "Loja Moda Jovem", "Rua Coronel Aureliano de Camargo", "142", "Centro"],
  ["Rafael Mendes", "Academia Corpo Ativo", "Rua Dr. Vieira", "510", "Jardim Paulista"],
  ["Maria Aparecida", null, "Rua das Palmeiras", "33", "Vila Nova"],
] as const;

// atalhos para os produtos reais do catálogo (por início do nome)
const KEY: Record<string, string> = {
  cartaoPremium: "Cartão de visita Premium", cartaoComum: "Cartão de visita Comum", cartaoBasico: "Cartão de visita Básico", cantos: "Adicional: cantos",
  camiseta: "Camiseta básica", polo: "Polo / manga", f1015fv: "Folheto 10x15 — frente e verso", f1015f: "Folheto 10x15 — só frente",
  f710fv: "Folheto 7x10 — frente e verso", b9060: "Banner / faixa 90x60", b100x100: "Banner / faixa 100x100", b100x200: "Banner / faixa 100x200",
  b100x50: "Banner / faixa 100x50", b40x60: "Banner / faixa 40x60", vinilA4: "Adesivo vinil fosco — folha", vinilM2: "Adesivo vinil fosco — metro",
  a3off: "Impressão A3 laser — Offset", a3foto: "Impressão A3 laser — Foto Matte 180g (só frente)",
};
type Line = [keyof typeof KEY, number, string?];

const STAGES = ["aguardando_arquivo", "arte", "aprovacao_arte", "producao", "acabamento", "pronto", "entregue"];

async function clear() {
  const customers = await prisma.customer.findMany({ where: { notes: { startsWith: TAG } }, select: { id: true, phone: true } });
  const ids = customers.map((c) => c.id), phones = customers.map((c) => c.phone).filter(Boolean) as string[];
  const s = await prisma.serviceRecord.deleteMany({ where: { OR: [{ notes: { startsWith: TAG } }, { customerId: { in: ids } }] } });
  const o = await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  const q = await prisma.quote.deleteMany({ where: { customerId: { in: ids } } });
  const w = await prisma.wppConversation.deleteMany({ where: { clientPhone: { in: phones } } });
  const c = await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log(`[demo] removidos: ${c.count} clientes, ${q.count} orçamentos, ${o.count} ordens de serviço, ${s.count} serviços, ${w.count} conversas`);
}

async function main() {
  if (process.argv.includes("--clear")) return clear();
  if (process.argv.includes("--reset")) await clear();
  if (await prisma.customer.count({ where: { notes: { startsWith: TAG } } })) {
    console.log("[demo] os dados de exemplo já existem. Use `npm run db:demo -- --reset` para recriar ou `npm run db:demo:clear` para apagar.");
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const products = await prisma.product.findMany({ where: { active: true } });
  if (!products.length) throw new Error("Catálogo vazio: rode `npm run dev` uma vez antes (o seed instala o catálogo).");
  const prod = (k: keyof typeof KEY) => { const p = products.find((x) => x.name.startsWith(KEY[k])); if (!p) throw new Error(`Produto não encontrado no catálogo: ${KEY[k]}`); return p; };
  const build = (lines: Line[]) => {
    const items = lines.map(([k, qty, note], i) => {
      const p = prod(k), q = quotePrice(p, qty);
      if (!q.ok) throw new Error(`${p.name} × ${qty}: ${q.error}`);
      return { sortOrder: i, productId: p.id, description: `${p.name}${note ? ` — ${note}` : ""}`, quantity: qty, unitPrice: q.unitPrice, total: q.total };
    });
    return { items, total: Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100 };
  };

  // ── Clientes ──
  const customers: Awaited<ReturnType<typeof prisma.customer.create>>[] = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const [name, company, street, number, district] = CUSTOMERS[i];
    customers.push(await prisma.customer.create({
      data: {
        name, company, phone: phone(i + 1), street, number, district, city: "Tatuí", state: "SP", zip: "18270000",
        email: company ? `contato@${company.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.com.br` : null,
        document: company ? `${String(10 + i).padStart(2, "0")}345678000190` : `1234567890${i}`.slice(0, 11),
        notes: `${TAG} Cliente de exemplo`, createdAt: noon(-120 + i * 8),
      },
    }));
  }

  // ── Ordens de serviço ──
  type OrderSpec = { c: number; lines: Line[]; status: string; created: number; due?: number; delivered?: number; pay: "none" | "entry" | "half" | "full"; urgent?: boolean; notes?: string; delivery?: "retirada" | "entrega" };
  const orders: OrderSpec[] = [
    { c: 0, lines: [["cartaoPremium", 1000], ["cantos", 1]], status: "producao", created: -4, due: 3, pay: "half", notes: "Logo azul. Cantos arredondados no Premium." },
    { c: 1, lines: [["b9060", 2], ["cartaoComum", 500]], status: "arte", created: -2, due: 5, pay: "none", notes: "Cliente vai enviar a logo hoje." },
    { c: 2, lines: [["f1015fv", 5000]], status: "aguardando_arquivo", created: -1, due: 8, pay: "entry", delivery: "entrega" },
    { c: 3, lines: [["camiseta", 30, "turma 5º ano, azul marinho"]], status: "producao", created: -9, due: -2, pay: "half", urgent: true, notes: "Uniforme da turma. ATRASADO: tecido chegou depois." },
    { c: 4, lines: [["b100x200", 1], ["b100x100", 2]], status: "acabamento", created: -5, due: 1, pay: "full", delivery: "entrega" },
    { c: 5, lines: [["polo", 12, "preta"]], status: "aprovacao_arte", created: -3, due: 6, pay: "entry", notes: "Aguardando o pastor aprovar a arte." },
    { c: 6, lines: [["cartaoBasico", 1000]], status: "pronto", created: -6, due: 0, pay: "half", notes: "Avisar para retirar." },
    { c: 7, lines: [["f710fv", 5000], ["cartaoComum", 1000]], status: "entregue", created: -20, delivered: -14, pay: "full" },
    { c: 8, lines: [["vinilA4", 25], ["b9060", 1]], status: "entregue", created: -35, delivered: -30, pay: "full" },
    { c: 9, lines: [["camiseta", 10, "branca"]], status: "entregue", created: -50, delivered: -44, pay: "full" },
    { c: 10, lines: [["a3foto", 8]], status: "entregue", created: -12, delivered: -10, pay: "full" },
    { c: 0, lines: [["b100x50", 3]], status: "entregue", created: -70, delivered: -66, pay: "full" },
    { c: 11, lines: [["cartaoPremium", 500]], status: "cancelado", created: -15, pay: "none", notes: "Cliente desistiu." },
  ];
  const METHODS = ["pix", "dinheiro", "credito", "debito"];
  let firstQuoteLinked = 0;
  for (const [idx, o] of orders.entries()) {
    const { items, total } = build(o.lines);
    const created = noon(o.created, 10);
    const reached = Math.max(0, STAGES.indexOf(o.status));
    const paidTotal = o.pay === "full" ? total : o.pay === "half" ? Math.round(total * 50) / 100 : o.pay === "entry" ? Math.round(total * 30) / 100 : 0;

    // orçamento aprovado que originou as duas primeiras ordens (mostra o vínculo)
    let quoteId: string | null = null;
    if (idx === 0 || idx === 4) {
      const q = await prisma.quote.create({ data: { customerId: customers[o.c].id, status: "aprovado", total, validUntil: noon(o.created + 15), sentAt: noon(o.created - 1), createdAt: noon(o.created - 2), createdById: admin?.id, items: { create: items.map((i) => ({ ...i })) } } });
      quoteId = q.id; firstQuoteLinked++;
    }

    const order = await prisma.order.create({
      data: {
        customerId: customers[o.c].id, quoteId, status: o.status, priority: o.urgent ? "urgente" : "normal", total, paid: paidTotal, dueDate: o.due !== undefined ? noon(o.due) : null,
        deliveryType: o.delivery ?? "retirada", notes: o.notes ?? null, createdAt: created, deliveredAt: o.delivered !== undefined ? noon(o.delivered) : null, createdById: admin?.id,
        items: { create: items },
        events: {
          create: o.status === "cancelado"
            ? [{ status: "aguardando_arquivo", note: "Pedido criado", userName: admin?.name, createdAt: created }, { status: "cancelado", note: o.notes, userName: admin?.name, createdAt: noon(o.created + 2) }]
            : STAGES.slice(0, reached + 1).map((st, i) => ({ status: st, note: i === 0 ? "Pedido criado" : null, userName: admin?.name ?? null, createdAt: o.delivered !== undefined && reached > 0 ? new Date(created.getTime() + ((noon(o.delivered).getTime() - created.getTime()) * i) / reached) : new Date(created.getTime() + i * 86_400_000 * 0.6) })),
        },
      },
    });
    if (paidTotal > 0) {
      const parts = o.pay === "full" && total > 200 ? [Math.round(total * 50) / 100, Math.round((total - Math.round(total * 50) / 100) * 100) / 100] : [paidTotal];
      for (const [i, amount] of parts.entries()) await prisma.orderPayment.create({ data: { orderId: order.id, amount, method: pick(METHODS), note: i === 0 && parts.length > 1 ? "Entrada" : null, userName: admin?.name, createdAt: noon(o.created + i * 2, 15) } });
    }
    // entregue vira registro de serviço (como o sistema faz sozinho)
    if (o.status === "entregue") {
      await prisma.serviceRecord.createMany({
        data: items.map((i) => ({ date: noon(o.delivered!), customerId: customers[o.c].id, customerName: customers[o.c].name, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, cost: Math.round(i.total * 55) / 100, amountPaid: o.pay === "full" ? i.total : o.pay === "half" ? Math.round(i.total * 50) / 100 : o.pay === "entry" ? Math.round(i.total * 30) / 100 : 0, paid: o.pay === "full", source: "pedido", orderId: order.id, notes: `${TAG} Pedido #${order.number}`, createdBy: admin?.name })),
      });
    }
  }

  // ── Orçamentos soltos ──
  type QuoteSpec = { c: number; lines: Line[]; status: string; created: number; sent: boolean; source?: string; discount?: number; notes?: string };
  const quotes: QuoteSpec[] = [
    { c: 0, lines: [["f1015fv", 2500]], status: "enviado", created: -3, sent: true, notes: "Entrega em 5 dias úteis após a aprovação." },
    { c: 5, lines: [["camiseta", 20], ["polo", 5]], status: "rascunho", created: -1, sent: false },
    { c: 2, lines: [["cartaoComum", 1000]], status: "rascunho", created: 0, sent: false, source: "whatsapp", notes: "Pedido feito pelo cliente no WhatsApp (Pixel IA)." },
    { c: 7, lines: [["b100x200", 2]], status: "enviado", created: -6, sent: true },
    { c: 8, lines: [["a3off", 30], ["vinilA4", 10]], status: "enviado", created: -2, sent: true, discount: 10 },
    { c: 3, lines: [["f710fv", 10000]], status: "recusado", created: -18, sent: true, notes: "Achou o valor alto; vai cotar em outro lugar." },
    { c: 10, lines: [["b100x100", 4], ["b40x60", 6]], status: "enviado", created: -9, sent: true },
  ];
  for (const q of quotes) {
    const { items, total } = build(q.lines);
    await prisma.quote.create({
      data: {
        customerId: customers[q.c].id, status: q.status, source: q.source ?? "painel", discount: q.discount ?? 0, total: Math.max(0, total - (q.discount ?? 0)), notes: q.notes ?? null,
        validUntil: noon(q.created + 15), sentAt: q.sent ? noon(q.created, 14) : null, createdAt: noon(q.created, 9), createdById: admin?.id, items: { create: items },
      },
    });
  }

  // ── Serviços realizados dos últimos meses (para o painel de serviços) ──
  const pool: Line[][] = [[["cartaoComum", 500]], [["cartaoComum", 1000]], [["cartaoPremium", 500]], [["cartaoBasico", 500]], [["f1015fv", 1000]], [["f1015f", 2500]], [["f710fv", 2000]],
    [["b9060", 1]], [["b9060", 2]], [["b100x100", 1]], [["b40x60", 3]], [["camiseta", 4]], [["camiseta", 12]], [["polo", 6]], [["vinilA4", 6]], [["vinilA4", 20]], [["a3off", 10]], [["a3foto", 4]]];
  const records = [];
  for (let n = 0; n < 48; n++) {
    const days = 1 + Math.floor(rnd() * 150), c = customers[Math.floor(rnd() * customers.length)], { items } = build(pick(pool));
    const recent = days < 25;
    for (const i of items) {
      const quote = n % 11 !== 5; // alguns ainda a orçar (linha amarela sem valor, como na planilha)
      const total = quote ? i.total : 0;
      const isPaid = quote && (recent ? rnd() > 0.35 : rnd() > 0.04);
      const partial = quote && !isPaid && rnd() > 0.6;
      const cost = quote ? Math.round(i.total * (40 + Math.floor(rnd() * 26))) / 100 : 0;
      records.push({ date: noon(-days), customerId: c.id, customerName: c.name, description: i.description, category: null, quantity: i.quantity, unitPrice: quote ? i.unitPrice : 0, total, cost, amountPaid: isPaid ? total : partial ? Math.round(total * 50) / 100 : 0, paymentMethod: quote ? pick(METHODS) : null, paid: isPaid, source: "manual", notes: `${TAG} Exemplo`, createdBy: admin?.name });
    }
  }
  await prisma.serviceRecord.createMany({ data: records });

  // ── Conversas de WhatsApp (nada é enviado: são só registros) ──
  const sectors = await prisma.wppSector.findMany();
  const sector = (n: string) => sectors.find((s) => s.name.startsWith(n))?.id ?? null;
  type Msg = ["client" | "bot" | "attendant" | "system", string, number];
  const convs: { c: number; status: string; sector?: string; subject?: string; attendant?: boolean; msgs: Msg[] }[] = [
    { c: 2, status: "waiting", sector: "Orçamentos", subject: "Folhetos 10x15", msgs: [["client", "Oi, boa tarde!", 22], ["bot", "Boa tarde! Eu sou a assistente da Pixel Gráfica Tatuí. 💙 Escolha uma opção:", 22], ["client", "Quero orçamento de 5000 folhetos 10x15", 20], ["bot", "Certo! Estou encaminhando você ao setor Orçamentos. Você é o próximo na fila. ⏳", 20], ["client", "Frente e verso, tá?", 18]] },
    { c: 9, status: "waiting", sector: "Arte", subject: "Criação de arte", msgs: [["client", "Vocês fazem a arte também?", 9], ["bot", "Fazemos a arte também! 🎨 Vou chamar alguém da criação para entender o que você precisa.", 9], ["client", "Preciso de um banner pro dia das mães", 7]] },
    { c: 4, status: "active", sector: "Acompanhar", attendant: true, msgs: [["client", "Meu pedido de banners já ficou pronto?", 55], ["bot", "Vou encaminhar você ao setor Acompanhar pedido.", 55], ["system", "Administrador assumiu o atendimento.", 50], ["attendant", "Oi, Carlos! Seu pedido está no acabamento, fica pronto amanhã. 😊", 49], ["client", "Perfeito! Posso buscar de tarde?", 46], ["attendant", "Pode sim, a partir das 14h.", 45]] },
    { c: 10, status: "bot", msgs: [["client", "Boa noite", 12], ["bot", "Boa noite! Eu sou a assistente da Pixel Gráfica Tatuí. 💙 Escolha uma opção:", 12], ["client", "quanto custa uma camiseta com estampa na frente e nas costas?", 11], ["bot", "A camiseta básica em DTF (frente e costa) sai por R$ 60,00 até 4 unidades, R$ 54,00 de 5 a 9 e R$ 49,00 a partir de 10. Quantas você precisa?", 11], ["client", "umas 15", 10]] },
    { c: 11, status: "bot", msgs: [["client", "oi", 40], ["bot", "Oi! Eu sou a assistente da Pixel Gráfica Tatuí. 💙 Escolha uma opção:", 40]] },
    { c: 7, status: "closed", sector: "Orçamentos", attendant: true, msgs: [["client", "Preciso de 2 banners 100x200", 4300], ["attendant", "Claro! Fica R$ 390,00 os dois, pronto em 2 dias. Posso mandar o orçamento?", 4290], ["client", "Pode sim", 4285], ["system", "Administrador finalizou o atendimento.", 4280]] },
    { c: 8, status: "closed", sector: "Financeiro", attendant: true, msgs: [["client", "Pode mandar o comprovante do pagamento?", 9000], ["attendant", "Mandei por e-mail, Luciana. Qualquer coisa me chame!", 8990], ["system", "Administrador finalizou o atendimento.", 8985]] },
    { c: 6, status: "closed", msgs: [["client", "Qual o horário de vocês?", 14000], ["bot", "Nosso horário de atendimento: segunda a sexta, 8h às 18h.", 14000]] },
  ];
  for (const cv of convs) {
    const cust = customers[cv.c];
    const last = Math.min(...cv.msgs.map((m) => m[2]));
    const conv = await prisma.wppConversation.create({
      data: {
        clientPhone: cust.phone!, clientName: cust.name, customerId: cust.id, status: cv.status, sectorId: cv.sector ? sector(cv.sector) : null, subject: cv.subject ?? null,
        firstMessage: cv.msgs[0][1].slice(0, 200), attendantId: cv.attendant ? admin?.id : null, attendantName: cv.attendant ? admin?.name : null,
        acceptedAt: cv.attendant ? minutesAgo(Math.max(...cv.msgs.map((m) => m[2])) - 3) : null, queuedAt: minutesAgo(Math.max(...cv.msgs.map((m) => m[2]))),
        closedAt: cv.status === "closed" ? minutesAgo(last) : null, closedBy: cv.status === "closed" ? (cv.attendant ? "attendant" : "system") : null, createdAt: minutesAgo(Math.max(...cv.msgs.map((m) => m[2]))),
      },
    });
    await prisma.wppMessage.createMany({ data: cv.msgs.map(([fromRole, body, ago]) => ({ conversationId: conv.id, fromRole, body, sentAt: minutesAgo(ago) })) });
    await prisma.wppConversation.update({ where: { id: conv.id }, data: { updatedAt: minutesAgo(last) } });
  }

  console.log(`[demo] criado: ${customers.length} clientes, ${orders.length} ordens de serviço (+${firstQuoteLinked} orçamentos aprovados ligados), ${quotes.length} orçamentos, ${records.length} serviços realizados, ${convs.length} conversas de WhatsApp.`);
  console.log("[demo] telefones falsos (15 99000-00xx): nada é enviado. Para remover: npm run db:demo:clear");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
