// Catálogo REAL da Pixel Gráfica Tatuí, transcrito das tabelas de valores enviadas pela gráfica.
// Regra: só entra aqui o que tem preço confirmado. O que é "sob consulta" fica no texto e a IA transfere para uma pessoa.
//
// pricingMode "unit":    tiers = preço POR UNIDADE a partir de minQty.
// pricingMode "package": tiers = TOTAL para aquela quantidade exata (tabela fechada).

// Sobe quando o catálogo/FAQ mudar: o seed então ATUALIZA por nome (nunca duplica).
export const CATALOG_VERSION = 4;

// Títulos das respostas prontas de versões antigas do seed (exemplos genéricos, substituídos pelas respostas reais da Pixel)
export const OLD_FAQ_TITLES = [
  "Horário de funcionamento", "Endereço", "Como enviar a arte (formato do arquivo)", "O que é sangria e margem de segurança", "Não tenho arte / quero criar",
  "Prazo de produção e entrega", "Formas de pagamento", "Entrega e frete", "Prova / aprovação da arte", "Papel couchê, offset, gramatura",
  "Laminação fosca, brilho e verniz", "Quantidade mínima e tiragem", "Reimpressão / erro de impressão",
];

interface Seed {
  name: string; category: string; unit: "un" | "milheiro" | "m2" | "folha"; price: number; minQty?: number; leadTime?: string;
  mode?: "unit" | "package"; tiers?: { minQty: number; price: number }[]; description: string; howItWorks?: string;
}

const pack = (rows: [number, number][]) => rows.map(([minQty, price]) => ({ minQty, price }));

const FOLHETO = "Couchê brilho 90g. Também fazemos outras medidas: 10x20, 20x15, 20x28 e 28x40 cm; qualquer outra medida sob consulta.";

