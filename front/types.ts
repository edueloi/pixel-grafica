export type Role = 'admin' | 'atendente' | 'producao' | 'financeiro';

export interface User { id: string; name: string; username?: string | null; email: string; role: Role; phone?: string | null; active?: boolean }

export interface Customer {
  id: string; name: string; company?: string | null; document?: string | null; phone?: string | null; email?: string | null;
  zip?: string | null; street?: string | null; number?: string | null; district?: string | null; city?: string | null; state?: string | null;
  notes?: string | null; active: boolean; createdAt: string; _count?: { orders: number; quotes: number };
}

export interface Product {
  id: string; name: string; category: string; description?: string | null; howItWorks?: string | null; leadTime?: string | null; pricingMode?: 'unit' | 'package'; priceTiers?: { minQty: number; price: number }[] | null; unit: 'un' | 'milheiro' | 'm2' | 'folha';
  price: number; minQty: number; active: boolean;
}

export interface LineItem { id?: string; productId?: string | null; description: string; quantity: number; unitPrice: number; total: number }

export type QuoteStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';
export interface Quote {
  id: string; number: number; status: QuoteStatus; total: number; discount: number; notes?: string | null; validUntil?: string | null;
  source: string; sentAt?: string | null; createdAt: string; customer: Pick<Customer, 'id' | 'name' | 'company' | 'phone'>; items: LineItem[];
  orders?: { id: string; number: number; status: string }[];
}

export type OrderStatus = 'aguardando_arquivo' | 'arte' | 'aprovacao_arte' | 'producao' | 'acabamento' | 'pronto' | 'entregue' | 'cancelado';
export interface Order {
  id: string; number: number; status: OrderStatus; priority: 'normal' | 'urgente'; dueDate?: string | null; total: number; paid: number;
  deliveryType: 'retirada' | 'entrega'; notes?: string | null; createdAt: string;
  customer: Pick<Customer, 'id' | 'name' | 'company' | 'phone'> & Partial<Customer>; items: LineItem[];
  events?: { id: string; status: string; note?: string | null; userName?: string | null; createdAt: string }[];
  payments?: OrderPayment[];
  attachments?: FileItem[]; quote?: { id: string; number: number } | null; _count?: { attachments: number };
}

export interface OrderPayment { id: string; amount: number; method?: string | null; note?: string | null; userName?: string | null; createdAt: string }

export interface Company {
  id: string; name: string; tagline?: string | null; document?: string | null; address?: string | null; phone?: string | null; email?: string | null; instagram?: string | null; website?: string | null;
  hours?: string | null; payment?: string | null; delivery?: string | null; artService?: string | null; notes?: string | null;
}

export interface FileItem {
  id: string; name: string; mime: string; size: number; kind: 'order' | 'customer' | 'quote' | 'knowledge' | 'chat'; aiEnabled: boolean;
  readable?: boolean; fromClient?: boolean; uploadedBy?: string | null; createdAt: string; orderId?: string | null; quoteId?: string | null; customerId?: string | null;
  customer?: { name: string } | null; order?: { number: number } | null; quote?: { number: number } | null;
}

export interface Dashboard {
  counts: Record<string, number>; openOrders: number; lateOrders: number; openQuotes: number; waiting: number; active: number; customers: number; files: number;
  month: { orders: number; revenue: number; received: number; toReceive: number };
  dueSoon: (Order & { customer: { name: string } })[];
}

// ── WhatsApp ────────────────────────────────────────────────────────────────
export interface WppSession { status: 'not_configured' | 'disconnected' | 'qr_pending' | 'connecting' | 'connected'; phone: string | null; qrDataUrl: string | null }

export interface Conversation {
  id: string; status: 'bot' | 'waiting' | 'active' | 'closed'; clientPhone: string; clientName?: string | null; attendantName?: string | null; attendantId?: string | null;
  subject?: string | null; firstMessage?: string | null; updatedAt: string; queuedAt: string; customerId?: string | null;
  sector?: { id: string; name: string } | null; customer?: { id: string; name: string } | null;
  last?: { body: string; fromRole: string; sentAt: string } | null;
}
export interface ChatMessage {
  id: string; fromRole: 'client' | 'attendant' | 'bot' | 'system'; body: string; sentAt: string;
  attachment?: { id: string; name: string; mime: string; size: number; orderId?: string | null } | null;
}
export interface ConversationDetail extends Conversation { messages: ChatMessage[]; customer: (Customer & { id: string }) | null }

