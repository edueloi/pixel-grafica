// Registro de serviços e importação de planilha, contra a API em execução (npm run dev).
import "../src/env.js";
import * as XLSX from "xlsx";
import { prisma } from "../src/db.js";

const B = `http://localhost:${process.env.PORT || 3100}/api`;
let token = "";
const call = async (m: string, u: string, body?: unknown) => {
  const r = await fetch(B + u, { method: m, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: (await r.json().catch(() => ({}))) as any };
};
const upload = async (name: string, data: Buffer, type: string) => {
  const fd = new FormData();
  fd.append("file", new Blob([data], { type }), name);
  const r = await fetch(`${B}/services/import/preview`, { method: "POST", headers: { authorization: "Bearer " + token }, body: fd });
  return { s: r.status, j: (await r.json().catch(() => ({}))) as any };
};
const ok = (n: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${n}${extra ? " — " + extra : ""}`);
const TAG = "ZZ-TESTE-IMPORT";

async function main() {
  token = (await call("POST", "/auth/login", { username: "admin", password: process.env.ADMIN_PASSWORD || "Admin@123" })).j.token;
  await prisma.serviceRecord.deleteMany({ where: { description: { contains: TAG } } });

  // ── Excel com cabeçalhos "soltos", datas de verdade, valores em texto brasileiro ──
  const aoa: unknown[][] = [
    ["Relatório de vendas de março"], // linha de título antes do cabeçalho
    ["Data", "Cliente", "Descrição", "Qtd", "Valor", "Forma de pagamento", "Situação", "Coluna inútil"],
    [new Date(2026, 2, 15, 12), "Maria da Silva", `${TAG} Cartão Comum`, 1, 155, "Pix", "Pago", "x"],
    ["16/03/2026", "Padaria Central", `${TAG} Banner 90x60`, 2, "R$ 1.234,56", "Dinheiro", "Pendente", ""],
    ["2026-03-17", "Cliente Teste", `${TAG} Folheto`, 1, "85,5", "Cartão de crédito", "", ""],
    ["xx/yy/2026", "Data ruim", `${TAG} Linha com data inválida`, 1, 10, "", "", ""],
    ["18/03/2026", "Sem serviço", "", 1, 10, "", "", ""],
    ["19/03/2026", "Sem valor", `${TAG} Sem valor algum`, 1, "", "", "", ""],
    [],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "Março");
  const xlsx = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  let r = await upload("vendas.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  ok("prévia do Excel lê o arquivo", r.s === 200 && r.j.rows?.length === 6, `${r.j.rows?.length} linhas`);
  ok("acha o cabeçalho mesmo com título acima e reconhece as colunas", r.j.columns.filter((c: any) => c.field).map((c: any) => c.field).join(",") === "date,customerName,description,quantity,total,paymentMethod,status" && r.j.columns.some((c: any) => !c.field), r.j.columns.map((c: any) => `${c.header}→${c.field ?? "ignorada"}`).join(" | "));
  const rows = r.j.rows;
  const ymd = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  ok("data do Excel (célula de data) lida certo: 15/03/2026", ymd(rows[0].date) === "15/3/2026", ymd(rows[0].date));
  ok("data em texto dd/mm/aaaa lida certo (com ANO 2026): 16/03/2026", ymd(rows[1].date) === "16/3/2026", ymd(rows[1].date));
  ok("data ISO lida certo: 17/03/2026", ymd(rows[2].date) === "17/3/2026", ymd(rows[2].date));
  ok('"R$ 1.234,56" vira 1234.56; total = valor quando não há unitário', rows[1].total === 1234.56 && rows[1].quantity === 2, `total=${rows[1].total} unit=${rows[1].unitPrice}`);
  ok('"85,5" vira 85.50; Pix/Dinheiro/Crédito normalizados', rows[2].total === 85.5 && rows[0].paymentMethod === "pix" && rows[1].paymentMethod === "dinheiro" && rows[2].paymentMethod === "credito", rows.map((x: any) => x.paymentMethod).join(","));
  ok("Pago / Pendente / vazio (a planilha TEM coluna de situação: vazio = ainda não pago)", rows[0].paid === true && rows[1].paid === false && rows[2].paid === false && rows[2].amountPaid === 0);
  ok("data inválida vira erro (não importa errado)", rows[3].errors.some((e: string) => /Data/.test(e)));
  ok("serviço sem descrição vira erro", rows[4].errors.some((e: string) => /descrição/.test(e)));
  ok("linha sem valor NÃO é erro: entra como 'a orçar', com aviso", rows[5].errors.length === 0 && rows[5].total === 0 && rows[5].warnings.some((w: string) => /a orçar/.test(w)), JSON.stringify(rows[5].warnings));
  ok("resumo: 4 válidas (1 a orçar), 2 com erro, soma da venda", r.j.summary.valid === 4 && r.j.summary.errors === 2 && r.j.summary.unpriced === 1 && r.j.summary.sum === 155 + 1234.56 + 85.5, JSON.stringify(r.j.summary));

  // ── confirmação: o servidor valida de novo (não confia no navegador) ──
  const tampered = rows.map((x: any) => ({ ...x, errors: [] })); // finge que não há erros
  let imp = await call("POST", "/services/import", { rows: tampered });
  ok("servidor revalida e ignora linhas inválidas mesmo se o cliente mandar 'sem erros'", imp.s === 201 && imp.j.imported === 4 && imp.j.skippedErrors === 2, JSON.stringify(imp.j));
  const batch = imp.j.batch;
  let list = await call("GET", "/services?q=" + TAG);
  ok("registros gravados e visíveis na lista com resumo", list.j.items.length === 4 && list.j.summary.count === 4 && list.j.summary.total === 155 + 1234.56 + 85.5 && list.j.summary.received === 155 && list.j.summary.toReceive === 1234.56 + 85.5 && list.j.summary.unpricedCount === 1, JSON.stringify(list.j.summary));
  ok("origem 'importacao'", list.j.items.every((i: any) => i.source === "importacao" && i.importBatch === batch));

  // ── duplicados ──
  r = await upload("vendas.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  ok("reenviar a mesma planilha: as 4 linhas boas viram duplicadas", r.j.summary.duplicates === 4 && r.j.rows.filter((x: any) => x.duplicate).length === 4);
  imp = await call("POST", "/services/import", { rows: r.j.rows });
  ok("importar de novo não duplica nada", imp.s === 400 && /Nenhuma linha nova/.test(imp.j.error), imp.j.error);

  // ── desfazer ──
  const undo = await call("DELETE", `/services/import/${batch}`);
  list = await call("GET", "/services?q=" + TAG);
  ok("desfazer remove só aquela importação", undo.s === 200 && undo.j.removed === 4 && list.j.items.length === 0);
  ok("desfazer de novo é recusado", (await call("DELETE", `/services/import/${batch}`)).s === 404);

  // ── CSV brasileiro (; e vírgula decimal): 03/04/2026 é 3 de ABRIL ──
  const csv = `Data;Cliente;Serviço;Quantidade;Valor unitário;Total\n03/04/2026;Joana;${TAG} Adesivo;4;7,50;30,00\n04/04/2026;Joana;${TAG} Camiseta;2;49,00;\n05/04/26;Joana;${TAG} Ano com 2 dígitos;1;10,00;\n`;
  r = await upload("planilha.csv", Buffer.from(csv, "utf8"), "text/csv");
  const d0 = new Date(r.j.rows?.[0]?.date);
  ok("CSV com ';' é lido (3 linhas, sem erro)", r.s === 200 && r.j.rows.length === 3 && r.j.summary.errors === 0, r.j.error ?? "");
  ok("CSV: 03/04/2026 = 3 de ABRIL de 2026 (dia/mês/ano, não formato americano)", d0.getMonth() === 3 && d0.getDate() === 3 && d0.getFullYear() === 2026, d0.toLocaleDateString("pt-BR"));
  ok("CSV: ano de 2 dígitos 05/04/26 = 2026", new Date(r.j.rows[2].date).getFullYear() === 2026, new Date(r.j.rows[2].date).toLocaleDateString("pt-BR"));
  ok("CSV: total calculado = quantidade × unitário quando falta", r.j.rows[1].total === 98 && r.j.rows[0].total === 30, r.j.rows.map((x: any) => x.total).join(","));

  // ── erros de arquivo ──
  r = await upload("lixo.csv", Buffer.from("isto;nao;e;uma;planilha\n1;2;3;4;5\n"), "text/csv");
  ok("planilha sem cabeçalho reconhecível: mensagem clara", r.s === 400 && /cabeçalho/.test(r.j.error), r.j.error);
  r = await upload("vazio.csv", Buffer.from(""), "text/csv");
  ok("arquivo vazio: erro tratado (não derruba o servidor)", r.s === 400, r.j.error);

  // ── A planilha de controle da gráfica (mesmo formato da imagem enviada) ──
  const ctl: unknown[][] = [
    ["data", "cliente", "servicos ecevutados", "venda", "custo", "lucro", "renato", "gui", "pagamento executado", "valor pago"], // "ecevutados" é o erro de digitação da planilha real
    ["28/02/26", `filipe gravacao ${TAG}`, "cartao premuim", "", "", "R$ 0,00", "R$ 0,00", "R$ 0,00", "", "R$ 0,00"],
    ["06/02/26", `vinicius - massa sideral ${TAG}`, "adesivacao traller", "", "", "R$ 0,00", "R$ 0,00", "R$ 0,00", "", "R$ 0,00"],
    ["13/02/26", `juliano - rm reobote - ${TAG}`, "5 bloco de orcamento", "", "", "R$ 0,00", "R$ 0,00", "R$ 0,00", "", "R$ 0,00"],
    ["20/02/26", `docura da ra- medeiros ${TAG}`, "banner  90x 60", "R$ 85,00", "R$ 26,00", "R$ 59,00", "R$ 17,70", "R$ 41,30", "100%", "R$ 85,00"],
    ["20/02/26", `paulista agua e gas ${TAG}`, "1 camiseta g", "R$ 70,00", "R$ 45,00", "R$ 25,00", "R$ 7,50", "R$ 17,50", "100%", "R$ 70,00"],
    ["23/02/26", `rfm ${TAG}`, "1 camiseta gg - + nome", "R$ 75,00", "R$ 45,00", "R$ 30,00", "R$ 9,00", "R$ 21,00", "100%", "R$ 75,00"],
    ["25/02/26", `cliente parcial ${TAG}`, "banner meio pago", "R$ 100,00", "R$ 40,00", "R$ 60,00", "R$ 18,00", "R$ 42,00", "50%", ""], // só o % pago: valor pago = 50% da venda
  ];
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(ctl), "Controle");
  r = await upload("controle.xlsx", Buffer.from(XLSX.write(wb2, { type: "buffer", bookType: "xlsx" })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const m = Object.fromEntries(r.j.columns.map((c: any) => [c.header, c.field]));
  ok("controle: reconhece venda, custo, % pago e valor pago; lucro e sócios são colunas calculadas (ignoradas)", m["venda"] === "total" && m["custo"] === "cost" && m["pagamento executado"] === "paidPercent" && m["valor pago"] === "amountPaid" && m["lucro"] === "profit" && m["renato"] === "partnerShare" && m["gui"] === "partnerShare", JSON.stringify(m));
  ok('controle: "servicos ecevutados" (com o erro de digitação) vira Serviço', m["servicos ecevutados"] === "description");
  ok("controle: 7 linhas, nenhuma com erro (as 3 sem valor entram como a orçar)", r.s === 200 && r.j.rows.length === 7 && r.j.summary.errors === 0 && r.j.summary.unpriced === 3, JSON.stringify(r.j.summary));
  const cr = r.j.rows;
  ok("controle: linhas amarelas (sem valor) = a orçar, nada pago", cr.slice(0, 3).every((x: any) => x.total === 0 && x.cost === 0 && x.amountPaid === 0 && x.paid === false));
  ok("controle: banner R$ 85 / custo R$ 26 / pago 100% = R$ 85 (verde)", cr[3].total === 85 && cr[3].cost === 26 && cr[3].amountPaid === 85 && cr[3].paid === true);
  ok("controle: camisetas 70/45 e 75/45 pagas por inteiro", cr[4].total === 70 && cr[4].cost === 45 && cr[4].paid && cr[5].total === 75 && cr[5].cost === 45 && cr[5].paid);
  ok("controle: só 50% pago → valor pago = R$ 50 (parcial, não quitado)", cr[6].amountPaid === 50 && cr[6].paid === false);
  ok("controle: data 20/02/26 lida como 2026", new Date(cr[3].date).getFullYear() === 2026 && new Date(cr[3].date).getMonth() === 1 && new Date(cr[3].date).getDate() === 20);
  imp = await call("POST", "/services/import", { rows: cr });
  ok("controle: importa as 7 linhas", imp.s === 201 && imp.j.imported === 7 && imp.j.unpriced === 3, JSON.stringify(imp.j));
  list = await call("GET", "/services?q=" + TAG);
  const sm = list.j.summary;
  ok("controle: venda 330, custo 156, LUCRO 174 (59+25+30+60), recebido 280, a receber 50", sm.total === 330 && sm.cost === 156 && sm.profit === 174 && sm.received === 280 && sm.toReceive === 50, JSON.stringify(sm));
  ok("controle: 1 em aberto com valor e 3 a orçar", sm.pendingCount === 1 && sm.unpricedCount === 3);
  const partners = list.j.partners as { name: string; percent: number }[];
  const share = (p: { percent: number }, profit: number) => Math.round(profit * p.percent) / 100;
  ok("sócios: Renato 30% e Gui 70% (a divisão da planilha) — banner de R$ 59 de lucro = 17,70 e 41,30", partners.length === 2 && partners[0].percent === 30 && partners[1].percent === 70 && share(partners[0], 59) === 17.7 && share(partners[1], 59) === 41.3, JSON.stringify(partners));
  ok("filtro 'a orçar' e 'pendente'", (await call("GET", "/services?status=orcar&q=" + TAG)).j.items.length === 3 && (await call("GET", "/services?status=pendente&q=" + TAG)).j.items.length === 1 && (await call("GET", "/services?status=pago&q=" + TAG)).j.items.length === 3);
  await call("DELETE", `/services/import/${imp.j.batch}`);

  // ── Divisão do lucro ──
  const original = (await call("GET", "/services/partners")).j.partners;
  ok("divisão que não soma 100% é recusada", (await call("PUT", "/services/partners", { partners: [{ name: "A", percent: 50 }, { name: "B", percent: 40 }] })).s === 400);
  ok("sócio sem nome / porcentagem inválida são recusados", (await call("PUT", "/services/partners", { partners: [{ name: "", percent: 100 }] })).s === 400 && (await call("PUT", "/services/partners", { partners: [{ name: "A", percent: 120 }] })).s === 400);
  let pp = await call("PUT", "/services/partners", { partners: [{ name: "Ana", percent: 50 }, { name: "Beto", percent: 25 }, { name: "Cris", percent: 25 }] });
  ok("divisão com 3 sócios (50/25/25) é aceita", pp.s === 200 && (await call("GET", "/services/partners")).j.partners.length === 3);
  await call("PUT", "/services/partners", { partners: original });

  // ── CRUD manual ──
  let c = await call("POST", "/services", { date: "2026-04-10", customerName: "Cliente Manual", description: `${TAG} Lançamento manual`, quantity: 3, unitPrice: 10, paid: false });
  ok("lançamento manual: total = 3 × 10", c.s === 201 && c.j.total === 30 && c.j.source === "manual", `total=${c.j.total}`);
  const id = c.j.id;
  ok("buscar um serviço por id", (await call("GET", `/services/${id}`)).j.description.includes("manual"));
  c = await call("PUT", `/services/${id}`, { date: "2026-04-10", customerName: "Cliente Manual", description: `${TAG} Lançamento manual`, quantity: 3, unitPrice: 12, paid: true });
  ok("editar recalcula o total", c.s === 200 && c.j.total === 36 && c.j.paid === true);
  c = await call("PUT", `/services/${id}`, { date: "2026-04-10", customerName: "Cliente Manual", description: `${TAG} Lançamento manual`, quantity: 3, unitPrice: 12, cost: 20, amountPaid: 10 });
  ok("manual: custo e valor pago parcial (lucro = 36 − 20 = 16; pago 10 de 36)", c.s === 200 && c.j.cost === 20 && c.j.amountPaid === 10 && c.j.paid === false);
  ok("manual: valor pago maior que a venda é recusado", (await call("PUT", `/services/${id}`, { date: "2026-04-10", description: "x", quantity: 1, unitPrice: 10, amountPaid: 11 })).s === 400);
  ok("sem descrição = 400", (await call("POST", "/services", { date: "2026-04-10", quantity: 1, unitPrice: 1 })).s === 400);
  ok("filtro por mês e situação (o lançamento está parcialmente pago: aparece em 'pendente', não em 'pago')", (await call("GET", `/services?from=2026-04-01&to=2026-04-30&status=pendente&q=${TAG}`)).j.items.length === 1 && (await call("GET", `/services?from=2026-04-01&to=2026-04-30&status=pago&q=${TAG}`)).j.items.length === 0 && (await call("GET", `/services?from=2026-05-01&to=2026-05-31&q=${TAG}`)).j.items.length === 0);
  ok("excluir", (await call("DELETE", `/services/${id}`)).s === 200 && (await call("GET", `/services/${id}`)).s === 404);

  await prisma.serviceRecord.deleteMany({ where: { description: { contains: TAG } } });
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
