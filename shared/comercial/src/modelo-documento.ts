/**
 * Texto fixo e matrizes dos documentos, extraídos dos `.docx` de
 * `Modelos/definitivos/Comercial/` (datados de 07/01/2026).
 *
 * ATENÇÃO — este arquivo é a exceção da pasta. Os vizinhos são cópia byte a
 * byte da referência congelada e não podem ser editados. Este é **escrito**, e
 * a fonte dele são os documentos Word, não o `comercialAPP`. Onde os dois
 * divergem, o documento vence: é o desvio 12 de
 * `specs/009-modulo-comercial/contracts/e0-8-desvios-e-estimativa.md`, e a
 * análise campo a campo está em `contracts/modelos-word.md`.
 *
 * A divisão que organiza o arquivo: o que é **texto fixo** vira constante; o
 * que é **variável por proposta** vira parâmetro de função. É por isso que
 * `textoCondicoesPagamento` recebe as três variáveis do MERGEFIELD em vez de
 * trazer "35%" cravado — o documento preenchido é só um exemplo de preenchimento.
 */

export type ModeloProposta = "padrao" | "hidrojateamento";

export const MODELOS_PROPOSTA: ReadonlyArray<{
  id: ModeloProposta;
  titulo: string;
  descricao: string;
}> = [
  {
    id: "padrao",
    titulo: "Padrão",
    descricao: "Vale para qualquer serviço do catálogo técnico.",
  },
  {
    id: "hidrojateamento",
    titulo: "Hidrojateamento",
    descricao:
      "Matriz, EPI e jornada próprios, e duas tabelas de preço (ONSHORE e OFFSHORE).",
  },
];

// ---------------------------------------------------------------------------
// Índices
// ---------------------------------------------------------------------------

/**
 * Os dois índices batem palavra por palavra com o ÍNDICE dos `.docx` — e com o
 * `COMMERCIAL_INDEX`/`TECHNICAL_INDEX` de `app/proposal-pdf.ts`. É a evidência
 * de que os documentos são a origem editorial do gerador.
 */
export const INDICE_COMERCIAL: readonly string[] = [
  "Filtrovali é a escolha certa para sua obra",
  "Descrição dos serviços que serão executados",
  "Matriz geral de responsabilidade",
  "Previsão de atendimento",
  "Prazo para execução dos serviços",
  "Jornada de trabalho",
  "Descrição de valores",
  "Condições de pagamento",
  "Observações",
  "Impostos",
  "Validade da proposta",
  "Proteção à propriedade intelectual e know-how",
  "Aceite e assinatura da proposta",
];

export const INDICE_TECNICO: readonly string[] = [
  "Filtrovali é a escolha certa para sua obra",
  "Descrição dos serviços que serão executados",
  "Matriz geral de responsabilidade",
  "Previsão de atendimento",
  "Prazo para execução dos serviços",
  "Jornada de trabalho",
  "Escopo técnico",
  "Relatórios",
  "Validade da proposta",
  "Observações",
];

// ---------------------------------------------------------------------------
// Matriz geral de responsabilidade (item 3)
// ---------------------------------------------------------------------------

/**
 * As categorias são os subtítulos que ocupam a largura da tabela no Word. O
 * tipo `Row` da referência não as tem, e o `renderResponsibilityGroup` desenha
 * uma tabela plana — é o que a T071b corrige.
 *
 * A ordem de impressão é contratual e fica centralizada abaixo. Assim a prévia,
 * o formulário e o DOCX não dependem da ordem em que as linhas foram editadas.
 */
export type CategoriaResponsabilidade =
  | "MÃO DE OBRA E EQUIPE TÉCNICA"
  | "EQUIPAMENTOS E MATERIAIS"
  | "CONSUMÍVEIS E UTILIDADES"
  | "LOGÍSTICA"
  | "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE"
  | "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE"
  | "ACESSIBILIDADE E APOIO DE CAMPO"
  | "MEIO AMBIENTE";

export type ResponsavelMatriz = "Filtrovali" | "Contratante";

export const ORDEM_CATEGORIAS_RESPONSABILIDADE = {
  Filtrovali: [
    "MÃO DE OBRA E EQUIPE TÉCNICA",
    "EQUIPAMENTOS E MATERIAIS",
    "CONSUMÍVEIS E UTILIDADES",
    "LOGÍSTICA",
    "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    "MEIO AMBIENTE",
  ],
  Contratante: [
    "MÃO DE OBRA E EQUIPE TÉCNICA",
    "EQUIPAMENTOS E MATERIAIS",
    "CONSUMÍVEIS E UTILIDADES",
    "LOGÍSTICA",
    "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    "ACESSIBILIDADE E APOIO DE CAMPO",
    "MEIO AMBIENTE",
  ],
} as const satisfies Record<ResponsavelMatriz, readonly CategoriaResponsabilidade[]>;

/**
 * Converte as categorias dos rascunhos anteriores para os nomes atuais. Isso
 * mantém propostas já iniciadas na mesma ordem e impede que o DOCX volte a
 * imprimir os títulos antigos depois da padronização.
 */
