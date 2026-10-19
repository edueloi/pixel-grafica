// Preferências do sistema, guardadas na tabela Setting (uma linha por chave). Quem não foi alterado usa o padrão abaixo.
import { prisma } from "../db.js";

export const STAGES = ["aguardando_arquivo", "arte", "aprovacao_arte", "producao", "acabamento", "pronto", "entregue", "cancelado"] as const;

export interface Settings {
  quoteValidityDays: number;   // validade padrão de um orçamento novo
  defaultLeadDays: number;     // prazo padrão de entrega de uma ordem de serviço nova
  quoteTerms: string;          // "Condições" no PDF do orçamento
  orderTerms: string;          // "Condições" no PDF da ordem de serviço (vazio = sem bloco)
  categories: string[];        // categorias para classificar os serviços
  messages: {
    quote: string; orderDoc: string; payment: string;
    stage: Record<(typeof STAGES)[number], string>;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  quoteValidityDays: 15,
  defaultLeadDays: 5,
  quoteTerms: "Valores válidos para a validade indicada. A criação de arte está inclusa e não é cobrada. Frete e acabamentos não descritos neste orçamento são combinados à parte. A produção começa após a aprovação da arte e a confirmação do pagamento (ou da entrada combinada).",
  orderTerms: "",
  categories: ["Cartão de visita", "Folheto e panfleto", "Banner e faixa", "Adesivo e vinil", "Camiseta", "Impressão A3/A4", "Outros"],
  messages: {
    quote: "Olá, {nome}! Segue o orçamento nº {numero} da {empresa}, no valor de {valor}.{validade} Qualquer dúvida é só chamar! 💙",
    orderDoc: "Olá, {nome}! Segue a ordem de serviço nº {numero} do seu pedido na {empresa}.{previsao} 💙",
    payment: "Olá, {nome}! Recebemos {valor} do pedido nº {numero} na {empresa}. {saldo}",
    stage: {
      aguardando_arquivo: "Olá, {nome}! Seu pedido nº {numero} foi registrado na {empresa}. Para começarmos, envie a arte ou o arquivo por aqui. 😊",
      arte: "Olá, {nome}! Seu pedido nº {numero} está em criação de arte. Assim que ficar pronta, enviamos para a sua aprovação.",
      aprovacao_arte: "Olá, {nome}! A arte do pedido nº {numero} está pronta para a sua aprovação. Dê uma olhada e nos diga se podemos produzir. ✅",
      producao: "Olá, {nome}! Boa notícia: seu pedido nº {numero} entrou em produção.{previsao}",
      acabamento: "Olá, {nome}! Seu pedido nº {numero} está na fase de acabamento — falta pouco! 🙌",
      pronto: "Olá, {nome}! Seu pedido nº {numero} está pronto! {retirada}{falta} 💙",
      entregue: "Olá, {nome}! O pedido nº {numero} foi entregue. Obrigada pela confiança na {empresa}! 💙",
      cancelado: "Olá, {nome}. O pedido nº {numero} foi cancelado. Se tiver qualquer dúvida, é só responder esta mensagem.",
    },
  },
};

const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const int = (v: unknown, fallback: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; };

/** Junta o que veio com o padrão, descartando o que é inválido. `strict` devolve erro em vez de ignorar. */
export function mergeSettings(base: Settings, input: any): Settings {
  const i = input ?? {};
  const msgIn = i.messages ?? {};
  const stage = { ...base.messages.stage };
  for (const s of STAGES) if (typeof msgIn.stage?.[s] === "string" && msgIn.stage[s].trim()) stage[s] = msgIn.stage[s].trim().slice(0, 1000);
  const cats = Array.isArray(i.categories)
    ? [...new Set(i.categories.map((c: unknown) => String(c ?? "").trim().slice(0, 80)).filter(Boolean))].slice(0, 60) as string[]
    : base.categories;
  const msg = (v: unknown, f: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : f);
  return {
    quoteValidityDays: int(i.quoteValidityDays, base.quoteValidityDays, 1, 365),
    defaultLeadDays: int(i.defaultLeadDays, base.defaultLeadDays, 0, 365),
    quoteTerms: i.quoteTerms === undefined ? base.quoteTerms : text(i.quoteTerms, base.quoteTerms, 2000),
    orderTerms: i.orderTerms === undefined ? base.orderTerms : text(i.orderTerms, base.orderTerms, 2000),
    categories: cats,
    messages: { quote: msg(msgIn.quote, base.messages.quote), orderDoc: msg(msgIn.orderDoc, base.messages.orderDoc), payment: msg(msgIn.payment, base.messages.payment), stage },
  };
}

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return mergeSettings(DEFAULT_SETTINGS, saved);
}

export async function saveSettings(input: any): Promise<Settings> {
  const next = mergeSettings(await getSettings(), input);
  await prisma.$transaction(Object.entries(next).map(([key, value]) =>
    prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })));
  return next;
}