export type AiProvider = 'gemini' | 'openai';
export interface BotConfig {
  idleCloseMin: number; idleCloseMsg?: string | null; returnAfterMin: number; welcomeBackMsg?: string | null; askName: boolean;
  botEnabled: boolean; useButtons: boolean; welcomeMsg?: string | null; offHoursMsg?: string | null; aiEnabled: boolean; aiPrompt?: string | null;
  aiProvider: AiProvider; geminiModel: string; openaiModel: string; hasGeminiKey: boolean; hasOpenaiKey: boolean;
  presets: Record<AiProvider, { value: string; label: string }[]>;
}
export interface Attendant { name: string; phone: string; available: boolean; from?: string; to?: string; days?: number[] }
export interface Sector { id: string; name: string; description?: string | null; isActive: boolean; sortOrder: number; attendants: Attendant[] }
export interface FlowOption { key: string; label: string; nextNodeId?: string | null }
export interface FlowNode {
  id: string; type: 'menu' | 'message' | 'sector' | 'ai' | 'end'; title: string; content?: string | null;
  options: FlowOption[]; sectorId?: string | null; isStart: boolean; isActive: boolean; sortOrder: number;
}
export interface Knowledge { id: string; title: string; phrases: string; answer: string; action: string; enabled: boolean; hits: number }

export interface ServiceRecord {
  id: string; date: string; customerId?: string | null; customerName: string; description: string; category?: string | null;
  quantity: number; unitPrice: number; total: number; cost: number; amountPaid: number; paymentMethod?: string | null; paid: boolean; notes?: string | null;
  source: 'manual' | 'pedido' | 'importacao'; orderId?: string | null; importBatch?: string | null; createdBy?: string | null;
}
export interface ServicesResponse {
  items: ServiceRecord[]; truncated: boolean;
  partners: Partner[];
  summary: { count: number; total: number; cost: number; profit: number; received: number; toReceive: number; pendingCount: number; unpricedCount: number };
}
export interface Partner { name: string; percent: number }
export interface ImportRow {
  line: number; date: string | null; customerName: string; description: string; category: string | null; quantity: number; unitPrice: number; total: number;
  cost: number; amountPaid: number; paymentMethod: string | null; paid: boolean; notes: string | null; errors: string[]; warnings: string[]; duplicate?: boolean;
}
export interface ImportPreview {
  fileName: string; rows: ImportRow[]; truncated: boolean; limit: number; missing: string[];
  columns: { header: string; field: string | null; label: string | null }[];
  summary: { total: number; valid: number; errors: number; duplicates: number; unpriced: number; sum: number; cost: number; paid: number };
}

export interface DashboardInsights {
  finance: {
    current: FinanceTotals; previous: FinanceTotals;
    partners: { name: string; percent: number; amount: number }[];
    series: { key: string; label: string; revenue: number; cost: number; profit: number }[];
    byMethod: { method: string; amount: number }[];
  };
  topCustomers: { name: string; total: number; count: number }[];
  topProducts: { name: string; quantity: number; total: number }[];
  lateList: { id: string; number: number; customer: string; dueDate: string; status: string }[];
  receivables: { id: string; number: number; customer: string; total: number; paid: number; status: string }[];
  quotes: { count: number; approved: number; refused: number; pending: number; pendingTotal: number; conversion: number | null };
  recent: { id: string; status: string; note?: string | null; userName?: string | null; createdAt: string; number: number; customer: string }[];
  wpp: { today: number; week: number; resolvedByBot: number; closed: number; avgWaitMin: number | null; perDay: { label: string; count: number }[] };
  newCustomers: number;
}
export interface FinanceTotals { revenue: number; cost: number; profit: number; received: number; toReceive: number; count: number; unpriced: number }

export interface Settings {
  quoteValidityDays: number; defaultLeadDays: number; quoteTerms: string; orderTerms: string; categories: string[];
  messages: { quote: string; orderDoc: string; payment: string; stage: Record<OrderStatus, string> };
}