export const products: Seed[] = [
  // ── Impressão A3 a laser ───────────────────────────────────────────────────
  {
    name: "Impressão A3 laser — Offset 180g", category: "Impressão A3", unit: "un", price: 4.5, tiers: [{ minQty: 7, price: 3 }, { minQty: 13, price: 2.5 }],
    description: "Papel A3, impressão a laser em papel offset 180g. Preço por folha: 1 a 6 folhas R$ 4,50; 7 a 12 folhas R$ 3,00; acima de 12 folhas R$ 2,50. Valores válidos para impressão padrão. Outras quantidades e acabamentos: consulte.",
  },
  {
    name: "Impressão A3 laser — Foto Matte 180g (só frente)", category: "Impressão A3", unit: "un", price: 6, tiers: [{ minQty: 7, price: 5 }, { minQty: 13, price: 3.5 }],
    description: "Papel A3, impressão a laser em papel foto matte 180g, só frente. Preço por folha: 1 a 6 folhas R$ 6,00; 7 a 12 folhas R$ 5,00; acima de 12 folhas R$ 3,50. Verso: acréscimo de R$ 3,00 por folha. Outras quantidades e acabamentos: consulte.",
  },
  {
    name: "Impressão A3 laser — Foto Matte 180g (frente e verso)", category: "Impressão A3", unit: "un", price: 9, tiers: [{ minQty: 7, price: 8 }, { minQty: 13, price: 6.5 }],
    description: "Papel A3, impressão a laser em papel foto matte 180g, frente e verso (já inclui o acréscimo de R$ 3,00 por folha do verso). Preço por folha: 1 a 6 folhas R$ 9,00; 7 a 12 folhas R$ 8,00; acima de 12 folhas R$ 6,50.",
  },
  // ── Adesivo vinil ──────────────────────────────────────────────────────────
  {
    name: "Adesivo vinil fosco — folha A4", category: "Adesivo", unit: "un", price: 8, tiers: [{ minQty: 6, price: 6 }, { minQty: 20, price: 5 }],
    description: "Adesivo de vinil fosco, alta qualidade, resistente à água, com corte especial incluso (quadrado, redondo, triangular ou no formato que o cliente escolher). Preço por folha A4: 1 a 5 folhas R$ 8,00; 6 a 19 folhas R$ 6,00; 20 folhas ou mais R$ 5,00. Para maiores quantidades, consulte preço especial. Também trabalhamos com vinil Brilho, Holográfico e Transparente 100% — valores sob consulta.",
    howItWorks: "17 folhas A4 equivalem a 1 m². O corte especial já está incluso no preço.",
  },
  {
    name: "Adesivo vinil fosco — metro quadrado", category: "Adesivo", unit: "m2", price: 80, minQty: 1,
    description: "Adesivo de vinil fosco vendido por metro quadrado: R$ 80,00 o m². Resistente à água, alta qualidade, corte especial incluso. Para maiores quantidades, consulte preço especial.",
    howItWorks: "17 folhas A4 equivalem a 1 m².",
  },
  // ── Folhetos (tabela fechada) ──────────────────────────────────────────────
  {
    name: "Folheto 10x15 — frente e verso", category: "Folheto", unit: "un", price: 215, minQty: 1000, mode: "package", leadTime: "4 a 5 dias úteis",
    tiers: pack([[1000, 215], [2500, 295], [5000, 395], [10000, 585]]),
    description: `Folheto 10x15 cm, frente e verso. ${FOLHETO}`,
  },
  {
    name: "Folheto 10x15 — só frente", category: "Folheto", unit: "un", price: 200, minQty: 1000, mode: "package", leadTime: "4 a 5 dias úteis",
    tiers: pack([[1000, 200], [2500, 275], [5000, 370], [10000, 565]]),
    description: `Folheto 10x15 cm, só frente. ${FOLHETO}`,
  },
  {
    name: "Folheto 7x10 — frente e verso", category: "Folheto", unit: "un", price: 215, minQty: 2000, mode: "package", leadTime: "4 a 5 dias úteis",
    tiers: pack([[2000, 215], [5000, 295], [10000, 385], [20000, 585]]),
    description: `Folheto 7x10 cm, frente e verso. ${FOLHETO}`,
  },
  {
    name: "Folheto 7x10 — só frente", category: "Folheto", unit: "un", price: 200, minQty: 2000, mode: "package", leadTime: "4 a 5 dias úteis",
    tiers: pack([[2000, 200], [5000, 265], [10000, 380], [20000, 565]]),
    description: `Folheto 7x10 cm, só frente. ${FOLHETO}`,
  },
  // ── Banners e faixas (preço fechado por medida) ────────────────────────────
  ...([["90x60", 85], ["100x70", 105], ["150x50", 125], ["40x60", 55], ["100x50", 95], ["100x100", 135], ["100x200", 195], ["130x60", 100]] as [string, number][]).map(
    ([size, price]): Seed => ({
      name: `Banner / faixa ${size} cm`, category: "Banner e faixa", unit: "un", price, minQty: 1, leadTime: "2 dias",
      description: `Banner ou faixa de ${size} cm, valor unitário para impressão padrão. Acabamentos disponíveis: ilhós ou bastão com cordinha. A arte está inclusa: não cobramos pela criação. Qualquer outra medida personalizada: consulte.`,
    }),
  ),
  // ── Cartão de visita (tabela fechada: 500 ou 1000) ─────────────────────────
  {
    name: "Cartão de visita Premium — frente e verso 300g, verniz local e laminação fosca", category: "Cartão de visita", unit: "un", price: 185, minQty: 500, mode: "package",
    tiers: pack([[500, 185], [1000, 210]]),
    description: "Cartão de visita Premium: frente e verso, papel 300g, verniz local e laminação fosca. 500 unidades R$ 185,00; 1.000 unidades R$ 210,00. Adicional de cantos arredondados disponível somente no Premium (+R$ 25,00). Consulte prazos e acabamentos disponíveis.",
  },
  {
    name: "Cartão de visita Comum — frente e verso 300g, verniz total na frente", category: "Cartão de visita", unit: "un", price: 135, minQty: 500, mode: "package",
    tiers: pack([[500, 135], [1000, 155]]),
    description: "Cartão de visita Comum: frente e verso, papel 300g, verniz total na frente. 500 unidades R$ 135,00; 1.000 unidades R$ 155,00. Consulte prazos e acabamentos disponíveis.",
  },
  {
    name: "Cartão de visita Básico — somente frente 250g, verniz total", category: "Cartão de visita", unit: "un", price: 105, minQty: 500, mode: "package",
    tiers: pack([[500, 105], [1000, 115]]),
    description: "Cartão de visita Básico: somente frente, papel 250g, verniz total. 500 unidades R$ 105,00; 1.000 unidades R$ 115,00. Consulte prazos e acabamentos disponíveis.",
  },
  {
    name: "Adicional: cantos arredondados (somente no cartão Premium)", category: "Cartão de visita", unit: "un", price: 25, minQty: 1,
    description: "Adicional de cantos arredondados, disponível somente no cartão de visita Premium. R$ 25,00 por pedido, tanto para 500 quanto para 1.000 unidades. Lance quantidade 1 junto com o cartão Premium.",
  },
  // ── Camisetas em DTF ───────────────────────────────────────────────────────
  {
    name: "Camiseta básica em DTF — estampa frente e costa", category: "Camiseta DTF", unit: "un", price: 60, minQty: 1, leadTime: "2 a 3 dias",
    tiers: [{ minQty: 5, price: 54 }, { minQty: 10, price: 49 }],
    description: "Camiseta básica com estampa em DTF na frente e nas costas. Preço por camiseta: até 4 unidades R$ 60,00; de 5 a 9 R$ 54,00; a partir de 10 R$ 49,00. Tamanhos: P, M, G, GG e GG1; acima de GG1 acrescenta R$ 5,00 por unidade. Cores: preta, cinza mescla, azul marinho e branca.",
  },
  {
    name: "Polo / manga longa em DTF — estampa frente e costa", category: "Camiseta DTF", unit: "un", price: 68, minQty: 1, leadTime: "2 a 3 dias",
    tiers: [{ minQty: 5, price: 62 }, { minQty: 10, price: 57 }],
    description: "Camiseta polo ou manga longa com estampa em DTF na frente e nas costas (R$ 8,00 a mais que a camiseta básica). Preço por peça: até 4 unidades R$ 68,00; de 5 a 9 R$ 62,00; a partir de 10 R$ 57,00. Tamanhos: P, M, G, GG e GG1; acima de GG1 acrescenta R$ 5,00 por unidade. Cores: preta, cinza mescla, azul marinho e branca.",
  },
];

