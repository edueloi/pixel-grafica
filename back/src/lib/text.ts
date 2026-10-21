// Normaliza texto para comparação (sem acento, minúsculo)
export const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const digits = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
export const cut = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1) + "…" : v);
export const brl = (n: number | string) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Telefone brasileiro → formato guardado no banco (55 + DDD + número)
export function normalizePhone(v: string | null | undefined): string {
  const d = digits(v);
  if (!d) return "";
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

// Compara dois telefones ignorando DDI e o nono dígito
export function samePhone(a?: string | null, b?: string | null): boolean {
  const x = digits(a).replace(/^55/, ""), y = digits(b).replace(/^55/, "");
  if (!x || !y) return false;
  const core = (p: string) => (p.length === 11 ? p.slice(0, 2) + p.slice(3) : p);
  return core(x) === core(y);
}

// CPF/CNPJ com dígitos verificadores (rejeita número digitado errado e sequências repetidas)
export function validDocument(v: string | null | undefined): "cpf" | "cnpj" | null {
  const d = digits(v);
  if (!d || /^(\d)\1+$/.test(d)) return null;
  const calc = (base: string, weights: number[]) => { const r = base.split("").reduce((s, c, i) => s + Number(c) * weights[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) return calc(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[9]) && calc(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[10]) ? "cpf" : null;
  if (d.length === 14) return calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]) ? "cnpj" : null;
  return null;
}
export const validEmail = (v: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "").trim());
