// Mensagens prontas de WhatsApp para o cliente, geradas a partir dos modelos de Configurações. Sempre editáveis antes de enviar.
import { brl, dateLabel } from './format';
import type { Order, OrderStatus, Quote, Settings } from '../types';
import type { TemplateVar } from '../components/VariableEditor';

const first = (name: string) => name.trim().split(/\s+/)[0];
const left = (o: Pick<Order, 'total' | 'paid'>) => Math.max(0, Number(o.total) - Number(o.paid));

/** Variáveis que os modelos aceitam: no texto salvo ficam como {chave}; na tela aparecem como badge com o nome amigável. */
const V = (key: string, label: string, hint: string, example: string): TemplateVar => ({ key, label, hint, example });
export const templateVars: Record<string, TemplateVar> = {
  nome: V('nome', 'Nome', 'Primeiro nome do cliente', 'Maria'),
  empresa: V('empresa', 'Empresa', 'Nome da gráfica', 'Pixel Gráfica'),
  numero: V('numero', 'Número', 'Número do orçamento ou da ordem de serviço', '128'),
  valor: V('valor', 'Valor', 'Valor do orçamento ou do pagamento recebido', 'R$ 350,00'),
  validade: V('validade', 'Validade', 'Frase “Válido até …” do orçamento', 'Válido até 30/11/2026.'),
  previsao: V('previsao', 'Previsão de entrega', 'Frase “Previsão de entrega: …” (some se não houver data)', 'Previsão de entrega: 25/11/2026.'),
  saldo: V('saldo', 'Saldo', 'Quanto ainda falta pagar, ou “pedido quitado”', 'Ainda falta R$ 150,00.'),
  retirada: V('retirada', 'Retirada ou entrega', 'Avisa que já pode retirar na loja ou que vai combinar a entrega', 'Já pode retirar na loja.'),
  falta: V('falta', 'Falta pagar', 'Valor que falta receber (some se já está pago)', 'Falta receber R$ 150,00.'),
};
/** Variáveis que fazem sentido em cada mensagem. */
export const varsFor = (kind: 'quote' | 'orderDoc' | 'payment' | 'stage' | 'ready'): TemplateVar[] =>
  ({
    quote: ['nome', 'empresa', 'numero', 'valor', 'validade'], orderDoc: ['nome', 'empresa', 'numero', 'previsao'], payment: ['nome', 'empresa', 'numero', 'valor', 'saldo'],
    stage: ['nome', 'empresa', 'numero', 'previsao'], ready: ['nome', 'empresa', 'numero', 'previsao', 'retirada', 'falta'],
  })[kind].map((k) => templateVars[k]);
/** Texto de exemplo de cada variável, para a prévia. */
export const sampleVars: Record<string, string> = Object.fromEntries(Object.values(templateVars).map((v) => [v.key, v.example]));

export const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/ {2,}/g, ' ').replace(/ +([.!?,])/g, '$1').trim();

const FALLBACK = 'Olá, {nome}! Aqui é da {empresa}.';
const tpl = (s: Settings | null, pick: (m: Settings['messages']) => string) => (s ? pick(s.messages) : FALLBACK);

export const quoteMessage = (q: Quote, company: string, s: Settings | null) =>
  fill(tpl(s, (m) => m.quote), { nome: first(q.customer.name), empresa: company, numero: String(q.number), valor: brl(q.total), validade: q.validUntil ? ` Válido até ${dateLabel(q.validUntil)}.` : '' });

export const orderDocMessage = (o: Order, company: string, s: Settings | null) =>
  fill(tpl(s, (m) => m.orderDoc), { nome: first(o.customer.name), empresa: company, numero: String(o.number), previsao: o.dueDate ? ` Previsão de entrega: ${dateLabel(o.dueDate)}.` : '' });

export const stageMessage = (o: Order, stage: OrderStatus, company: string, s: Settings | null): string =>
  fill(tpl(s, (m) => m.stage[stage]), {
    nome: first(o.customer.name), empresa: company, numero: String(o.number),
    previsao: o.dueDate ? ` Previsão de entrega: ${dateLabel(o.dueDate)}.` : '',
    retirada: o.deliveryType === 'entrega' ? 'Vamos combinar a entrega com você.' : 'Já pode retirar na loja.',
    falta: left(o) > 0 ? ` Falta receber ${brl(left(o))}.` : '',
  });

export const paymentMessage = (o: Order, amount: number, company: string, s: Settings | null) => {
  const rest = Math.max(0, left(o) - amount);
  return fill(tpl(s, (m) => m.payment), { nome: first(o.customer.name), empresa: company, numero: String(o.number), valor: brl(amount), saldo: rest > 0 ? `Ainda falta ${brl(rest)}.` : 'Pedido quitado, obrigada! 💙' });
};

/** Etapas em que faz sentido avisar o cliente por padrão (a pessoa ainda pode desmarcar). */
export const notifyByDefault = new Set<OrderStatus>(['aprovacao_arte', 'pronto']);