export function categoriaCanonicaResponsabilidade(
  valor: string,
  responsavel: ResponsavelMatriz,
): string {
  const categoria = String(valor || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  if ([
    "EQUIPAMENTOS E FERRAMENTAS",
    "EQUIPAMENTOS E ACESSÓRIOS",
  ].includes(categoria)) return "EQUIPAMENTOS E MATERIAIS";
  if ([
    "MATERIAIS E CONSUMÍVEIS E UTILIDADES",
    "UTILIDADES",
  ].includes(categoria)) return "CONSUMÍVEIS E UTILIDADES";
  if (categoria === "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE"
    || categoria === "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE") {
    return responsavel === "Filtrovali"
      ? "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE"
      : "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE";
  }
  return categoria;
}

/** Ordena de forma estável; categorias personalizadas vêm depois das oficiais. */
export function ordenarLinhasDeResponsabilidade<T extends { categoria?: string }>(
  linhas: readonly T[],
  responsavel: ResponsavelMatriz,
): T[] {
  const ordem = new Map<string, number>(
    ORDEM_CATEGORIAS_RESPONSABILIDADE[responsavel].map((categoria, indice) => [categoria, indice]),
  );
  return linhas
    .map((linha, indice) => ({ linha, indice }))
    .sort((a, b) => {
      const categoriaA = categoriaCanonicaResponsabilidade(a.linha.categoria || "", responsavel);
      const categoriaB = categoriaCanonicaResponsabilidade(b.linha.categoria || "", responsavel);
      const posicaoA = ordem.get(categoriaA) ?? Number.MAX_SAFE_INTEGER;
      const posicaoB = ordem.get(categoriaB) ?? Number.MAX_SAFE_INTEGER;
      return posicaoA - posicaoB || a.indice - b.indice;
    })
    .map(({ linha }) => linha);
}

export type LinhaResponsabilidade = {
  categoria: CategoriaResponsabilidade;
  responsavel: ResponsavelMatriz;
  item: string;
  /** Coluna NOTA do documento. Vazia na maioria das linhas. */
  nota: string;
  /** Lista aninhada dentro da célula ESCOPO (equipamentos, EPI, efetivo). */
  subitens?: readonly string[];
};

const NOTA_DEBITO = "Será apresentado nota de débito";

/**
 * Catálogo da linha "EQUIPAMENTOS E MATERIAIS" do modelo padrão.
 *
 * Ele deixou de ser uma promessa fixa do documento: na criação da proposta o
 * vendedor escolhe quais itens realmente serão mobilizados. O catálogo segue
 * centralizado aqui para a matriz, a tela e o gerador não divergirem.
 */
export const EQUIPAMENTOS_E_FERRAMENTAS_PADRAO = [
  "1 unidade de limpeza química",
  "1 bomba pneumática",
  "1 unidade de flushing primário",
  "1 unidade de filtragem absoluta/transferência",
  "1 unidade de flushing secundário",
  "1 termovácuo",
  "1 centrífuga",
  "1 trafo 440/380",
  "1 bomba de teste hidrostático",
  "1 bomba de run out",
  "Reservatórios para armazenamento (IBC 1000l) temporário de efluente e óleo",
  "1 Kittiwake",
  "1 contador eletrônico de partículas a laser",
  "1 hidrojato 20k/40k",
] as const;

/** Matriz do modelo padrão — proposta comercial e técnica, item 3. */
export const MATRIZ_PADRAO: readonly LinhaResponsabilidade[] = [
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Filtrovali",
    item: "Disponibilização de equipe técnica especializada para execução dos serviços contratados;",
    nota: "",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Filtrovali",
    item: "Fornecimento de equipamentos necessários à execução, incluindo:",
    nota: "",
    subitens: EQUIPAMENTOS_E_FERRAMENTAS_PADRAO,
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Filtrovali",
    item: "Fornecimento de todos os insumos operacionais, incluindo filtros, produtos químicos, manômetros, mangueiras e demais consumíveis necessários à execução dos serviços;",
    nota: "",
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Um veículo com combustível para translado de hotel/obra e obra/hotel;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Realização de 01 (um) evento de mobilização e desmobilização de equipamentos e equipe técnica;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Hospedagem da equipe Filtrovali em acomodações individuais (duplas), com infraestrutura mínima incluindo internet, televisão e ar-condicionado;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Alimentação da equipe fora das dependências da obra e fora do horário de expediente;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Responsabilidade pelos encargos trabalhistas, previdenciários, tributos e demais obrigações legais incidentes sobre a execução dos serviços;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "PGR, PCMSO e LTCAT modelo padrão indicado pela clínica ocupacional da Contratada;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Fornecimento de Equipamentos de Proteção Individual (EPIs) aos colaboradores, em conformidade com as FISPQs aplicáveis;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Execução dos serviços em conformidade com os padrões técnicos definidos pela Contratante, fabricantes dos equipamentos e normas técnicas vigentes;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Disponibilização de seguro de vida e plano de saúde com cobertura nacional para toda a equipe envolvida.",
    nota: "",
  },
  {
    categoria: "MEIO AMBIENTE",
    responsavel: "Filtrovali",
    item: "Segregação e acondicionamento temporário dos resíduos gerados durante a execução dos serviços, até sua entrega à Contratante para destinação final adequada.",
    nota: "",
  },

  {
    categoria: "LOGÍSTICA",
    responsavel: "Contratante",
    item: "Disponibilização de recursos para carga, descarga e movimentação dos equipamentos dentro do canteiro de obras, incluindo, quando aplicável, caminhão munck, guindastes, empilhadeiras, ponte rolante ou grua, conforme necessidade operacional;",
    nota: "",
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Contratante",
    item: "Alimentação da equipe, durante a jornada de trabalho, dentro do site conforme turno (almoço/janta);",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Disponibilização de 02 (dois) colaboradores para acompanhamento e apoio nas atividades de montagem de peças, mangueiras, tubulações e interligações provisórias;",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Disponibilização de eletricista habilitado para realização de ligações elétricas, instalações provisórias e pequenos reparos em equipamentos, quando previamente autorizados pela Filtrovali;",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Disponibilização de técnico de segurança do trabalho, quando exigido pelas condições da obra ou diretrizes da Contratante;",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Execução de serviços de caldeiraria necessários à fabricação, adequação e instalação de conexões e interligações provisórias;",
    nota: "",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Contratante",
    item: "Fornecimento de materiais para montagem dos provisórios, incluindo pedaços de tubos, flanges, juntas, parafusos, porcas e válvulas;",
    nota: "",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Contratante",
    item: "Disponibilização de bacias de contenção em obra para reservatórios, equipamentos e/ou materiais, quando necessário;",
    nota: "Os equipamentos possuem contenções para pequenos vazamentos",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Contratante",
    item: "Disponibilização de extensões elétricas para alimentação dos equipamentos, quando necessário;",
    nota: "Os equipamentos possuem cabos com aproximadamente 20 metros",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Contratante",
    item: "Disponibilização de sala e/ou contêiner próximo à frente de trabalho, com estrutura mínima para utilização como escritório/laboratório de apoio às análises e elaboração documental;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de água limpa, visualmente translúcida, em volume suficiente para execução dos serviços;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de todo o óleo necessário à execução do flushing primário, isento de água e em condições adequadas de uso;",
    nota: "O volume de óleo terá que preencher a tubulação e o reservatório da unidade hidráulica até o nível seguro para operação",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Disponibilização de iluminação adequada para execução de atividades em período noturno, quando aplicável;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Disponibilização de energia elétrica compatível com os equipamentos a serem utilizados, sendo 220V monofásico e 380V trifásico, com capacidade mínima de 110 amperes;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de ar comprimido limpo e seco em quantidade suficiente para execução dos serviços;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de diesel para equipamentos Filtrovali;",
    nota: "",
  },
  {
    categoria: "ACESSIBILIDADE E APOIO DE CAMPO",
    responsavel: "Contratante",
    item: "Disponibilização de andaimes, plataformas e passarelas, devidamente aterrados e em conformidade com os padrões de segurança exigidos na obra, quando necessário;",
    nota: "",
  },
  {
    categoria: "ACESSIBILIDADE E APOIO DE CAMPO",
    responsavel: "Contratante",
    item: "Garantia de liberação, acessibilidade e disponibilidade integral das frentes de serviço para execução das atividades pela Filtrovali, conforme cronograma previamente acordado entre as partes;",
    nota: "",
  },
  {
    categoria: "ACESSIBILIDADE E APOIO DE CAMPO",
    responsavel: "Contratante",
    item: "Fornecimento de área apropriada para armazenamento de produtos e realização dos serviços de limpeza química com contenção e cobertura para os processos de enchimento, pulverização e circulação pressurizada;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Elaboração e liberação da Análise Preliminar de Risco (APR) e da Permissão de Trabalho (PT), conforme exigências da obra;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Aprovação e liberação dos Boletins de Medição no prazo máximo de 48 (quarenta e oito) horas após seu envio. Na ausência de manifestação dentro deste prazo, os boletins serão considerados automaticamente aprovados para fins de faturamento;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Emissão de atestado de capacidade técnica ao término da execução contratual, como registro formal da prestação dos serviços realizados;",
    nota: "",
  },
  {
    categoria: "MEIO AMBIENTE",
    responsavel: "Contratante",
    item: "Responsabilidade pelo gerenciamento, transporte e destinação final adequada dos efluentes e demais resíduos gerados durante a execução dos serviços.",
    nota: "",
  },
];

