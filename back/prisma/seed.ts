// Idempotente: roda a cada `npm run dev`; só cria o que ainda não existe.
import "../src/env.js";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";
import { products, faq, CATALOG_VERSION, OLD_FAQ_TITLES } from "./catalog.js";

const ART_INCLUDED = "A criação da arte já está inclusa em todos os pedidos: não cobramos pela arte. Se o cliente enviar a arte pronta, não há desconto, porque a arte já está incluída no valor.";
const OLD_AI_PROMPTS = new Set([
  "Você atende a Pixel Gráfica, uma gráfica rápida. Seja simpática e objetiva. Para preços exatos, use sempre a ferramenta de produtos. Arte/criação é um serviço à parte.",
  "Você atende a Pixel Gráfica Tatuí. Seja simpática e objetiva. Para preços use sempre as ferramentas; valores que não estiverem no catálogo são sob consulta com a equipe.",
]);
const AI_PROMPT = "Você atende a Pixel Gráfica Tatuí. Seja simpática, objetiva e entenda do negócio. A criação da arte já está inclusa em todos os pedidos (não cobramos pela arte e não há desconto por enviar arte pronta). Só trabalhamos com as quantidades e medidas do catálogo.";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@pixelgrafica.com.br").toLowerCase();
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({ data: { name: "Administrador", email, username, role: "admin", passwordHash: await bcrypt.hash(password, 10) } });
    console.log(`[seed] usuário admin criado: ${username}`);
  } else {
    // admin criado por versões antigas: ganha o usuário de login e, se ainda usa a senha padrão antiga, a senha atual
    const data: { username?: string; passwordHash?: string } = {};
    if (!existing.username && !(await prisma.user.findUnique({ where: { username } }))) data.username = username;
    if (await bcrypt.compare("trocar123", existing.passwordHash)) data.passwordHash = await bcrypt.hash(password, 10);
    if (Object.keys(data).length) { await prisma.user.update({ where: { id: existing.id }, data }); console.log("[seed] admin atualizado (usuário de login / senha padrão)"); }
  }

  // Dados da empresa (a IA usa). Só o que a gráfica já divulga nas tabelas; o resto ela preenche em Bot e IA > Empresa.
  const profile = (await prisma.companyProfile.findFirst()) ?? await prisma.companyProfile.create({
    data: { name: "Pixel Gráfica Tatuí", tagline: "Qualidade que valoriza a sua marca!", artService: ART_INCLUDED },
  });

  // Divisão do lucro entre os sócios (inferida da planilha de controle: 30% / 70% do lucro). Editável em Serviços > Divisão do lucro.
  if (profile.partners === null) {
    await prisma.companyProfile.update({ where: { id: profile.id }, data: { partners: [{ name: "Renato", percent: 30 }, { name: "Gui", percent: 70 }] } });
    console.log("[seed] divisão do lucro padrão criada: Renato 30% / Gui 70% (ajuste em Serviços)");
  }

  // Arte inclusa (regra da casa). Só troca o texto antigo padrão; se a gráfica já editou, respeita.
  if (!profile.artService || profile.artService.trim() === "Fazemos a arte também.") {
    await prisma.companyProfile.update({ where: { id: profile.id }, data: { artService: ART_INCLUDED } });
    console.log("[seed] regra da arte inclusa aplicada em Dados da empresa");
  }

  // Dados que facilitam o uso desde o primeiro dia: só preenche o que está vazio (nunca sobrescreve o que a gráfica cadastrou).
  // Endereço, CNPJ e e-mail ficam em branco de propósito: a IA repete esses dados ao cliente, então só entram os verdadeiros.
  const fresh = (await prisma.companyProfile.findFirst())!;
  const starter: Record<string, string> = {
    hours: "Segunda a sexta, das 8h às 18h · Sábado, das 8h às 12h",
    payment: "Aceitamos Pix, dinheiro e cartão de débito e crédito. Para serviços maiores, 50% na aprovação da arte e o restante na retirada.",
    delivery: "Retirada na loja sem custo. Também fazemos entrega; o valor do frete é combinado conforme o bairro.",
    instagram: "@pixelgraficatatui",
    phone: "(15) 99702-6791", // número do WhatsApp conectado ao bot
  };
  const fill: Record<string, string> = {};
  for (const [k, v] of Object.entries(starter)) if (!(fresh as any)[k]) fill[k] = v;
  if (Object.keys(fill).length) { await prisma.companyProfile.update({ where: { id: fresh.id }, data: fill }); console.log("[seed] dados iniciais da empresa:", Object.keys(fill).join(", ")); }

  // Catálogo real da Pixel. Ao subir de versão ATUALIZA por nome (cria o que falta, atualiza o que existe, nunca duplica);
  // produtos de exemplo antigos que não estão no catálogo são removidos se ninguém usou, ou só desativados se já têm histórico.
  if (profile.catalogVersion < CATALOG_VERSION) {
    const used = new Set([
      ...(await prisma.quoteItem.findMany({ where: { productId: { not: null } }, select: { productId: true } })).map((i) => i.productId!),
      ...(await prisma.orderItem.findMany({ where: { productId: { not: null } }, select: { productId: true } })).map((i) => i.productId!),
    ]);
    const keep = new Set(products.map((p) => p.name));
    let created = 0, updated = 0, removed = 0, deactivated = 0;

    for (const p of products) {
      const data = {
        name: p.name, category: p.category, unit: p.unit, price: p.price, minQty: p.minQty ?? 1, leadTime: p.leadTime ?? null, active: true,
        pricingMode: p.mode ?? "unit", priceTiers: p.tiers ?? [], description: p.description, howItWorks: p.howItWorks ?? null,
      };
      const existing = await prisma.product.findFirst({ where: { name: p.name } });
      if (existing) { await prisma.product.update({ where: { id: existing.id }, data }); updated++; } else { await prisma.product.create({ data }); created++; }
    }
    for (const old of await prisma.product.findMany({ where: { name: { notIn: [...keep] } }, select: { id: true } })) {
      if (used.has(old.id)) { await prisma.product.update({ where: { id: old.id }, data: { active: false } }); deactivated++; }
      else { await prisma.product.delete({ where: { id: old.id } }); removed++; }
    }

    // respostas prontas: remove as genéricas de versões antigas e instala/atualiza as reais (sem perder o contador de uso)
    await prisma.wppKnowledge.deleteMany({ where: { OR: [{ title: { in: OLD_FAQ_TITLES.filter((t) => !faq.some((k) => k.title === t)) } }, { hits: 0, title: { notIn: faq.map((k) => k.title) } }] } });
    for (const k of faq) {
      const data = { title: k.title, phrases: k.phrases.join("\n"), answer: k.answer, action: k.action ?? "reply" };
      const same = await prisma.wppKnowledge.findMany({ where: { title: k.title }, orderBy: { createdAt: "asc" } });
      if (same.length) {
        // título repetido (sobra de versões antigas): fica uma só, com o contador de uso somado
        await prisma.wppKnowledge.update({ where: { id: same[0].id }, data: { ...data, hits: same.reduce((s, x) => s + x.hits, 0) } });
        if (same.length > 1) await prisma.wppKnowledge.deleteMany({ where: { id: { in: same.slice(1).map((x) => x.id) } } });
      } else await prisma.wppKnowledge.create({ data });
    }
    await prisma.companyProfile.update({ where: { id: profile.id }, data: { catalogVersion: CATALOG_VERSION } });
    console.log(`[seed] catálogo da Pixel: ${created} criado(s), ${updated} atualizado(s), ${removed} antigo(s) removido(s), ${deactivated} antigo(s) desativado(s); ${faq.length} respostas prontas`);
  }

  const botCfg = await prisma.wppBotConfig.findFirst();
  if (botCfg && botCfg.aiPrompt && OLD_AI_PROMPTS.has(botCfg.aiPrompt.trim())) {
    await prisma.wppBotConfig.update({ where: { id: botCfg.id }, data: { aiPrompt: AI_PROMPT } });
    console.log("[seed] orientações da IA atualizadas (arte inclusa)");
  }
  if (!botCfg) {
    await prisma.wppBotConfig.create({
      data: {
        botEnabled: false,
        aiPrompt: AI_PROMPT,
      },
    });
  }

  if ((await prisma.wppSector.count()) === 0) {
    await prisma.wppSector.createMany({
      data: [
        { name: "Orçamentos", description: "Pedidos de orçamento e valores", attendants: "[]", sortOrder: 1 },
        { name: "Arte e Criação", description: "Criação de arte, ajustes e aprovação", attendants: "[]", sortOrder: 2 },
        { name: "Acompanhar pedido", description: "Status de produção e entrega", attendants: "[]", sortOrder: 3 },
        { name: "Financeiro", description: "Pagamentos e notas", attendants: "[]", sortOrder: 4 },
      ],
    });
  }

  if ((await prisma.wppFlowNode.count()) === 0) {
    const sectors = await prisma.wppSector.findMany({ orderBy: { sortOrder: "asc" } });
    const sec = (n: string) => sectors.find((s) => s.name === n)!;
    const mk = (type: string, title: string, content: string, extra: object = {}) =>
      prisma.wppFlowNode.create({ data: { type, title, content, ...extra } });

    const quoteNode = await mk("sector", "Falar sobre orçamento", "", { sectorId: sec("Orçamentos").id });
    const artNode = await mk("sector", "Falar com a criação", "", { sectorId: sec("Arte e Criação").id });
    const trackNode = await mk("sector", "Acompanhar pedido", "", { sectorId: sec("Acompanhar pedido").id });
    const finNode = await mk("sector", "Financeiro", "", { sectorId: sec("Financeiro").id });
    const aiNode = await mk("ai", "Conversar com a Pixel IA", "Pode me contar o que você precisa imprimir. Eu consulto nossos produtos e preços. 😊 (Digite *menu* para voltar.)");
    const prodNode = await mk("message", "Nossos produtos", "Trabalhamos com impressão A3, adesivos de vinil, folhetos, banners e faixas, cartões de visita e camisetas em DTF. Também fazemos a arte! Pergunte pelo produto que quiser, ou digite *menu* para voltar.");
    await prisma.wppFlowNode.create({
      data: {
        type: "menu", title: "Menu principal", isStart: true,
        content: "{saudacao}! Eu sou a assistente da *Pixel Gráfica Tatuí*. 💙\nEscolha uma opção:",
        options: JSON.stringify([
          { key: "1", label: "Fazer orçamento", nextNodeId: quoteNode.id },
          { key: "2", label: "Meu pedido", nextNodeId: trackNode.id },
          { key: "3", label: "Arte e criação", nextNodeId: artNode.id },
          { key: "4", label: "Conversar com a IA", nextNodeId: aiNode.id },
          { key: "5", label: "Nossos produtos", nextNodeId: prodNode.id },
          { key: "6", label: "Financeiro", nextNodeId: finNode.id },
        ]),
      },
    });
  }
  // O Gemini 2.5 Flash saiu do ar para contas novas (erro 404): quem ainda está nele passa para o modelo atual.
  const old25 = await prisma.wppBotConfig.updateMany({ where: { geminiModel: "gemini-2.5-flash" }, data: { geminiModel: "gemini-3.5-flash" } });
  if (old25.count) console.log("[seed] modelo do Gemini atualizado: gemini-2.5-flash → gemini-3.5-flash");

  // "Fazer orçamento" conversa com a IA (e só cai na fila da equipe se a IA não estiver configurada).
  // Só troca se a opção 1 ainda aponta para o setor antigo; se a gráfica já editou o menu, respeita.
  const startMenu = await prisma.wppFlowNode.findFirst({ where: { isStart: true } });
  if (startMenu) {
    let opts: { key: string; label: string; nextNodeId?: string }[] = [];
    try { opts = JSON.parse(startMenu.options || "[]"); } catch { /* menu sem opções */ }
    const first = opts.find((o) => o.key === "1");
    const old = first?.nextNodeId ? await prisma.wppFlowNode.findUnique({ where: { id: first.nextNodeId } }) : null;
    if (first && old?.type === "sector" && old.title === "Falar sobre orçamento") {
      const ai = (await prisma.wppFlowNode.findFirst({ where: { type: "ai", title: "Orçamento com a Pixel IA" } }))
        ?? await prisma.wppFlowNode.create({ data: { type: "ai", title: "Orçamento com a Pixel IA", sectorId: old.sectorId, content: "Claro! 😊 Me conta o que você precisa orçar: o que quer imprimir e, mais ou menos, quanto? Pode falar do seu jeito que eu te ajudo. (Digite *menu* para voltar.)" } });
      first.nextNodeId = ai.id;
      await prisma.wppFlowNode.update({ where: { id: startMenu.id }, data: { options: JSON.stringify(opts) } });
      console.log("[seed] menu: Fazer orçamento agora conversa com a IA");
    }
  }

  // Serviços antigos marcados como pagos ganham o valor pago (campo novo): sem isso apareceriam como "a receber".
  const fixedPaid = await prisma.$executeRawUnsafe("UPDATE `ServiceRecord` SET amountPaid = total WHERE paid = 1 AND amountPaid = 0 AND total > 0");
  if (fixedPaid) console.log(`[seed] ${fixedPaid} serviço(s) antigo(s) pago(s) receberam o valor pago`);

  // Preços unitários gravados antes da precisão de 6 casas (ex.: 0,12 em vez de 0,115): recalcula quando a conta não fecha.
  // Idempotente: depois de corrigido, a condição não acha mais nada.
  for (const table of ["QuoteItem", "OrderItem", "ServiceRecord"]) {
    const n = await prisma.$executeRawUnsafe(`UPDATE \`${table}\` SET unitPrice = ROUND(total / quantity, 6) WHERE quantity > 0 AND ABS(quantity * unitPrice - total) > 0.005`);
    if (n) console.log(`[seed] ${table}: ${n} preço(s) unitário(s) recalculado(s) para a conta fechar`);
  }
  console.log("[seed] ok");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
