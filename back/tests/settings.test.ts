import "../src/env.js";
import { prisma } from "../src/db.js";
import { getSettings, saveSettings, DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.js";
import { quotePdf } from "../src/lib/documents.js";

const ok = (name: string, c: boolean, extra = "") => console.log(`${c ? "OK   " : "FALHA"} ${name}${extra ? " — " + extra : ""}`);

async function main() {
  const before = await getSettings();
  await prisma.setting.deleteMany();
  const d = await getSettings();
  ok("sem nada salvo: usa os padrões", d.quoteValidityDays === 15 && d.defaultLeadDays === 5 && d.categories.length > 0);
  ok("padrão dos termos: a arte é inclusa (não cobra à parte)", /arte está inclusa/.test(d.quoteTerms) && !/arte[^.]*cobrados à parte/.test(d.quoteTerms));

  let s = await saveSettings({ quoteValidityDays: 30, categories: ["A", " a ", "B", "", "A"], messages: { quote: "Oi {nome}!" } });
  ok("salva e relê (validade 30 dias, mensagem do orçamento)", s.quoteValidityDays === 30 && (await getSettings()).messages.quote === "Oi {nome}!");
  ok("categorias: sem vazias, sem repetidas exatas", JSON.stringify(s.categories) === JSON.stringify(["A", "a", "B"]), JSON.stringify(s.categories));
  ok("o que não foi enviado continua como estava", s.defaultLeadDays === 5 && s.messages.payment === DEFAULT_SETTINGS.messages.payment);

  s = await saveSettings({ quoteValidityDays: -3, defaultLeadDays: "abc", messages: { stage: { producao: "  " } } });
  ok("valores inválidos são ignorados (mantém o salvo)", s.quoteValidityDays === 30 && s.defaultLeadDays === 5 && s.messages.stage.producao === DEFAULT_SETTINGS.messages.stage.producao);

  s = await saveSettings({ messages: { stage: { pronto: "Pronto, {nome}!" } } });
  ok("mensagem de uma etapa não apaga as outras", s.messages.stage.pronto === "Pronto, {nome}!" && s.messages.stage.arte === DEFAULT_SETTINGS.messages.stage.arte);

  ok("mergeSettings aceita lixo", mergeSettings(DEFAULT_SETTINGS, "x" as any).quoteValidityDays === 15);

  // os termos configurados vão para o PDF do orçamento
  const q = await prisma.quote.findFirst({ select: { id: true } });
  if (q) {
    await saveSettings({ quoteTerms: "TERMO-DE-TESTE" });
    const pdf = await quotePdf(q.id);
    ok("PDF do orçamento gera com os termos configurados", !!pdf && pdf.buffer.length > 2000 && pdf.buffer.subarray(0, 4).toString() === "%PDF");
  }

  // restaura o que existia
  await prisma.setting.deleteMany();
  await saveSettings(before);
  console.log("limpeza feita");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