// ---------------------------------------------------------------------------
// Hidrojateamento — efetivo e configuração de equipamento
// ---------------------------------------------------------------------------

/**
 * Os comentários #2 e #3 do `.docx` são explícitos: efetivo e configuração
 * "deverão ser definidos em reunião de acordo com a demanda", e o que for
 * definido "deverá permanecer em proposta".
 *
 * Por isso estas listas **não** são texto fixo da matriz: são as opções entre as
 * quais a proposta escolhe, e só a escolhida é impressa. Modelar como um único
 * bloco de texto faria o documento sair prometendo os quatro efetivos ao mesmo
 * tempo.
 */
export type LocalOperacao = "ONSHORE" | "OFFSHORE";

export type EfetivoHidrojateamento = {
  id: string;
  bicos: 1 | 2;
  local: LocalOperacao;
  titulo: string;
  integrantes: readonly string[];
};

export const EFETIVOS_HIDROJATEAMENTO: readonly EfetivoHidrojateamento[] = [
  {
    id: "1-bico-offshore",
    bicos: 1,
    local: "OFFSHORE",
    titulo: "Efetivo para 1 bico e 1 Power box OFFSHORE",
    integrantes: [
      "1 hidrojatista — o hidrojatista vira anjo",
      "1 operador",
      "1 anjo — o anjo vira hidrojatista",
      "1 vigia (caso o serviço for em espaço confinado)",
    ],
  },
  {
    id: "2-bicos-offshore",
    bicos: 2,
    local: "OFFSHORE",
    titulo: "Efetivo para 2 bicos e 2 Power box OFFSHORE",
    integrantes: [
      "2 hidrojatistas — os dois hidrojatistas viram anjo",
      "1 operador",
      "2 anjos — os dois anjos viram hidrojatista",
      "1 vigia (caso o serviço for em espaço confinado)",
    ],
  },
  {
    id: "1-bico-onshore",
    bicos: 1,
    local: "ONSHORE",
    titulo: "Efetivo para 1 bico e 1 Power box ONSHORE",
    integrantes: [
      "1 hidrojatista — o hidrojatista vira anjo",
      "1 operador",
      "1 anjo — o anjo vira hidrojatista",
      "1 assistente",
      "1 vigia (caso o serviço for em espaço confinado)",
    ],
  },
  {
    id: "2-bicos-onshore",
    bicos: 2,
    local: "ONSHORE",
    titulo: "Efetivo para 2 bicos e 2 Power box ONSHORE",
    integrantes: [
      "2 hidrojatistas — os dois hidrojatistas viram anjo",
      "1 operador",
      "2 anjos — os dois anjos viram hidrojatista",
      "1 assistente",
      "1 supervisor (caso necessário participação em reuniões)",
      "1 vigia (caso o serviço for em espaço confinado)",
    ],
  },
];

/**
 * O documento anota, ao lado de cada efetivo, "questionar se vai ter um plantel
 * disponível" na linha do vigia. É pergunta para a reunião de definição, não
 * texto que vai ao cliente — fica aqui para a tela lembrar de perguntar.
 */
export const PERGUNTA_VIGIA_HIDROJATEAMENTO =
  "Havendo espaço confinado, questionar se a contratante terá plantel de vigia disponível.";

export type ConfiguracaoHidrojateamento = {
  id: string;
  titulo: string;
  itens: readonly string[];
};

