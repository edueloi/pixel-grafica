// Leitura e validação de planilhas (xlsx, xls, ods, csv) do registro de serviços.
// Formato da planilha de controle da Pixel: data, cliente, serviços executados, venda, custo, lucro, <sócios>, pagamento executado, valor pago.
// Lucro e a parte de cada sócio são CALCULADOS pelo sistema (venda − custo, e a divisão configurada): essas colunas são reconhecidas e ignoradas.
import * as XLSX from "xlsx";
import { strip } from "./text.js";

export const MAX_IMPORT_ROWS = 5000;

export interface ServiceInput {
  date: string | null; // ISO
  customerName: string; description: string; category: string | null;
  quantity: number; unitPrice: number; total: number;       // total = venda
  cost: number; amountPaid: number; paid: boolean;           // custo, valor pago e "pago por inteiro"
  paymentMethod: string | null; notes: string | null;
}
export interface ParsedRow extends ServiceInput { line: number; errors: string[]; warnings: string[]; duplicate?: boolean }

const norm = (s: unknown) => strip(String(s ?? "")).replace(/[^a-z0-9]/g, "");

// Nomes de coluna aceitos (já normalizados: sem acento, minúsculos, só letras/números)
const ALIASES: Record<string, string[]> = {
  date: ["data", "dia", "datadoservico", "dataservico", "dataentrega", "datadaentrega", "datalancamento", "datadavenda", "datavenda"],
  customerName: ["cliente", "nome", "nomedocliente", "comprador"],
  description: ["servico", "servicos", "descricao", "produto", "item", "descricaodoservico", "servicoproduto", "servicosexecutados", "servicoexecutado", "servicosrealizados",
    "servicosecevutados", "servicoecevutado"], // a planilha da gráfica tem o cabeçalho "servicos ecevutados"
  category: ["categoria", "tipo", "grupo"],
  quantity: ["quantidade", "qtd", "qtde", "qte", "quant"],
  unitPrice: ["valorunitario", "precounitario", "unitario", "preco", "valorunit", "vlunit", "valorun"],
  total: ["venda", "valordavenda", "valorvenda", "total", "valor", "valortotal", "vltotal", "valordoservico"],
  cost: ["custo", "valorcusto", "custototal", "vlcusto", "custos"],
  profit: ["lucro", "margem", "lucroliquido"],
  paidPercent: ["pagamentoexecutado", "percentualpago", "pctpago", "percentualdepagamento", "pagoporcento"],
  amountPaid: ["valorpago", "valorrecebido", "recebido", "vlpago", "valorquitado"],
  paymentMethod: ["pagamento", "formadepagamento", "formapagamento", "forma", "meiodepagamento", "meiopagamento"],
  status: ["situacao", "status", "pago", "statuspagamento", "situacaopagamento"],
  notes: ["observacao", "observacoes", "obs", "anotacoes", "anotacao"],
};
export const FIELD_LABEL: Record<string, string> = {
  date: "Data", customerName: "Cliente", description: "Serviço", category: "Categoria", quantity: "Quantidade", unitPrice: "Valor unitário",
  total: "Venda", cost: "Custo", profit: "Lucro (calculado pelo sistema)", paidPercent: "% pago", amountPaid: "Valor pago",
  paymentMethod: "Forma de pagamento", status: "Situação", notes: "Observação", partnerShare: "Parte do sócio (calculada pelo sistema)",
};
// colunas que o sistema calcula sozinho: reconhecidas, mas o valor da planilha não é usado
const DERIVED = new Set(["profit", "partnerShare"]);

const fieldOf = (header: unknown, partnerNames: string[] = []): string | null => {
  const h = norm(header);
  if (!h) return null;
  if (partnerNames.some((p) => norm(p) === h)) return "partnerShare";
  for (const [field, names] of Object.entries(ALIASES)) if (names.includes(h)) return field;
  return null;
};

// ── Conversores ──────────────────────────────────────────────────────────────
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

