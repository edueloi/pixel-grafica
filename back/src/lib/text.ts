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