export const CONFIGURACOES_HIDROJATEAMENTO: readonly ConfiguracaoHidrojateamento[] = [
  {
    id: "1-bico-superficie-plana",
    titulo: "Configuração 1 bico — SUPERFÍCIES PLANAS",
    itens: [
      "1 Power box",
      "1 pistola de hidrojateamento penta 40k ou pefal 22k",
      "Mangueiras 8/8 (definir distância entre o posicionamento do equipamento e o ponto de ataque)",
      "Mangueiras 5/6 — máximo 5 metros por regra",
      "Destorcedor de mangueira",
      "Bico safira",
      "Bico reto/direcional",
      "Scimitar",
    ],
  },
  {
    id: "2-bicos-superficie-plana",
    titulo: "Configuração 2 bicos e 2 Power box — SUPERFÍCIES PLANAS",
    itens: [
      "2 Power box",
      "2 pistolas de hidrojateamento penta 40k ou pefal 22k",
      "Mangueiras 8/8 (definir distância entre o posicionamento do equipamento e o ponto de ataque)",
      "Mangueiras 5/6 — máximo 5 metros por regra",
      "2 destorcedores de mangueira",
      "2 bicos safira",
      "2 bicos reto/direcional",
      "2 Scimitar",
    ],
  },
  {
    id: "1-bico-tubo",
    titulo: "Configuração 1 bico — TUBO",
    itens: [
      "1 pedal",
      "1 rabicho",
      "Mangueiras 8/8 (definir distância entre o posicionamento do equipamento e o ponto de ataque)",
      "Mangueiras 5/6 — máximo 5 metros por regra",
      "Destorcedor de mangueira",
      "Bico radial",
      "Bico “T”",
      "Dagger",
      "Gladios",
    ],
  },
  {
    id: "1-bico-trocador",
    titulo: "Configuração 1 bico — TROCADOR DE CALOR/EVAPORADORES",
    itens: [
      "1 pedal",
      "1 rabicho",
      "1 Tubo jet",
      "Mangueiras 8/8 (definir distância entre o posicionamento do equipamento e o ponto de ataque)",
      "Mangueiras 5/6 — máximo 5 metros por regra",
      "Destorcedor de mangueira",
      "Bico radial",
      "Bico “T”",
      "Dagger",
      "Gladios",
    ],
  },
];

/** Nota da coluna NOTA na linha de equipamentos do documento de hidrojateamento. */
export const NOTA_PRESSAO_HIDROJATEAMENTO =
  "40K trabalhar com mínimo de 30; 20K trabalhar com mínimo de 10k";

export const EPI_HIDROJATEAMENTO_COM_ESPACO_CONFINADO: readonly string[] = [
  "Cinto de segurança tipo paraquedista",
  "Macacão impermeável (PVC ou Tyvek)",
  "Bota de borracha cano longo, solado antiderrapante e biqueira de aço",
  "Óculos de ampla visão ou protetor facial Full Face",
  "Capacete com jugular",
  "Máscara para proteção respiratória",
  "1 medidor de gás para cada colaborador",
  "1 rádio comunicador HT à prova d’água para cada colaborador",
  "Tripé de resgate",
  "Lanterna de cabeça",
  "Lanterna para área interna EX (extrabaixa tensão)",
  "Sistema de insuflação de ar",
];

export const EPI_HIDROJATEAMENTO_SEM_ESPACO_CONFINADO: readonly string[] = [
  "Capacete com jugular",
  "Macacão impermeável (PVC ou Tyvek)",
  "Bota de borracha cano longo, solado antiderrapante e biqueira de aço",
  "Óculos de ampla visão ou protetor facial Full Face",
  "1 rádio comunicador HT à prova d’água para cada colaborador",
];

/**
 * Matriz do modelo de hidrojateamento. As duas primeiras linhas Filtrovali
 * saem sem `subitens`: o efetivo e a configuração vêm da escolha da proposta
 * (`EFETIVOS_HIDROJATEAMENTO`, `CONFIGURACOES_HIDROJATEAMENTO`), pelos
 * comentários #2 e #3 do documento.
 */
