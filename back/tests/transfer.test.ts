// Contra a API em execução (npm run dev): transferência para pessoa/setor e contadores do menu.
import "../src/env.js";
import { prisma } from "../src/db.js";

const B = `http://localhost:${process.env.PORT || 3100}/api`;
let token = "";
const call = async (m: string, u: string, body?: unknown) => {
  const r = await fetch(B + u, { method: m, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: (await r.json().catch(() => ({}))) as any };
};
const ok = (n: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${n}${extra ? " — " + extra : ""}`);
const PHONE = "5515966665555";

async function main() {
  let r = await call("POST", "/auth/login", { email: process.env.ADMIN_EMAIL || "admin@pixelgrafica.com.br", password: process.env.ADMIN_PASSWORD || "trocar123" });
  token = r.j.token;
  const admin = r.j.user;

  r = await call("POST", "/users", { name: "Ana Teste", email: "ana.teste@pixel.local", password: "123456", role: "atendente", phone: "(15) 98888-1111" });
  const ana = r.j;
  const sector = (await prisma.wppSector.findFirst({ where: { name: "Financeiro" } }))!;
  const conv = await prisma.wppConversation.create({ data: { clientPhone: PHONE, clientName: "Cliente Transfer", status: "waiting", sectorId: sector.id } });
  await prisma.wppMessage.create({ data: { conversationId: conv.id, fromRole: "client", body: "preciso de ajuda com meu pedido" } });

  r = await call("GET", "/wpp/counts");
  ok("contadores do menu", typeof r.j.fila === "number" && typeof r.j.meus === "number" && r.j.fila >= 1 && r.j.abertos >= r.j.fila, JSON.stringify(r.j));
  r = await call("GET", "/wpp/attendants");
  ok("lista de pessoas para transferir", Array.isArray(r.j) && r.j.some((p: any) => p.id === ana.id && p.hasWhatsapp), r.j.map((p: any) => p.name).join(", "));

  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, {});
  ok("sem pessoa nem setor = 400", r.s === 400, r.j.error);
  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, { userId: "nao-existe" });
  ok("pessoa inexistente = recusado", r.s === 409, r.j.error);

  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, { userId: ana.id });
  ok("transferir direto para uma pessoa", r.s === 200 && r.j.to === "Ana Teste", JSON.stringify(r.j));
  let c = (await prisma.wppConversation.findUnique({ where: { id: conv.id }, include: { messages: true } }))!;
  ok("conversa vira 'em atendimento' com a Ana (sem passar pela fila)", c.status === "active" && c.attendantId === ana.id && c.attendantName === "Ana Teste" && c.attendantPhone === "15988881111", `${c.status} / ${c.attendantName} / ${c.attendantPhone}`);
  ok("histórico registra quem transferiu", c.messages.some((m) => m.fromRole === "system" && m.body.includes("transferiu o atendimento para Ana Teste")));

  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, { userId: ana.id });
  ok("transferir para quem já está com ele é recusado", r.s === 409, r.j.error);
  r = await call("POST", `/wpp/conversations/${conv.id}/messages`, { text: "oi" });
  ok("quem transferiu não consegue mais responder (agora é da Ana)", r.s === 403, r.j.error);

  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, { userId: admin.id });
  ok("volta para o admin", r.s === 200);
  r = await call("POST", `/wpp/conversations/${conv.id}/transfer`, { sectorId: sector.id });
  const back = (await prisma.wppConversation.findUnique({ where: { id: conv.id } }))!;
  c = { ...back, messages: c.messages };
  ok("transferir para setor volta para a fila e limpa o atendente", r.s === 200 && c.status === "waiting" && c.attendantId === null && c.sectorId === sector.id, c.status);

  await prisma.wppConversation.delete({ where: { id: conv.id } });
  await prisma.user.delete({ where: { id: ana.id } });
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