// Respostas prontas. Placeholders {horario} {endereco} {pagamento} {entrega} {telefone} {instagram} vêm de "Dados da empresa";
// se o dado não estiver preenchido, a resposta não é usada (a IA ou uma pessoa responde), em vez de mandar texto vazio.
export const faq: { title: string; phrases: string[]; answer: string; action?: string }[] = [
  {
    title: "Materiais e papéis que trabalhamos",
    phrases: ["quais materiais", "que materiais", "quais papeis", "que papeis", "tipos de papel", "tipos de adesivo", "quais adesivos", "materiais que voces", "papel fotografico", "papel offset", "papel couche", "tipo de vinil", "vinil holografico", "vinil transparente"],
    answer: "Trabalhamos com:\n*Adesivos de vinil:* Fosco, Brilho, Holográfico e Transparente 100%.\n\n*Papéis A4:* Fotográfico Matte 180g, Offset 120g, 180g e 240g, e Sulfite 75g.\n\n*Papéis A3:* Offset 180g, Couché Fotográfico 200g e Couché Brilho 115g.\n\nTambém trabalhamos com outros materiais sob consulta. 😉",
  },
  {
    title: "Prazo de produção",
    phrases: ["prazo", "quanto tempo demora", "demora quanto", "quando fica pronto", "prazo de entrega", "pra quando", "dias para ficar"],
    answer: "O prazo depende do produto: *folhetos* 4 a 5 dias úteis, *banners e faixas* 2 dias e *camisetas em DTF* 2 a 3 dias. Para os demais itens eu confirmo com a equipe. ⏱️",
  },
  {
    title: "Criação de arte",
    phrases: ["nao tenho arte", "criar arte", "criacao de arte", "fazer a arte", "voces fazem arte", "voces fazem a arte", "fazem a arte", "quanto custa a arte", "cobra pela arte", "cobram pela arte", "fazer logo", "criar logo", "designer", "arte esta inclusa", "arte incluida"],
    answer: "Fazemos a arte sim, e ela já está *inclusa* no valor: não cobramos nada à parte pela criação! 🎨\n\nMe conta o que você precisa (logo, textos, cores, medida) que a gente monta pra você.",
  },
  {
    title: "Desconto por mandar a arte",
    phrases: ["desconto se eu mandar", "desconto se mandar", "desconto na arte", "se eu mandar a arte", "se eu enviar a arte", "mando a arte pronta", "arte pronta tem desconto", "levar a arte pronta", "arte propria", "minha propria arte", "tenho a arte pronta"],
    answer: "Você pode mandar a sua arte pronta sim, sem problema! 😊 Só que como a nossa criação de arte já está *inclusa* no valor (a gente não cobra pela arte), não existe um valor de arte para abater, então não há desconto por enviar a sua.\n\nSe preferir que a gente crie, é só me passar logo, textos e cores.",
  },
  {
    title: "Como enviar a arte",
    phrases: ["como envio a arte", "mandar arte", "enviar logo", "enviar a arte", "arquivo para impressao", "mando o arquivo", "qual formato do arquivo"],
    answer: "Pode enviar a arte aqui mesmo pelo WhatsApp que a equipe confere se está tudo certo para imprimir. Se ainda não tiver arte, a gente também faz. 💙",
  },
  {
    title: "Diferença de papéis e gramatura",
    phrases: ["diferenca de papel", "o que e gramatura", "qual a diferenca entre offset", "o que e couche", "o que e sulfite", "papel fosco ou brilho"],
    answer: "*Offset* e *sulfite* são papéis de escrever, bons para textos e documentos. *Couché* tem acabamento liso (fosco ou brilho) e deixa as cores mais vivas. *Gramatura* é a espessura: quanto maior o número (75g, 120g, 180g, 300g), mais firme é o papel. 📄",
  },
  {
    title: "Laminação e verniz",
    phrases: ["laminacao", "plastificacao", "o que e verniz", "verniz localizado", "verniz local", "verniz total", "fosca ou brilho"],
    answer: "*Laminação fosca* dá um toque aveludado e protege contra riscos. *Verniz* realça as cores e protege o papel: o *verniz local* dá brilho só em um detalhe (como a logo) e o *verniz total* cobre toda a face. ✨",
  },
  {
    title: "Problema no pedido",
    phrases: ["reimpressao", "veio errado", "erro na impressao", "defeito", "reclamacao", "problema no pedido", "cor diferente"],
    answer: "Poxa, vamos resolver! Vou chamar alguém da equipe para olhar o seu caso com atenção. 🙏",
    action: "handoff:Acompanhar pedido",
  },
  { title: "Horário de funcionamento", phrases: ["horario", "que horas abre", "que horas fecha", "funcionamento", "abre sabado", "abre domingo", "esta aberto"], answer: "Nosso horário de atendimento: {horario}" },
  { title: "Endereço e localização", phrases: ["endereco", "onde fica", "onde voces ficam", "localizacao", "como chego", "mapa"], answer: "Estamos em: {endereco}" },
  { title: "Formas de pagamento", phrases: ["forma de pagamento", "formas de pagamento", "aceita pix", "aceita cartao", "parcelar", "parcelado", "boleto"], answer: "{pagamento}" },
  { title: "Entrega e retirada", phrases: ["voces entregam", "fazem entrega", "taxa de entrega", "frete", "retirar", "retirada", "motoboy"], answer: "{entrega}" },
  { title: "Contato e redes sociais", phrases: ["instagram", "telefone", "numero de voces", "site de voces", "rede social"], answer: "Telefone: {telefone}\nInstagram: {instagram}" },
];