export const MATRIZ_HIDROJATEAMENTO: readonly LinhaResponsabilidade[] = [
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Filtrovali",
    item: "Disponibilização de equipe técnica especializada para execução dos serviços contratados;",
    nota: "",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Filtrovali",
    item: "Fornecimento de equipamentos necessários à execução, incluindo 1 hidrojato 20k/40k:",
    nota: NOTA_PRESSAO_HIDROJATEAMENTO,
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Filtrovali",
    item: "Fornecimento dos consumíveis necessários à execução dos serviços de hidrojateamento;",
    nota: "",
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Veículos com combustível para translado de hotel/obra e obra/hotel;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Realização de 01 (um) evento de mobilização e desmobilização de equipamentos e equipe técnica;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Hospedagem da equipe Filtrovali em acomodações individuais (duplas), com infraestrutura mínima incluindo internet, televisão e ar-condicionado;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Filtrovali",
    item: "Alimentação da equipe fora das dependências da obra e fora do horário de expediente;",
    nota: NOTA_DEBITO,
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Responsabilidade pelos encargos trabalhistas, previdenciários, tributos e demais obrigações legais incidentes sobre a execução dos serviços;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    // O documento de hidrojateamento ainda diz PPRA; o padrão já migrou para PGR.
    // Ver "Erros de digitação" em contracts/modelos-word.md — os dois textos
    // convivem hoje, e a escolha de unificar é do mantenedor, não minha.
    item: "PPRA, PCMSO e LTCAT modelo padrão indicado pela clínica ocupacional da Contratada;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Fornecimento de Equipamentos de Proteção Individual (EPIs) e Equipamentos de Proteção Coletiva (EPCs) aos colaboradores, em conformidade com as FISPQs aplicáveis;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Execução dos serviços em conformidade com os padrões técnicos definidos pela Contratante, fabricantes dos equipamentos e normas técnicas vigentes;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E FORMALIDADE",
    responsavel: "Filtrovali",
    item: "Disponibilização de seguro de vida e plano de saúde com cobertura nacional para toda a equipe envolvida.",
    nota: "",
  },
  {
    categoria: "MEIO AMBIENTE",
    responsavel: "Filtrovali",
    item: "Segregação e acondicionamento temporário dos resíduos gerados durante a execução dos serviços, até sua entrega à Contratante para destinação final adequada.",
    nota: "",
  },

  {
    categoria: "LOGÍSTICA",
    responsavel: "Contratante",
    item: "Disponibilização de recursos para carga, descarga e movimentação dos equipamentos dentro do canteiro de obras, incluindo, quando aplicável, caminhão munck, guindastes, empilhadeiras, ponte rolante ou grua, conforme necessidade operacional;",
    nota: "",
  },
  {
    categoria: "LOGÍSTICA",
    responsavel: "Contratante",
    item: "Alimentação da equipe, durante a jornada de trabalho, dentro do site conforme turno (almoço/janta);",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Disponibilização de 02 (dois) colaboradores para acompanhamento e apoio nas atividades de montagem de peças, mangueiras, tubulações e interligações provisórias;",
    nota: "",
  },
  {
    categoria: "MÃO DE OBRA E EQUIPE TÉCNICA",
    responsavel: "Contratante",
    item: "Disponibilização de técnico de segurança do trabalho, quando exigido pelas condições da obra ou diretrizes da Contratante;",
    nota: "",
  },
  {
    categoria: "EQUIPAMENTOS E MATERIAIS",
    responsavel: "Contratante",
    item: "Disponibilização de sala e/ou contêiner próximo à frente de trabalho, com estrutura mínima para utilização como escritório/laboratório de apoio às análises e elaboração documental;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de água limpa filtrada ou desmineralizada, visualmente translúcida, em volume suficiente para execução dos serviços;",
    nota: "26 l/m com 40k; 76 l/m com 20k",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Disponibilização de iluminação adequada para execução de atividades em período noturno, quando aplicável;",
    nota: "",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Disponibilização de energia elétrica compatível com os equipamentos a serem utilizados, sendo 220V monofásico e 380V trifásico, com capacidade mínima de 110 amperes;",
    nota: "Para equipamentos de apoio",
  },
  {
    categoria: "CONSUMÍVEIS E UTILIDADES",
    responsavel: "Contratante",
    item: "Fornecimento de diesel para bomba de hidrojato Filtrovali. Poderá ser fornecido pela Contratante e pago pela Filtrovali, ou descontado do contrato;",
    nota: "Se as condições previstas não forem aceitas de forma alguma durante a negociação, a Contratante deverá fornecer as regras de meio ambiente e abastecimento para a Contratada avaliar os termos.",
  },
  {
    categoria: "ACESSIBILIDADE E APOIO DE CAMPO",
    responsavel: "Contratante",
    item: "Disponibilização de andaimes, plataformas e passarelas, devidamente aterrados e em conformidade com os padrões de segurança exigidos na obra, quando necessário;",
    nota: "",
  },
  {
    categoria: "ACESSIBILIDADE E APOIO DE CAMPO",
    responsavel: "Contratante",
    item: "Garantia de liberação, acessibilidade e disponibilidade integral das frentes de serviço para execução das atividades pela Filtrovali, conforme cronograma previamente acordado entre as partes;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Elaboração e liberação da Análise Preliminar de Risco (APR) e da Permissão de Trabalho (PT), conforme exigências da obra;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Aprovação e liberação dos Boletins de Medição no prazo máximo de 48 (quarenta e oito) horas após seu envio. Na ausência de manifestação dentro deste prazo, os boletins serão considerados automaticamente aprovados para fins de faturamento;",
    nota: "",
  },
  {
    categoria: "SEGURANÇA, DOCUMENTAÇÃO E CONFORMIDADE",
    responsavel: "Contratante",
    item: "Emissão de atestado de capacidade técnica ao término da execução contratual, como registro formal da prestação dos serviços realizados;",
    nota: "",
  },
  {
    categoria: "MEIO AMBIENTE",
    responsavel: "Contratante",
    item: "Responsabilidade pelo gerenciamento, transporte e destinação final adequada de resíduos gerados durante a execução dos serviços.",
    nota: "",
  },
];

export function matrizDoModelo(modelo: ModeloProposta): readonly LinhaResponsabilidade[] {
  const matriz = modelo === "hidrojateamento" ? MATRIZ_HIDROJATEAMENTO : MATRIZ_PADRAO;
  return (["Filtrovali", "Contratante"] as const).flatMap((responsavel) =>
    ordenarLinhasDeResponsabilidade(
      matriz.filter((linha) => linha.responsavel === responsavel),
      responsavel,
    ));
}

// ---------------------------------------------------------------------------
// Descrição dos serviços (item 2)
// ---------------------------------------------------------------------------

export const ABERTURA_DESCRICAO_SERVICO =
  "Serviço especializado em mão de obra e execução técnica";

/**
 * Abertura obrigatória de cada subitem do capítulo 2 da proposta comercial.
 *
 * Textos antigos que já começam com a frase não são prefixados novamente. A
 * regra fica compartilhada para a prévia e o DOCX produzirem o mesmo conteúdo.
 */
export function descricaoComAberturaTecnica(descricao: unknown): string {
  const texto = String(descricao ?? "").trim();
  if (!texto) return "";
  if (
    texto
      .toLocaleLowerCase("pt-BR")
      .startsWith(ABERTURA_DESCRICAO_SERVICO.toLocaleLowerCase("pt-BR"))
  ) {
    return texto;
  }
  return `${ABERTURA_DESCRICAO_SERVICO} — ${texto}`;
}

export const DESCRICAO_SERVICOS_HIDROJATEAMENTO = `Serviço especializado em mão de obra e execução técnica na manutenção e hidrojateamento, com objetivo de limpeza, corte, remoção de tinta, remoção de resina e remoção de Smelt em:

Tanque (interno ou externo — costado, teto e chão);
Tubulações;
Superfícies metálicas;
Caldeira.

O hidrojateamento em tubulações deverá utilizar estritamente o máximo de 20k de pressão — é proibido 40k.`;

// ---------------------------------------------------------------------------
// Previsão de atendimento (item 4) e prazos (item 5)
// ---------------------------------------------------------------------------

export const NOTA_ATENDIMENTO_MONTADORA =
  "Nos casos em que o contrato for firmado entre a Filtrovali e a montadora, porém o faturamento ocorrer diretamente para o Cliente Final, a mobilização ficará condicionada à emissão do pedido de compra pelo Cliente Final;";

export const NOTA_ATENDIMENTO_REVALIDACAO =
  "O texto acima deve ser válido a cada mudança de data para atendimento.";

export const TEXTO_PRAZOS_CRONOGRAMA =
  "O cronograma apresentado leva em consideração a disponibilidade de todas as frentes de serviço prontas e liberadas para a equipe Filtrovali. É importante ressaltar que qualquer indisponibilidade das frentes de serviço para a equipe da Filtrovali poderá resultar em alterações no cronograma.";

export const NOTA_PRAZO_DESLOCAMENTO =
  "NOTA: O prazo de deslocamento não está incluso ao prazo previsto de permanência em obra.";

/**
 * As cinco linhas de prazo do documento, na ordem impressa.
 *
 * `dias_treinamento` é a que não tem campo no app hoje — sai impressa sem ter de
 * onde vir. É a T071c.
 */
