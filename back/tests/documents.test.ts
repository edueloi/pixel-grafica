// Contra a API em execução (npm run dev): PDFs, envio por WhatsApp, pagamentos e aviso na mudança de etapa.
import "../src/env.js";
import fs from "fs";
import { createRequire } from "module";
import { prisma } from "../src/db.js";

const pdfParse = createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js");
const B = `http://localhost:${process.env.PORT || 3100}/api`;
let token = "";
const call = async (m: string, u: string, body?: unknown) => {
  const r = await fetch(B + u, { method: m, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: (await r.json().catch(() => ({}))) as any };
};
const ok = (n: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${n}${extra ? " — " + extra : ""}`);
const OUT = process.env.PDF_OUT;

async function main() {
  token = (await call("POST", "/auth/login", { username: "admin", password: process.env.ADMIN_PASSWORD || "Admin@123" })).j.token;
  // Este teste envia documentos e avisos pelo WhatsApp da API em execução. Com o WhatsApp conectado ele mandaria mensagens de verdade:
  // por segurança só roda com o WhatsApp desconectado (Configurações do WhatsApp > Conexão > Desconectar), nunca contra o número real da gráfica.
  const wa = (await call("GET", "/wpp/status")).j;
  if (wa.status === "connected") { console.log("PULADO: o WhatsApp está conectado e este teste enviaria mensagens de verdade. Desconecte o WhatsApp para rodar."); return; }
  const products = (await call("GET", "/products")).j as any[];
  const cartao = products.find((p) => p.name.startsWith("Cartão de visita Premium"));
  const camiseta = products.find((p) => p.name.startsWith("Camiseta básica"));

  let r = await call("POST", "/customers", { name: "Padaria Pão Quente Ltda", company: "Padaria Pão Quente", phone: "(00) 90000-7777", document: "12345678000190", email: "contato@paoquente.com.br", street: "Rua XV de Novembro", number: "120", district: "Centro", city: "Tatuí", state: "SP", zip: "18270000" });
  const cust = r.j;
  const semFone = (await call("POST", "/customers", { name: "Cliente Sem Telefone" })).j;

  r = await call("POST", "/quotes", {
    customerId: cust.id, discount: 20, validUntil: "2026-12-31", notes: "Entrega junto com o pedido da semana passada.",
    items: [
      { productId: cartao.id, description: cartao.name, quantity: 1, unitPrice: 210 },
      { productId: camiseta.id, description: `${camiseta.name} — 12 peças, cor azul marinho, tamanhos P ao GG`, quantity: 12, unitPrice: 49 },
      { description: "Arte e criação da estampa (valor combinado)", quantity: 1, unitPrice: 80 },
    ],
  });
  const quote = r.j; ok("orçamento criado em rascunho", r.s === 201 && quote.status === "rascunho" && quote.total === 858, `total=${quote.total}`);

  const reread = (await call("GET", `/quotes/${quote.id}`)).j;
  ok("itens ficam na ordem em que foram lançados", reread.items.map((i: any) => i.description.split(" ")[0]).join(",") === "Cartão,Camiseta,Arte", reread.items.map((i: any) => i.description.split(" ")[0]).join(","));
  let pdf = await fetch(`${B}/quotes/${quote.id}/pdf?token=${token}`);
  let buf = Buffer.from(await pdf.arrayBuffer());
  ok("PDF do orçamento", pdf.status === 200 && buf.subarray(0, 4).toString() === "%PDF" && buf.length > 3000 && pdf.headers.get("content-type") === "application/pdf", `${(buf.length / 1024).toFixed(1)} KB`);
  if (OUT) fs.writeFileSync(`${OUT}/orcamento.pdf`, buf);

  r = await call("POST", `/quotes/${quote.id}/send`, { message: "Segue o orçamento" });
  ok("enviar com WhatsApp desconectado: erro claro e nada muda", r.s === 503 && /desconectado/i.test(r.j.error), r.j.error);
  r = await call("GET", `/quotes/${quote.id}`); ok("orçamento continua rascunho após falha", r.j.status === "rascunho" && !r.j.sentAt);

  const semFoneQuote = (await call("POST", "/quotes", { customerId: semFone.id, items: [{ description: "x", quantity: 1, unitPrice: 10 }] })).j;
  r = await call("POST", `/quotes/${semFoneQuote.id}/send`, {}); ok("cliente sem WhatsApp: erro claro", r.s === 400 && /WhatsApp cadastrado/.test(r.j.error), r.j.error);

  r = await call("POST", `/quotes/${quote.id}/order`); const order = r.j; ok("aprovar → ordem de serviço", r.s === 201);
  r = await call("PUT", `/orders/${order.id}`, { dueDate: "2026-11-20", deliveryType: "entrega", priority: "urgente", notes: "Cliente vai buscar às 10h", items: quote.items.map((i: any) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) });
  ok("editar ordem de serviço", r.s === 200 && r.j.priority === "urgente");

  pdf = await fetch(`${B}/orders/${order.id}/pdf?token=${token}`); buf = Buffer.from(await pdf.arrayBuffer());
  ok("PDF da ordem de serviço", pdf.status === 200 && buf.subarray(0, 4).toString() === "%PDF" && buf.length > 3000, `${(buf.length / 1024).toFixed(1)} KB`);
  if (OUT) fs.writeFileSync(`${OUT}/ordem-servico.pdf`, buf);
  r = await call("POST", `/orders/${order.id}/send`, {}); ok("OS: enviar sem WhatsApp conectado = 503", r.s === 503);

  // pagamentos
  r = await call("POST", `/orders/${order.id}/payments`, { amount: 300, method: "pix", note: "Entrada" });
  ok("registrar pagamento", r.s === 201 && r.j.paid === 300, `pago=${r.j.paid}`);
  r = await call("POST", `/orders/${order.id}/payments`, { amount: 9999 }); ok("pagamento maior que o saldo é recusado", r.s === 400, r.j.error);
  r = await call("POST", `/orders/${order.id}/payments`, { amount: 0 }); ok("pagamento zerado é recusado", r.s === 400);
  r = await call("POST", `/orders/${order.id}/payments`, { amount: 100, method: "dinheiro", notify: true });
  ok("pagamento é gravado mesmo se o recibo por WhatsApp falhar", r.s === 201 && r.j.paid === 400 && r.j.notified === false && !!r.j.notifyError, r.j.notifyError);
  let d = (await call("GET", `/orders/${order.id}`)).j;
  ok("detalhe traz pagamentos e total recebido", d.payments.length === 3 - 1 && d.paid === 400, `${d.payments.length} pagamentos`);
  r = await call("DELETE", `/orders/${order.id}/payments/${d.payments[0].id}`); ok("remover pagamento recalcula o recebido", r.s === 200 && r.j.paid === 300, `pago=${r.j.paid}`);
  r = await call("PUT", `/orders/${order.id}`, { items: [{ description: "só um item", quantity: 1, unitPrice: 50 }] });
  ok("não deixa reduzir o total abaixo do já recebido", r.s === 400, r.j.error);

  // mudança de etapa + aviso
  r = await call("PATCH", `/orders/${order.id}/status`, { status: "pronto", notify: true, message: "Seu pedido está pronto!" });
  ok("etapa muda mesmo se o aviso falhar", r.s === 200 && r.j.status === "pronto" && r.j.notified === false && /desconectado/i.test(r.j.notifyError), r.j.notifyError);
  r = await call("PATCH", `/orders/${order.id}/status`, { status: "entregue" });
  ok("sem aviso pedido: notified fica nulo", r.s === 200 && r.j.notified === null);
  // controle de produção já marcado pelo histórico, e data da assinatura = data da entrega
  const text = async () => {
    const buf = Buffer.from(await (await fetch(`${B}/orders/${order.id}/pdf?token=${token}`)).arrayBuffer());
    return String((await pdfParse(buf)).text);
  };
  const today = new Date().toLocaleDateString("pt-BR");
  let pt = await text();
  ok("OS entregue: as 5 etapas do controle trazem a data de hoje", (pt.match(new RegExp(today.replace(/\//g, "\\/"), "g")) ?? []).length >= 6, `${(pt.match(new RegExp(today.replace(/\//g, "\\/"), "g")) ?? []).length} ocorrências da data`);
  ok("OS entregue: data da assinatura preenchida", pt.includes(`Data: ${today}`));
  ok("OS entregue: rótulos do controle presentes", ["Arquivo recebido", "Arte aprovada", "Impressão", "Acabamento e conferência", "Entrega"].every((l) => pt.replace(/\s+/g, " ").includes(l))); // o rótulo longo quebra em 2 linhas no PDF
  await call("PATCH", `/orders/${order.id}/status`, { status: "producao" });
  pt = await text();
  ok("reaberta em produção: assinatura volta em branco e Impressão/Entrega ficam sem data", !pt.includes(`Data: ${today}`) && pt.includes("Data: ____"));
  await call("PATCH", `/orders/${order.id}/status`, { status: "entregue" });
  const rec = await prisma.serviceRecord.count({ where: { orderId: order.id } });
  ok("entregue entra no registro de serviços", rec === 3, `${rec} registro(s)`);
  r = await call("PATCH", `/orders/${order.id}/status`, { status: "producao" });
  ok("reabrir remove do registro de serviços", (await prisma.serviceRecord.count({ where: { orderId: order.id } })) === 0);

  // limpeza
  await call("DELETE", `/orders/${order.id}`);
  for (const q of [quote.id, semFoneQuote.id]) await call("DELETE", `/quotes/${q}`);
  await prisma.attachment.deleteMany({ where: { customerId: { in: [cust.id, semFone.id] } } });
  for (const c of [cust.id, semFone.id]) await call("DELETE", `/customers/${c}`);
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
