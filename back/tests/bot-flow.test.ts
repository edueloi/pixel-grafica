import "../src/env.js";
import { prisma } from "../src/db.js";
import { handleMessage } from "../src/wa/brain.js";
import { clientStates } from "../src/wa/conversations.js";

const PHONE = "5515988887777";
let n = 0;
const msg = (text: string, buttonId?: string) => ({
  key: { remoteJid: `${PHONE}@s.whatsapp.net`, fromMe: false, id: `T${++n}` }, pushName: "Maria Teste",
  message: buttonId
    ? { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: buttonId }) } } }
    : { conversation: text },
});
const ok = (name: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${name}${extra ? " — " + extra : ""}`);
const conv = () => prisma.wppConversation.findFirst({ where: { clientPhone: PHONE }, orderBy: { createdAt: "desc" }, include: { messages: { orderBy: { sentAt: "asc" } }, sector: true } });
const bots = async () => (await conv())!.messages.filter((m) => m.fromRole === "bot").map((m) => m.body);

async function main() {
  const cfg = (await prisma.wppBotConfig.findFirst())!;
  await prisma.wppBotConfig.update({ where: { id: cfg.id }, data: { botEnabled: false } });
  await handleMessage(msg("oi"), null);
  ok("bot desligado: não cria conversa nem responde", (await conv()) === null);

  await prisma.wppBotConfig.update({ where: { id: cfg.id }, data: { botEnabled: true, aiEnabled: false } });
  await handleMessage(msg("oi"), null);
  let c = (await conv())!;
  ok("bot ligado: cria conversa em modo bot", c.status === "bot" && c.clientName === "Maria Teste");
  const first = (await bots())[0] ?? "";
  ok("mostra o menu principal com saudação", /Bom dia|Boa tarde|Boa noite/.test(first) && first.includes("1 - Fazer orçamento") && first.includes("6 - Financeiro"), first.split("\n")[0]);

  await handleMessage(msg("", "5"), null); // clicou em "Nossos produtos"
  ok("clique no botão 5 leva à tela de produtos", (await bots()).at(-1)!.includes("cartões de visita"));

  // horário vem dos "Dados da empresa": sem o dado preenchido, o bot NÃO responde com texto vazio/inventado
  const hoursBefore = (await prisma.companyProfile.findFirst())?.hours ?? null;
  await prisma.companyProfile.updateMany({ data: { hours: null } });
  const beforeHours = (await bots()).length;
  await handleMessage(msg("qual o horario de funcionamento?"), null);
  ok("horário sem dado da empresa: não inventa resposta (cai no menu)", (await bots()).slice(beforeHours).every((b) => !/Nosso horário/.test(b)) && (await bots()).slice(beforeHours).some((b) => /Não entendi|não achei essa opção|Não consegui entender/.test(b)));
  await prisma.companyProfile.updateMany({ data: { hours: "Segunda a sexta, 8h às 18h" } });
  await handleMessage(msg("qual o horario de funcionamento?"), null);
  ok("horário com dado da empresa: responde com o dado real", /Nosso horário de atendimento: Segunda a sexta, 8h às 18h/.test((await bots()).at(-1)!), (await bots()).at(-1)!.slice(0, 70));
  await prisma.companyProfile.updateMany({ data: { hours: hoursBefore } });

  await handleMessage(msg("quais papeis vocês trabalham?"), null);
  const materiais = (await bots()).slice(-3).join("\n"); // resposta longa: vai em até 3 balões
  ok("FAQ real: materiais e papéis (lista enviada pela gráfica)", /Fosco, Brilho, Holográfico e Transparente 100%/.test(materiais) && /Fotográfico Matte 180g, Offset 120g, 180g e 240g, e Sulfite 75g/.test(materiais) && /Couché Fotográfico 200g/.test(materiais) && /outros materiais sob consulta/.test(materiais));

  await handleMessage(msg("qual o prazo de entrega?"), null);
  ok("FAQ real: prazos das tabelas (folhetos 4 a 5 dias, banners 2, camisetas 2 a 3)", /4 a 5 dias/.test((await bots()).at(-1)!) && /2 dias/.test((await bots()).at(-1)!) && /2 a 3 dias/.test((await bots()).at(-1)!));

  await handleMessage(msg("não tenho arte, preciso criar meu logo"), null);
  c = (await conv())!;
  const art = (await bots()).slice(-2).join("\n");
  ok("arte: responde que a criação já está inclusa (sem cobrar) e não manda para atendente", /inclusa/.test(art) && /não cobramos/.test(art) && c.status === "bot", `${c.status} / ${c.sector?.name ?? "sem setor"}`);

  await handleMessage(msg("se eu mandar a arte pronta tem desconto?"), null);
  const disc = (await bots()).slice(-2).join("\n");
  ok("desconto por arte própria: explica que não há, porque a arte já está inclusa", /não há desconto/.test(disc) && /inclusa/.test(disc), disc.replace(/\n/g, " ").slice(0, 120));

  // pergunta de preço junto com arte: sem IA ligada, a resposta pronta ainda atende (IA tem prioridade quando ligada)
  await handleMessage(msg("mando a arte pronta, quanto fica mil cartões?"), null);
  ok("pergunta composta (arte + preço) sem IA: cai na resposta pronta em vez de ficar muda", /inclusa/.test((await bots()).slice(-2).join("\n")));

  // para o teste da fila, leva esta conversa para um setor
  await prisma.wppConversation.update({ where: { id: c.id }, data: { status: "waiting", sectorId: (await prisma.wppSector.findFirst({ where: { name: { startsWith: "Arte" } } }))!.id, queuedAt: new Date() } });
  c = (await conv())!;
  const before = c.messages.length;
  await handleMessage(msg("pode ser pra amanhã?"), null);
  c = (await conv())!;
  ok("na fila o bot fica quieto (só registra a mensagem)", c.messages.length === before + 1 && c.messages.at(-1)!.fromRole === "client");

  await handleMessage(msg("fila"), null);
  ok("cliente pergunta a posição na fila", /fila/.test((await bots()).at(-1)!));

  // liberar e testar texto sem sentido sem IA
  await prisma.wppConversation.updateMany({ where: { clientPhone: PHONE }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
  clientStates.clear();
  await handleMessage(msg("asdkjh qwe"), null);
  const t = await bots();
  ok("conversa nova com texto solto mostra o menu", t.some((b) => b.includes("1 - Fazer orçamento")), "sem IA, cai no menu");

  // pedido de falar com uma pessoa: atende na hora, no setor do assunto, sem cair no menu
  await prisma.wppConversation.updateMany({ where: { clientPhone: PHONE }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
  clientStates.clear();
  await handleMessage(msg("bom dia"), null);
  ok("bom dia (sem IA): mostra o menu com a saudação certa", /Bom dia|Boa tarde|Boa noite/.test((await bots()).at(-1) ?? ""));
  await handleMessage(msg("quero falar com um atendente sobre meu pagamento"), null);
  c = (await conv())!;
  ok("pediu atendente: vai para a fila do setor do assunto (Financeiro)", c.status === "waiting" && c.sector?.name === "Financeiro", `${c.status} / ${c.sector?.name}`);
  ok("responde com simpatia antes de encaminhar", (await bots()).some((b) => /Já vou chamar alguém da equipe/.test(b)));
  await prisma.wppConversation.updateMany({ where: { clientPhone: PHONE }, data: { status: "closed", closedBy: "system", closedAt: new Date() } });
  clientStates.clear();
  await handleMessage(msg("oi"), null);
  await handleMessage(msg("tem alguém aí? quero uma pessoa pra fazer um orçamento"), null);
  c = (await conv())!;
  ok("pediu pessoa para orçamento: setor Orçamentos", c.status === "waiting" && c.sector?.name === "Orçamentos", `${c.status} / ${c.sector?.name}`);

  // limpeza
  const ids = (await prisma.wppConversation.findMany({ where: { clientPhone: PHONE } })).map((x) => x.id);
  await prisma.wppConversation.deleteMany({ where: { id: { in: ids } } });
  await prisma.wppContactMemory.deleteMany({ where: { phone: PHONE } });
  await prisma.wppBotConfig.update({ where: { id: cfg.id }, data: { botEnabled: cfg.botEnabled, aiEnabled: cfg.aiEnabled } });
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