export type PrazosProposta = {
  /** `n_dias` — permanência em obra, dias corridos. */
  permanencia: string;
  /** `dias_treinamento` — prazo previsto para integração. */
  integracao: string;
  /** `n_dias_trabalhados` — execução, dias trabalhados/úteis. */
  execucao: string;
  /** `dias_mob` — deslocamento (mob/desmob). */
  deslocamento: string;
};

export function linhasDePrazo(prazos: PrazosProposta): readonly string[] {
  return [
    `Prazo previsto de permanência em obra (dias corridos) – ${prazos.permanencia} dia(s);`,
    `Prazo previsto para integração – ${prazos.integracao} dia(s);`,
    `Prazo previsto de execução dos serviços (dias trabalhados/úteis) – ${prazos.execucao} dia(s);`,
    `Prazo de deslocamento (Mob/desmob) – ${prazos.deslocamento} dia(s).`,
  ];
}

// ---------------------------------------------------------------------------
// Jornada de trabalho (item 6)
// ---------------------------------------------------------------------------

export const TEXTO_JORNADA_FLEXIBILIDADE =
  "O horário de entrada e saída das equipes em obra é flexível, podendo se adaptar ao horário do projeto em questão, desde que não ultrapasse 44 horas semanais conforme normas previstas na CLT.";

export const NOTA_JORNADA_HORA_EXTRA =
  "Notas: Os trabalhos em horas extras (sábados, domingos, feriados e além do previsto no item 6.1) poderão ser executados quando solicitado pela Contratante. Será feito o registro em RDO, indicado no campo Horas Extras e lançado na medição como adicional.";

export type TurnoJornada = { titulo: string; linhas: readonly string[] };

const TURNO_DIURNO_ONSHORE: TurnoJornada = {
  titulo: "Turno diurno",
  linhas: [
    "Segunda a quinta-feira – 9 horas trabalhadas – 1 hora de intervalo para almoço",
    "Sexta-feira – 8 horas trabalhadas – 1 hora de intervalo para almoço",
  ],
};

export const JORNADA_PADRAO: readonly TurnoJornada[] = [TURNO_DIURNO_ONSHORE];

/**
 * Hidrojateamento tem **dois** turnos, não um. O OFFSHORE trabalha domingo e
 * feriado, 11 horas — imprimir só o diurno faria a proposta prometer uma jornada
 * que a equipe embarcada não cumpre.
 */
export const JORNADA_HIDROJATEAMENTO: readonly TurnoJornada[] = [
  { ...TURNO_DIURNO_ONSHORE, titulo: "Turno diurno — ONSHORE" },
  {
    titulo: "Turno diurno — OFFSHORE",
    linhas: [
      "Segunda a domingo e feriados – 11 horas trabalhadas – 1 hora de intervalo para almoço",
    ],
  },
];

export function jornadaDoModelo(modelo: ModeloProposta): readonly TurnoJornada[] {
  return modelo === "hidrojateamento" ? JORNADA_HIDROJATEAMENTO : JORNADA_PADRAO;
}

/**
 * A jornada como texto, para semear o campo livre da etapa de prazos.
 *
 * O campo é livre porque a jornada real varia com a obra (parada programada,
 * turno da contratante). O modelo dá o ponto de partida certo — em especial no
 * hidrojateamento, onde esquecer o turno OFFSHORE faz a proposta prometer uma
 * jornada que a equipe embarcada não cumpre.
 */
export function textoJornada(modelo: ModeloProposta): string {
  const turnos = jornadaDoModelo(modelo)
    .map((turno) => [`${turno.titulo}:`, ...turno.linhas].join("\n"))
    .join("\n\n");
  return `${TEXTO_JORNADA_FLEXIBILIDADE}\n\n${turnos}\n\n${NOTA_JORNADA_HORA_EXTRA}`;
}

// ---------------------------------------------------------------------------
// Descrição de valores (item 7)
// ---------------------------------------------------------------------------

export const CABECALHO_TABELA_PRECOS_COM_UNITARIO: readonly string[] = [
  "ITEM",
  "DESCRIÇÃO",
  "VALOR UNIT.",
  "QTD.",
  "VALOR TOTAL",
];

export const CABECALHO_TABELA_PRECOS_SEM_UNITARIO: readonly string[] = [
  "ITEM",
  "DESCRIÇÃO",
  "QTD.",
  "VALOR",
];

/**
 * O modelo de hidrojateamento traz **duas** tabelas, cada uma com seu TOTAL
 * GERAL. É o ponto que torna impossível resolver por catálogo técnico:
 * `renderPriceTable` da referência desenha uma só. É a T071f.
 */
export function tabelasDePrecoDoModelo(
  modelo: ModeloProposta,
): readonly LocalOperacao[] | null {
  return modelo === "hidrojateamento" ? ["ONSHORE", "OFFSHORE"] : null;
}

export const SERVICOS_EXTRA_ESCOPO: readonly string[] = [
  "Para a contratação do serviço de desidratação de óleo sobressalente, ou para contratar o serviço fora do escopo desta proposta, será cobrado o valor de R$ 4,00 por litro de óleo, além dos custos com mobilização e desmobilização do equipamento, caso ele não esteja em campo.",
  "Para a contratação do serviço de filtragem de óleo sobressalente, ou para contratar o serviço fora do escopo desta proposta, será cobrado o valor de R$ 3,00 por litro de óleo, além dos custos com mobilização e desmobilização do equipamento, caso ele não esteja em campo.",
];

/**
 * Comentário #6 do documento de hidrojateamento, e é regra de composição, não
 * recado: **o preço de frete é só ida.** Um frete para ir e outro para voltar,
 * independentemente de o equipamento esperar em obra ou não.
 */
export const REGRA_FRETE_SOMENTE_IDA =
  "O preço de frete cobre somente a ida. Lançar um evento para ir e outro para voltar, independentemente de o equipamento aguardar em obra.";

// ---------------------------------------------------------------------------
// Condições de pagamento (item 8)
// ---------------------------------------------------------------------------