export function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const x = new Date(v.getTime() + 12 * 3600e3); // evita o desvio de fuso do Excel
    return noon(x.getFullYear(), x.getMonth() + 1, x.getDate());
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const c = XLSX.SSF.parse_date_code(v);
    return c ? noon(c.y, c.m, c.d) : null;
  }
  const s = String(v ?? "").trim();
  // ano de 4 dígitos primeiro (senão "2026" seria lido como "20"); (?!\d) impede ler só parte do ano
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? validYmd(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
function validYmd(y: number, mo: number, d: number): Date | null {
  const dt = noon(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && y >= 2000 ? dt : null;
}

// "R$ 1.234,56" | "1234,56" | "1234.56" | 1234.56
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$|^-/.test(s);
  s = s.replace(/[()-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// "100%" | 100 | 1 (célula de % do Excel = 1) | "50" → fração 0..1; vazio → null
export function parsePercent(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const hasSign = typeof v === "string" && v.includes("%");
  const n = parseMoney(String(v).replace("%", ""));
  if (n === null) return null;
  if (hasSign) return Math.min(Math.max(n / 100, 0), 10);
  return n <= 1 ? n : n / 100;
}

const PAID = new Set(["pago", "paga", "sim", "s", "quitado", "recebido", "paid", "ok", "1", "true", "x"]);
const PENDING = new Set(["pendente", "aberto", "nao", "n", "areceber", "fiado", "0", "false", "devendo", "aguardando"]);
const parsePaid = (v: unknown): boolean | undefined => {
  const s = norm(v);
  if (!s) return undefined;
  if (PAID.has(s)) return true;
  if (PENDING.has(s)) return false;
  return undefined;
};

export function normalizeMethod(v: unknown): string | null {
  const s = strip(String(v ?? ""));
  if (!s) return null;
  if (s.includes("pix")) return "pix";
  if (s.includes("dinheiro") || s === "especie") return "dinheiro";
  if (s.includes("cred")) return "credito";
  if (s.includes("deb")) return "debito";
  if (s.includes("cart")) return "cartao";
  if (s.includes("boleto")) return "boleto";
  if (s.includes("transf") || s === "ted" || s === "doc") return "transferencia";
  return s.slice(0, 30);
}

const money = (n: number) => Math.round(n * 100) / 100;
const unit6 = (n: number) => Math.round(n * 1e6) / 1e6;
const text = (v: unknown, max: number) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s ? s.slice(0, max) : null; };

type Raw = Partial<Record<keyof ServiceInput | "paidPercent", unknown>>;

/**
 * Valida e normaliza uma linha (usado na prévia e de novo na confirmação: o navegador nunca é confiado).
 * Valor pago: o informado > % pago × venda > "pago" (sim) = venda > 0. Venda vazia não é erro: o serviço entra como "a orçar".
 */
export function normalizeInput(raw: Raw): { value: ServiceInput; errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const date = raw.date ? parseDate(raw.date) : null;
  if (!date) errors.push("Data inválida ou vazia");
  else if (date.getTime() > Date.now() + 366 * 86400e3) errors.push("Data muito distante no futuro");

  const description = text(raw.description, 300);
  if (!description) errors.push("Serviço sem descrição");
  const customerName = text(raw.customerName, 160) ?? "Cliente avulso";

  let quantity = parseMoney(raw.quantity) ?? 1;
  let unitPrice = parseMoney(raw.unitPrice);
  let total = parseMoney(raw.total);
  if (quantity <= 0) { errors.push("Quantidade precisa ser maior que zero"); quantity = 1; }
  if (total === null && unitPrice !== null) total = money(quantity * unitPrice);
  if (unitPrice === null && total !== null) unitPrice = unit6(total / quantity);
  if (total === null || unitPrice === null) { total = 0; unitPrice = 0; }
  if (total < 0 || unitPrice < 0) errors.push("Venda negativa");
  if (total === 0) warnings.push("Sem valor de venda: entra como \"a orçar\"");

  const cost = parseMoney(raw.cost) ?? 0;
  if (cost < 0) errors.push("Custo negativo");
  else if (total > 0 && cost > total) warnings.push("Custo maior que a venda (prejuízo)");

  let amountPaid = parseMoney(raw.amountPaid);
  if (amountPaid === null) {
    const pct = parsePercent(raw.paidPercent);
    amountPaid = pct !== null ? money(total * pct) : raw.paid === true ? total : 0;
  }
  if (amountPaid < 0) errors.push("Valor pago negativo");
  else if (amountPaid > total + 0.005) errors.push("Valor pago maior que a venda");
  amountPaid = money(Math.min(Math.max(amountPaid, 0), Math.max(total, 0)));

  return {
    errors, warnings,
    value: {
      date: date ? date.toISOString() : null, customerName, description: description ?? "", category: text(raw.category, 80),
      quantity: money(quantity), unitPrice: unit6(unitPrice), total: money(total), cost: money(Math.max(cost, 0)), amountPaid,
      paid: total > 0 && amountPaid >= total - 0.005, paymentMethod: normalizeMethod(raw.paymentMethod), notes: text(raw.notes, 500),
    },
  };
}

export const duplicateKey = (r: { date: string | Date | null; customerName: string; description: string; total: number }) => {
  const d = r.date ? new Date(r.date) : null;
  const day = d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : "";
  return `${day}|${strip(r.customerName)}|${strip(r.description)}|${money(r.total).toFixed(2)}`;
};

// ── Planilha → linhas ────────────────────────────────────────────────────────
export interface SheetResult { rows: ParsedRow[]; columns: { header: string; field: string | null }[]; truncated: boolean; missing: string[] }

export function parseSheet(buffer: Buffer, fileName: string, partnerNames: string[] = []): SheetResult {
  let wb: XLSX.WorkBook;
  try {
    // CSV brasileiro costuma usar ";" e vírgula decimal: o XLSX detecta o separador sozinho
    // No CSV, raw:true mantém tudo como texto: o leitor não "adivinha" 03/04/2026 como data americana (a conversão dia/mês/ano é nossa)
    const csv = /\.(csv|txt)$/i.test(fileName);
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: csv, codepage: csv ? 65001 : undefined });
  } catch {
    throw new Error("Não consegui abrir o arquivo. Use .xlsx, .xls, .ods ou .csv.");
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha está vazia.");
  // raw:true mantém números e datas como tipos reais (em vez de texto formatado)
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });

  // cabeçalho: primeira linha (entre as 10 primeiras) com pelo menos 2 colunas conhecidas
  let headerAt = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    if (grid[i].filter((c) => fieldOf(c, partnerNames) && fieldOf(c, partnerNames) !== "partnerShare").length >= 2) { headerAt = i; break; }
  }
  if (headerAt < 0) throw new Error("Não achei o cabeçalho. A primeira linha precisa ter colunas como Data, Cliente, Serviço e Venda.");

  const header = grid[headerAt];
  const colField: (string | null)[] = [];
  const seen = new Set<string>();
  header.forEach((h) => {
    const f = fieldOf(h, partnerNames);
    if (f && f !== "partnerShare" && seen.has(f)) colField.push(null); // coluna repetida: vale a primeira
    else { if (f) seen.add(f); colField.push(f); }
  });
  const columns = header.map((h, i) => ({ header: String(h ?? "").trim(), field: colField[i] })).filter((c) => c.header);

  const missing = ["date", "description"].filter((f) => !seen.has(f)).concat(seen.has("total") || seen.has("unitPrice") ? [] : ["total"]);
  // planilha SEM nenhuma coluna de pagamento = histórico já recebido; COM coluna, célula vazia = ainda não pago
  const hasPayCols = seen.has("status") || seen.has("paidPercent") || seen.has("amountPaid");

  const data = grid.slice(headerAt + 1);
  const truncated = data.length > MAX_IMPORT_ROWS;
  const rows: ParsedRow[] = [];
  data.slice(0, MAX_IMPORT_ROWS).forEach((cells, idx) => {
    if (cells.every((c) => String(c ?? "").trim() === "")) return;
    const rec: Record<string, unknown> = {};
    colField.forEach((f, i) => { if (f && !DERIVED.has(f)) rec[f] = cells[i]; });
    const paid = parsePaid(rec.status) ?? (hasPayCols ? undefined : true);
    const date = rec.date instanceof Date || typeof rec.date === "number" ? parseDate(rec.date)?.toISOString() : (rec.date as string);
    const { value, errors, warnings } = normalizeInput({ ...rec, paid, date } as Raw);
    rows.push({ ...value, line: headerAt + 2 + idx, errors, warnings });
  });
  return { rows, columns, truncated, missing };
}

export const TEMPLATE_CSV = "Data;Cliente;Serviço;Venda;Custo;Pagamento executado;Valor pago;Forma de pagamento;Observação\n"
  + "20/02/2026;Doçura da Ra - Medeiros;Banner 90x60;85,00;26,00;100%;85,00;Pix;\n"
  + "23/02/2026;RFM;1 camiseta GG + nome;75,00;45,00;100%;75,00;Dinheiro;\n"
  + "28/02/2026;Filipe Gravação;Cartão Premium;;;;;;Ainda sem valor: entra como \"a orçar\"\n";