/** As três variáveis do MERGEFIELD dentro do parágrafo de pagamento. */
export type CondicoesPagamento = {
  /** `adto` — percentual antecipado a título de mobilização. */
  adiantamento: string;
  /** `prazo_pgto` — dias para pagamento após a medição. */
  prazoPagamento: string;
  /** `forma_pgto` — ex.: "Depósito em conta". */
  formaPagamento: string;
};

export function textoCondicoesPagamento(condicoes: CondicoesPagamento): string {
  return `A título de mobilização, ${condicoes.adiantamento} antecipado na confirmação dos serviços (recebimento de pedido de compras, contrato ou aceite da proposta por e-mail). Favor aguardar o espelho da nota de serviço para efetuar o pagamento;

Medição quinzenal ou após o encerramento dos serviços, o que ocorrer primeiro, ${condicoes.prazoPagamento} dias para o devido pagamento através de ${condicoes.formaPagamento} (Obs.: após a entrega da medição, a Contratante deverá devolvê-la em até 48 horas; caso não ocorra, a Filtrovali irá considerar a medição como aceita e será emitida a nota para devida cobrança);

Multa e juros por atraso:

Em caso de atraso no pagamento de qualquer valor previsto nesta proposta, incidirá sobre o montante em aberto:

Multa moratória de 2% (dois por cento) sobre o valor da parcela em atraso;

Juros de mora de 0,10% ao dia (zero vírgula dez por cento ao dia), calculados pro rata die a partir do dia seguinte ao vencimento até a data do efetivo pagamento.

O não pagamento nos prazos acordados poderá acarretar a suspensão imediata dos serviços até a regularização dos valores pendentes, sem prejuízo da adoção das medidas legais cabíveis e da cobrança dos custos adicionais decorrentes da paralisação.`;
}

// ---------------------------------------------------------------------------
// Observações (item 9)
// ---------------------------------------------------------------------------

/**
 * Os quatro valores da tabela "Condições de Stand by e Mobilização Adicional".
 * Nenhum deles existe no app hoje — é a T071d.
 */
export type ValoresStandby = {
  /** `valor_he` — homem/hora fora do horário previsto. */
  horaExtra: number;
  /** `valor_standby` — diária de stand-by de equipe. */
  standbyEquipe: number;
  /** `diaria_equipamento` — diária de stand-by de equipamentos. */
  standbyEquipamento: number;
  /** `valor_desmob_extra` — mobilização extra, por evento ida e volta. */
  mobilizacaoExtra: number;
};

function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

export function tabelaStandby(
  valores: ValoresStandby,
): readonly (readonly [string, string])[] {
  return [
    ["Stand-by de Equipe", moeda(valores.standbyEquipe)],
    ["Stand-by de Equipamentos", moeda(valores.standbyEquipamento)],
    [
      "Mobilização Extra (por evento ida e volta)",
      moeda(valores.mobilizacaoExtra),
    ],
  ];
}

/**
 * O item 9 do documento intercala prosa e tabela: a frase da hora extra, o
 * título do bloco, **a tabela**, a explicação de cada linha dela e só então as
 * observações gerais.
 *
 * Por isso as três partes saem separadas em vez de um bloco só — quem desenha
 * precisa encaixar a tabela no meio. `textoObservacoesComerciais` continua
 * existindo para quem quiser o texto corrido.
 */
export function fraseHoraExtra(valorHomemHora: number): string {
  return `Os trabalhos em horas extras (sábados, domingos e feriados) poderão ser executados desde que registrados em RDO no campo Horas Extras e acordados previamente. O valor homem/hora para atividades fora do horário previsto é de ${moeda(valorHomemHora)};`;
}

export const TITULO_BLOCO_STANDBY = "Condições de Stand by e Mobilização Adicional:";

export const TEXTO_EXPLICACAO_STANDBY = `Stand-by de Equipe: quando a equipe permanecer em obra aguardando condições para início ou continuidade dos trabalhos, será cobrado o valor de diária, correspondente a 8 horas, conforme a tabela acima. O serviço é um pacote fechado; sendo assim, qualquer interferência que gere impacto ou não no cronograma acarretará a aplicação da diária de stand-by, por ter interferência direta na performance do projeto.

Stand-by de Equipamentos: a partir da chegada dos equipamentos em obra, caso permaneçam aguardando frente de serviço ou ultrapassem o prazo previsto no item 5.1, será aplicada cobrança diária conforme a tabela. A Contratante deverá avaliar a viabilidade de arcar com esses custos ou optar pela desmobilização/mobilização dos equipamentos. O serviço é um pacote fechado; sendo assim, qualquer interferência que gere impacto ou não no cronograma acarretará a aplicação da diária de stand-by, por ter interferência direta na performance do projeto.

Desmobilização e Remobilização: caso seja necessário desmobilizar a equipe durante a execução do projeto, será cobrado o valor por evento, sendo que cada evento compreende ida e volta — desmobilização e mobilização. Neste caso, a Contratante deverá informar a nova programação de retorno com no mínimo 10 dias de antecedência, permitindo tempo hábil para a ação.

NOTA: O solicitante terá que formalizar o pedido de desmobilização por e-mail, expressando acordo com o item 9.3 e/ou o item 9.4.`;

/** O rabo do item 9 — o que vem depois da explicação do stand-by. */
export const TEXTO_OBSERVACOES_GERAIS = `No caso de prorrogação da data de início dos trabalhos já confirmada pela Contratante, por motivos não imputáveis à Filtrovali, será considerada uma diária no valor de R$ 4.500,00 por dia corrido prorrogado, a título de stand by de equipe e equipamento;

Índice de reajuste anual pelo IGPM ou 10%; será aplicado o maior índice anual;

A proposta deverá fazer parte integrante do contrato;

A Filtrovali possui PCMSO, PGR, LTCAT e ASO, todos de acordo com as atividades desenvolvidas por ela. Se for necessária a emissão de ARTs, PCMSO, PGR, LTCAT e ASO, inclusive Seguro de Responsabilidade Civil, específicos para o projeto em questão, por intermédio do Cliente Final ou da Contratante, os custos para emissão destes documentos específicos serão repassados à Contratante;

A garantia mínima de faturamento é o quantitativo descrito como escopo original (item 7);

Caso a Filtrovali conclua os serviços em prazo inferior ao previsto, tal circunstância não ensejará qualquer direito à Contratante de requerer descontos, abatimentos ou reduções no valor contratado, uma vez que a remuneração pactuada decorre do cumprimento integral das obrigações assumidas, independentemente do tempo efetivamente despendido para sua execução;

A Contratante reconhece que os serviços contratados são parte de um pacote integral, cujo valor foi estipulado considerando sua totalidade. Dessa forma, a eventual desistência, cancelamento ou não utilização de qualquer serviço incluído no pacote não dará direito à Contratante a reembolso, abatimento ou desconto proporcional sobre o valor total contratado, permanecendo a obrigação de pagamento integral nos termos acordados.`;

export function textoObservacoesComerciais(valores: ValoresStandby): string {
  return [
    fraseHoraExtra(valores.horaExtra),
    TITULO_BLOCO_STANDBY,
    TEXTO_EXPLICACAO_STANDBY,
    TEXTO_OBSERVACOES_GERAIS,
  ].join("\n\n");
}


// ---------------------------------------------------------------------------
// Impostos (item 10)
// ---------------------------------------------------------------------------

export const TEXTO_IMPOSTOS = `A Filtrovali se enquadra no regime tributário do lucro presumido.

ISS – O imposto será recolhido no município onde o serviço for efetivamente prestado, conforme a alíquota e a legislação vigentes.

Em conformidade com a Constituição Federal (Art. 146) e a Lei Complementar nº 116/2003, o serviço realizado pela Filtrovali está enquadrado no código 07.02.02. Para esse enquadramento, o ISS deve ser recolhido diretamente no local da execução do serviço. Dessa forma, o recolhimento no município da prestação passa a ser obrigatório, não cabendo retenção ou recolhimento em município diverso.

Caso a Contratante julgue necessário adotar algum procedimento adicional referente ao pagamento do imposto no local da execução, assumirá a responsabilidade pelo referido procedimento.

Reequilíbrio Tributário

Caso, após a data de apresentação da proposta ou assinatura do contrato, ocorra qualquer alteração na legislação tributária, criação, extinção ou modificação de tributos, bem como mudança de alíquotas, bases de cálculo ou forma de incidência que venha a impactar direta ou indiretamente os custos da CONTRATADA, os valores contratados serão ajustados de forma proporcional, de modo a preservar o equilíbrio econômico-financeiro originalmente pactuado.

O eventual acréscimo de custos decorrente de tais alterações será repassado à CONTRATANTE, mediante comprovação do impacto financeiro e apresentação da respectiva atualização de valores.`;

// ---------------------------------------------------------------------------
// Propriedade intelectual (item 12) e aceite (item 13)
// ---------------------------------------------------------------------------

export const TEXTO_PROPRIEDADE_INTELECTUAL = `Todos os métodos, processos, procedimentos operacionais, técnicas, especificações, relatórios, documentos, estudos, desenhos, fluxogramas, parâmetros operacionais e quaisquer outras informações técnicas ou comerciais utilizadas ou desenvolvidas pela FILTROVALI para a execução dos serviços constituem propriedade intelectual exclusiva da Filtrovali, sendo protegidos pela legislação vigente aplicável.

A contratação dos serviços não implica, em hipótese alguma, cessão, transferência ou compartilhamento definitivo de tais direitos, limitando-se o seu uso exclusivamente ao escopo do contrato firmado.

Fica expressamente vedado à CONTRATANTE, seus colaboradores ou terceiros por ela designados:

Reproduzir, copiar, divulgar ou compartilhar, total ou parcialmente, os métodos e processos utilizados pela Filtrovali;

Utilizar tais informações para execução própria ou por terceiros de serviços similares ou concorrentes;

Realizar engenharia reversa, adaptação ou qualquer forma de replicação dos serviços, metodologias ou soluções aplicadas.

Qualquer utilização indevida ou violação desta cláusula sujeitará a CONTRATANTE às medidas legais cabíveis, incluindo, mas não se limitando, à responsabilização por perdas e danos, lucros cessantes e demais sanções previstas na legislação.`;

export const TEXTO_ACEITE = `[    ] Declaro ter lido, compreendido e aceitado integralmente os termos e condições apresentados na presente proposta.

As partes concordam que o aceite deste termo implica na formalização do compromisso, vinculando-se às obrigações, prazos, preços e demais condições especificadas na proposta comercial.`;

export const LINHAS_ASSINATURA: readonly string[] = [
  "Data assinatura:______/______/______",
  "______________________________________",
  "Contratante",
];

// ---------------------------------------------------------------------------
// Relatórios (item 8 da técnica) e observações técnicas (item 10)
// ---------------------------------------------------------------------------

export const TEXTO_RELATORIO_RDO =
  "Será entregue diariamente o RDO (Relatório Diário de Obra), descrevendo quais serviços foram executados referentes ao dia de trabalho;";

export const NOTA_RELATORIOS_APOS_RDO =
  "Obs.: visando a redução de tempo e retrabalho com manutenção de relatórios, os relatórios abaixo só serão elaborados e entregues após a regularização e aprovação dos RDOs.";

export const TEXTO_OBSERVACOES_TECNICAS = `No caso de prorrogação de prazo conforme o item 6.1 (dias trabalhados), descontinuidade dos serviços e/ou caso nossa equipe de campo fique na obra aguardando frente de serviços por motivos não imputáveis à Filtrovali, o fato será relatado e indicado em RDO, no campo Stand-by — uma diária corresponde a 8 horas;

A proposta deverá fazer parte integrante do contrato;

Em casos de eventos de desmobilizações/mobilizações além do previsto, o solicitante terá que formalizar o pedido de desmobilização de equipe ou equipamento por e-mail, expressando acordo com o item 9.3 e/ou 9.4 da proposta comercial.`;

/** Acrescentada pelo documento de hidrojateamento às observações técnicas. */
export const OBSERVACAO_TECNICA_HIDROJATEAMENTO =
  "O revezamento entre o anjo e o hidrojatista deverá ocorrer em até 1 hora consecutiva de hidrojateamento.";

export function observacoesTecnicasDoModelo(modelo: ModeloProposta): string {
  return modelo === "hidrojateamento"
    ? `${TEXTO_OBSERVACOES_TECNICAS}\n\n${OBSERVACAO_TECNICA_HIDROJATEAMENTO}`
    : TEXTO_OBSERVACOES_TECNICAS;
}
