export const TECHNICAL_CATALOG_VERSION = 1;
export const MAX_TECHNICAL_SERVICES = 11;
export const MAX_TECHNICAL_SERVICE_TEXT = 20_000;

export type TechnicalServiceId =
  | "flushing_primario"
  | "flushing_secundario"
  | "filtragem_hidraulico_lubrificante"
  | "filtragem_oleo_termico"
  | "filtragem_oleo_diesel"
  | "filtragem_oleo_tempera"
  | "desidratacao_oleo"
  | "desidratacao_oleo_diesel"
  | "limpeza_quimica"
  | "hidrojateamento"
  | "passagem_pig"
  | "teste_hidrostatico"
  | "pre_engenharia"
  | "limpeza_reservatorio"
  | "flushing_agua"
  | "boroscopia";

/**
 * `RLF` entrou em 13/08 com o flushing com água. **Não é sigla nova para a
 * empresa**: o filtroAPP já emite RLF (`backend/src/lib/report-rlf.js`, modelo
 * `Modelos/definitivos/Modelo - RLF.docx`), cujo cabeçalho traz "Serviço:
 * Flushing / Método de limpeza: Circulação pressurizada" — exatamente o serviço
 * descrito aqui. A proposta passa a prometer o relatório que o sistema entrega.
 */
export type TechnicalReportCode = "RCPU" | "RTP" | "RLR" | "RLQ" | "RLF";
export type ChemicalMaterial = "Aço carbono" | "Aço inoxidável" | "Outro metal";

export type TechnicalServiceParameters = {
  nasTarget?: string;
  ppmTarget?: string;
  material?: ChemicalMaterial;
  otherMaterial?: string;
  oilType?: "Óleo hidráulico" | "Óleo lubrificante";
};

export type TechnicalServiceSelection = {
  instanceId: string;
  serviceId: TechnicalServiceId;
  templateVersion: number;
  title: string;
  text: string;
  usesTemplate: boolean;
  parameters: TechnicalServiceParameters;
  reportCode: TechnicalReportCode | null;
};

export type TechnicalServiceDefinition = {
  id: TechnicalServiceId;
  title: string;
  summary: string;
  version: number;
  reportCode: TechnicalReportCode | null;
  asksNas?: boolean;
  asksPpm?: boolean;
  asksMaterial?: boolean;
  asksOilType?: boolean;
  defaultParameters: TechnicalServiceParameters;
  buildText: (parameters: TechnicalServiceParameters) => string;
};

export type TechnicalReportEntry = {
  code: "RDO" | TechnicalReportCode;
  serviceId?: TechnicalServiceId;
  serviceTitle?: string;
  text: string;
};

const FILTRATION_INTRO = `Para a retenção do particulado sólido será utilizado um sistema de filtragem com filtros absolutos de 03 micra, meio filtrante em fibra de vidro (Beta 1000), com eficiência de 99,9%, no retorno do sistema.

Análises, controle e monitoramento do sistema:

A filtragem absoluta será monitorada com contador eletrônico de partículas a laser. Serão realizadas análises periódicas na unidade de flushing/filtragem para verificar o índice de contaminação até que o grau de limpeza esteja em conformidade com a exigência solicitada pela Contratante.

Normas aplicadas: Classe ISO 4406 ou NAS 1638.

Nota: Quando aplicado o processo em óleos usados ou com coloração escura que impeça a leitura pelo contador de partículas a laser, o fluido circulará por pelo menos 2 horas, conforme o volume da carga. Não havendo saturação do elemento filtrante, o processo será considerado liberado.`;

function buildFlushingText(stage: "primário" | "secundário", parameters: TechnicalServiceParameters) {
  return `O flushing ${stage} será executado por circulação controlada do fluido definido para o processo, em regime turbulento, promovendo o arraste de partículas sólidas livres presentes no interior das tubulações.

O processo será acompanhado por inspeções e análises periódicas até que o grau de limpeza esteja em conformidade com a exigência solicitada pela Contratante.

Critério de liberação: ${parameters.nasTarget || "classe NAS a definir"} conforme NAS 1638.`;
}

function buildFiltrationText(
  parameters: TechnicalServiceParameters,
  thermal = false,
  fluidoFixo = "",
) {
  // O texto da filtragem NOMEIA o fluido — ao contrário do da desidratação, que
  // fala de "óleo" e serve a qualquer um. Então os serviços novos passam o nome
  // em vez de herdarem "hidráulico ou lubrificante", que estaria errado neles.
  // Continua editável pelo vendedor, como todos.
  const fluid = fluidoFixo
    || (thermal ? "óleo térmico" : (parameters.oilType || "óleo hidráulico ou lubrificante").toLowerCase());
  return `${FILTRATION_INTRO}

Fluido considerado: ${fluid}.

Critério de liberação: ${parameters.nasTarget || "classe NAS a definir"} conforme NAS 1638.

Critério de aceitação — utilização da quantidade de filtros prevista para o serviço, distribuída entre os equipamentos de filtragem. As quantidades e micragens definitivas deverão permanecer de acordo com o levantamento aprovado para a proposta.`;
}

function buildDehydrationText(parameters: TechnicalServiceParameters) {
  return `O serviço tem como objetivo remover a contaminação por água ou umidade presente no óleo, prejudicial tanto à saúde do fluido quanto ao equipamento.

Termovácuo:

O processo consiste na remoção de água dissolvida ou gases contaminantes presentes em uma carga de óleo. O óleo será succionado para uma câmara sob vácuo controlado. No circuito de sucção haverá aquecimento controlado eletronicamente, transmitindo calor ao óleo em circulação. Ao chegar à câmara de vácuo, o óleo será pulverizado, permitindo que a água e os gases dissolvidos sejam transformados em vapor e eliminados pela descarga da bomba de vácuo.

O processo acontecerá em circuito fechado entre o tanque de armazenamento, externo ou próprio do equipamento contaminado, e o equipamento termovácuo. O tempo de processamento variará conforme o grau de contaminação e o volume da carga de óleo.

Monitoramento:

Serão realizadas análises para verificar o teor de umidade até que o resultado esteja conforme a solicitação da Contratante.

Critério de liberação: máximo de ${parameters.ppmTarget || "200"} PPM de água no óleo.`;
}

function buildChemicalCleaningText(parameters: TechnicalServiceParameters) {
  const material = parameters.material === "Outro metal"
    ? parameters.otherMaterial?.trim() || "outro metal a especificar"
    : parameters.material || "material a definir";
  return `A limpeza química será planejada e executada com produtos, concentrações, temperaturas, tempos de circulação e critérios de controle compatíveis com ${material}.

Antes do início, serão confirmados o material construtivo, o volume do circuito, o tipo de contaminação, os pontos de circulação, amostragem, drenagem e as condições de segurança. A sequência operacional poderá contemplar desengraxe, remoção dos contaminantes, enxágue, neutralização, passivação e secagem, conforme a necessidade técnica do sistema.

Os produtos e parâmetros definitivos serão registrados no procedimento aprovado para o serviço, preservando a integridade do material e atendendo ao critério de liberação acordado com a Contratante.`;
}

export const TECHNICAL_SERVICE_CATALOG: TechnicalServiceDefinition[] = [
  {
    id: "flushing_primario",
    title: "Flushing primário",
    summary: "Circulação inicial e arraste de partículas livres do circuito.",
    version: 1,
    reportCode: "RCPU",
    asksNas: true,
    defaultParameters: { nasTarget: "NAS 6" },
    buildText: (parameters) => buildFlushingText("primário", parameters),
  },
  {
    id: "flushing_secundario",
    title: "Flushing secundário",
    summary: "Etapa complementar de circulação, filtragem e monitoramento.",
    version: 1,
    reportCode: "RCPU",
    asksNas: true,
    defaultParameters: { nasTarget: "NAS 6" },
    buildText: (parameters) => buildFlushingText("secundário", parameters),
  },
  {
    id: "filtragem_hidraulico_lubrificante",
    title: "Filtragem de óleo hidráulico/lubrificante",
    summary: "Filtragem absoluta com monitoramento da classe de limpeza.",
    version: 1,
    reportCode: "RCPU",
    asksNas: true,
    asksOilType: true,
    defaultParameters: { nasTarget: "NAS 6", oilType: "Óleo hidráulico" },
    buildText: (parameters) => buildFiltrationText(parameters),
  },
  {
    id: "filtragem_oleo_termico",
    title: "Filtragem de óleo térmico",
    summary: "Filtragem do óleo térmico com modelo técnico editável.",
    version: 1,
    // Era `null` na referência — o único serviço de filtragem sem relatório. O
    // comercial confirmou em 12/08 que **toda filtragem e toda desidratação
    // emitem RCPU**, então a exceção era engano do esboço, não regra.
    //
    // Isto muda o DOCUMENTO: a proposta de óleo térmico passa a trazer o
    // parágrafo do RCPU, que antes não saía.
    reportCode: "RCPU",
    asksNas: true,
    defaultParameters: { nasTarget: "NAS 6" },
    buildText: (parameters) => buildFiltrationText(parameters, true),
  },
  {
    // Desvio nº 16, mesma razão da desidratação: o preço varia com o fluido, e o
    // comercial os trata como serviços distintos. O Nectar já tinha os produtos.
    id: "filtragem_oleo_diesel",
    title: "Filtragem de óleo diesel",
    summary: "Filtragem absoluta com monitoramento da classe de limpeza.",
    version: 1,
    reportCode: "RCPU",
    asksNas: true,
    defaultParameters: { nasTarget: "NAS 6" },
    buildText: (parameters) => buildFiltrationText(parameters, false, "óleo diesel"),
  },
  {
    id: "filtragem_oleo_tempera",
    title: "Filtragem de óleo de têmpera",
    summary: "Filtragem absoluta com monitoramento da classe de limpeza.",
    version: 1,
    reportCode: "RCPU",
    asksNas: true,
    defaultParameters: { nasTarget: "NAS 6" },
    buildText: (parameters) => buildFiltrationText(parameters, false, "óleo de têmpera"),
  },
  {
    // O id NÃO muda, e isso é deliberado: `normalizeTechnicalServiceSelections`
    // descarta id desconhecido em silêncio, então renomear apagaria o serviço de
    // toda proposta já salva. O título é que ficou preciso — era ele o impreciso.
    id: "desidratacao_oleo",
    title: "Desidratação de óleo lubrificante/hidráulico",
    summary: "Remoção de água e gases por processo de termovácuo.",
    version: 1,
    reportCode: "RCPU",
    asksPpm: true,
    defaultParameters: { ppmTarget: "200" },
    buildText: buildDehydrationText,
  },
  {
    // Desvio nº 16: o comercial trata os dois fluidos como serviços DIFERENTES,
    // porque o preço difere. A referência tinha um só — e é um dos pontos em que
    // ela é esboço, não retrato do uso real.
    //
    // O texto é o mesmo por enquanto, e não por descuido: `buildDehydrationText`
    // fala de "óleo" do início ao fim, sem citar fluido. Se o comercial tiver
    // texto próprio para diesel, ele entra aqui.
    id: "desidratacao_oleo_diesel",
    title: "Desidratação de óleo diesel",
    summary: "Remoção de água e gases por processo de termovácuo.",
    version: 1,
    reportCode: "RCPU",
    asksPpm: true,
    defaultParameters: { ppmTarget: "200" },
    buildText: buildDehydrationText,
  },
  {
    id: "limpeza_quimica",
    title: "Limpeza química",
    summary: "Modelo condicionado ao material do sistema.",
    version: 1,
    reportCode: "RLQ",
    asksMaterial: true,
    defaultParameters: { material: "Aço carbono", otherMaterial: "" },
    buildText: buildChemicalCleaningText,
  },
  /**
   * Flushing com ÁGUA — não confundir com o primário e o secundário, que
   * circulam o próprio fluido do sistema e cobram classe NAS. Este remove
   * particulado sólido com água e não tem critério de NAS: por isso não pergunta
   * parâmetro nenhum. Texto e relatório vêm da planilha do comercial (13/08).
   */
  {
    id: "flushing_agua",
    title: "Flushing com água",
    summary: "Circulação pressurizada de água em regime turbulento, para arraste de particulados.",
    version: 1,
    reportCode: "RLF",
    defaultParameters: {},
    buildText: () => `O flushing com água consiste em injetar água em uma tubulação através do método circulação pressurizada com pressão e vazão adequada para atingir o regime turbulento gerando arraste. O objetivo é deixar o sistema adequado para uso removendo os particulados sólidos livres no interior da tubulação.`,
  },
  /**
   * Boroscopia é inspeção, não limpeza: **não emite relatório específico** — a
   * planilha marcou "nenhum" de propósito, e o item 8 da proposta não ganha
   * parágrafo por causa dela.
   */
  {
    id: "boroscopia",
    title: "Boroscopia",
    summary: "Inspeção visual interna de componentes e estruturas industriais.",
    version: 1,
    reportCode: null,
    defaultParameters: {},
    buildText: () => `O objetivo principal da Boroscopia industrial é fornecer uma visão interna detalhada de componentes e estruturas industriais para auxiliar na identificação das condições.`,
  },
  {
    id: "hidrojateamento",
    title: "Hidrojateamento",
    summary: "Preparação e limpeza por jato de água em alta pressão.",
    version: 1,
    reportCode: null,
    defaultParameters: {},
    buildText: () => `O hidrojateamento será executado com pressão, vazão, acessórios e distância de aplicação compatíveis com a superfície e com o contaminante a ser removido.

Antes da execução serão definidos o isolamento da área, a contenção dos resíduos, os acessos e os critérios de inspeção. A equipe realizará a limpeza de forma controlada, preservando a integridade dos componentes e registrando as condições encontradas e o resultado final.`,
  },
  {
    id: "passagem_pig",
    title: "Passagem de PIG",
    summary: "Limpeza interna de tubulações por passagem controlada de PIG.",
    version: 1,
    reportCode: null,
    defaultParameters: {},
    buildText: () => `A passagem de PIG será planejada conforme o diâmetro, o comprimento, as mudanças de direção, os pontos de lançamento e recebimento e as condições internas da tubulação.

Serão verificados os acessos, a continuidade do circuito, a compatibilidade do PIG e os meios de impulsão. As passagens serão executadas de forma controlada, com registro das condições de entrada e saída e repetição quando necessária ao atendimento do critério definido para o serviço.`,
  },
  {
    id: "teste_hidrostatico",
    title: "Teste hidrostático / teste de pressão",
    summary: "Ensaio com água e emissão automática de RTP.",
    version: 1,
    reportCode: "RTP",
    defaultParameters: {},
    buildText: () => `Os testes hidrostáticos serão efetuados com água, antes do processo de limpeza química, quando aplicável. A pressão de ensaio para sistemas hidráulicos deve ser de 1,2 a mais que a pressão de trabalho e, para sistemas lubrificantes, 1,5 a mais que a pressão de trabalho, salvo disposição em contrário na documentação do projeto. Os testes deverão ser executados com bomba apropriada, fornecida pela Contratada.

Nota: Quando realizado o teste hidrostático com água antes do processo de limpeza química, poderá ocorrer abertura em alguma porosidade na solda. Recomenda-se à Contratante a realização de ensaio por líquido penetrante e raio X para identificar possíveis porosidades ou imperfeições na solda antes da limpeza química.`,
  },
  {
    id: "pre_engenharia",
    title: "Pré-engenharia",
    summary: "Antecipação de riscos, soluções e condições de execução.",
    version: 1,
    reportCode: null,
    defaultParameters: {},
    buildText: () => `O principal objetivo da pré-engenharia é garantir que o projeto seja eficiente, seguro e economicamente viável, reduzindo riscos e evitando retrabalhos. Ela busca antecipar desafios e definir soluções antes da execução, garantindo uma implementação mais fluida e dentro das expectativas.`,
  },
  {
    id: "limpeza_reservatorio",
    title: "Limpeza interna de reservatório",
    summary: "Limpeza mecânica, espaço confinado e registros fotográficos.",
    version: 1,
    reportCode: "RLR",
    defaultParameters: {},
    buildText: () => `A limpeza interna de reservatórios tem como objetivo remover resíduos sólidos ou líquidos contaminantes presentes em seu interior, garantindo o funcionamento adequado do equipamento e prolongando sua vida útil. A limpeza mecânica também evita a contaminação excessiva do óleo filtrado durante o abastecimento.

Etapas previstas:

• Abertura da documentação;
• Abertura do tanque;
• Medição inicial dos gases;
• Ventilação forçada até atingir LEL seguro;
• Liberação da documentação para acesso ao espaço confinado;
• Acesso seguro ao espaço confinado com equipamentos EX;
• Limpeza interna do chão e das paredes do tanque;
• Montagem de andaime, quando necessária, sob responsabilidade da Contratante;
• Limpeza interna do teto e da parte superior das paredes;
• Medição final dos gases;
• Desgaseificação adicional, quando necessária, até manter atmosfera segura;
• Emissão dos relatórios e ART aplicável;
• Organização da área e desmobilização.`,
  },
];

const REPORT_CODES = new Set<TechnicalReportCode>(["RCPU", "RTP", "RLR", "RLQ", "RLF"]);
const SERVICE_IDS = new Set<TechnicalServiceId>(TECHNICAL_SERVICE_CATALOG.map((service) => service.id));

export function getTechnicalServiceDefinition(id: TechnicalServiceId) {
  return TECHNICAL_SERVICE_CATALOG.find((service) => service.id === id);
}

export function createTechnicalServiceSelection(serviceId: TechnicalServiceId, instanceId: string) {
  const definition = getTechnicalServiceDefinition(serviceId);
  if (!definition) throw new Error("Modelo técnico não encontrado.");
  const parameters = { ...definition.defaultParameters };
  return {
    instanceId,
    serviceId,
    templateVersion: definition.version,
    title: definition.title,
    text: definition.buildText(parameters),
    usesTemplate: true,
    parameters,
    reportCode: definition.reportCode,
  } satisfies TechnicalServiceSelection;
}

export function updateTechnicalServiceParameter(
  selection: TechnicalServiceSelection,
  key: keyof TechnicalServiceParameters,
  value: string,
) {
  const definition = getTechnicalServiceDefinition(selection.serviceId);
  const parameters = { ...selection.parameters, [key]: value } as TechnicalServiceParameters;
  return {
    ...selection,
    parameters,
    text: selection.usesTemplate && definition ? definition.buildText(parameters) : selection.text,
    templateVersion: selection.usesTemplate && definition ? definition.version : selection.templateVersion,
  };
}

export function resetTechnicalServiceTemplate(selection: TechnicalServiceSelection) {
  const definition = getTechnicalServiceDefinition(selection.serviceId);
  if (!definition) return selection;
  return {
    ...selection,
    templateVersion: definition.version,
    text: definition.buildText(selection.parameters),
    usesTemplate: true,
  };
}

export function normalizeTechnicalServiceSelections(value: unknown) {
  if (!Array.isArray(value)) return [];
  const used = new Set<TechnicalServiceId>();
  return value.flatMap<TechnicalServiceSelection>((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const serviceId = String(record.serviceId || "") as TechnicalServiceId;
    if (!SERVICE_IDS.has(serviceId) || used.has(serviceId) || used.size >= MAX_TECHNICAL_SERVICES) return [];
    const definition = getTechnicalServiceDefinition(serviceId);
    if (!definition) return [];
    used.add(serviceId);
    const parameters = normalizeParameters(record.parameters, definition);
    const hasText = Object.prototype.hasOwnProperty.call(record, "text");
    const hasTitle = Object.prototype.hasOwnProperty.call(record, "title");
    const storedText = String(record.text ?? "").trim().slice(0, MAX_TECHNICAL_SERVICE_TEXT);
    const storedTitle = String(record.title ?? "").trim().slice(0, 120);
    const storedCode = record.reportCode === null
      ? null
      : REPORT_CODES.has(record.reportCode as TechnicalReportCode)
        ? record.reportCode as TechnicalReportCode
        : definition.reportCode;
    return [{
      instanceId: String(record.instanceId || `${serviceId}-${index + 1}`).slice(0, 100),
      serviceId,
      templateVersion: positiveInteger(record.templateVersion) || definition.version,
      title: hasTitle ? storedTitle : definition.title,
      text: hasText ? storedText : definition.buildText(parameters),
      usesTemplate: record.usesTemplate !== false,
      parameters,
      reportCode: storedCode,
    }];
  });
}

/**
 * Onde a pendência mora — o cartão do serviço e o campo dentro dele.
 *
 * `instanceId` vazio é pendência da etapa inteira ("selecione pelo menos um
 * serviço"), que não tem campo para acender.
 */
export type TechnicalServiceIssue = {
  instanceId: string;
  field: "" | "title" | "text" | "nasTarget" | "ppmTarget" | "oilType" | "material" | "otherMaterial";
  message: string;
};

/**
 * A validação da etapa técnica, **com endereço** (T067).
 *
 * Antes ela devolvia só frases — "Flushing primário: informe a classe NAS
 * desejada." — e a tela as empilhava num aviso. Com um serviço só, dá para
 * achar; com os onze que a etapa aceita, cada um com até três parâmetros, o
 * vendedor lê a frase e **procura**. É o caso que a T067 chama de ponto de
 * travamento mais provável do app: o contador acusa pendência e nada na tela
 * aponta para onde.
 *
 * O `field` é o nome do parâmetro de propósito: é a mesma chave que
 * `updateTechnicalServiceParameter` usa, então a tela liga um no outro sem
 * tabela de tradução no meio — tabela que envelheceria calada quando um
 * parâmetro novo entrasse.
 */
export function validateTechnicalServiceIssues(
  selections: TechnicalServiceSelection[],
): TechnicalServiceIssue[] {
  const issues: TechnicalServiceIssue[] = [];
  const daEtapa = (message: string) => issues.push({ instanceId: "", field: "", message });

  if (!selections.length) {
    daEtapa("Selecione pelo menos um serviço técnico.");
    return issues;
  }
  if (selections.length > MAX_TECHNICAL_SERVICES) {
    daEtapa(`Selecione no máximo ${MAX_TECHNICAL_SERVICES} serviços.`);
  }

  for (const selection of selections) {
    const definition = getTechnicalServiceDefinition(selection.serviceId);
    const aqui = (field: TechnicalServiceIssue["field"], message: string) =>
      issues.push({ instanceId: selection.instanceId, field, message });

    if (!definition) {
      // Sem definição não há campo a acender: o cartão inteiro é o problema.
      aqui("", "Há um serviço técnico inválido.");
      continue;
    }

    if (!selection.title.trim()) aqui("title", `${definition.title}: informe o título.`);
    if (!selection.text.trim()) aqui("text", `${definition.title}: informe o texto técnico.`);
    if (selection.reportCode !== definition.reportCode) {
      aqui(
        "",
        `${definition.title}: a configuração automática do relatório está inválida; remova e adicione o modelo novamente.`,
      );
    }
    if (definition.asksNas && !selection.parameters.nasTarget?.trim()) {
      aqui("nasTarget", `${definition.title}: informe a classe NAS desejada.`);
    }
    if (definition.asksPpm) {
      const ppm = Number(String(selection.parameters.ppmTarget || "").replace(",", "."));
      if (!Number.isFinite(ppm) || ppm <= 0) {
        aqui("ppmTarget", `${definition.title}: informe um limite de PPM válido.`);
      }
    }
    if (definition.asksOilType && !selection.parameters.oilType) {
      aqui("oilType", `${definition.title}: selecione o tipo de óleo.`);
    }
    if (definition.asksMaterial) {
      if (!selection.parameters.material) {
        aqui("material", `${definition.title}: selecione o material.`);
      }
      if (selection.parameters.material === "Outro metal" && !selection.parameters.otherMaterial?.trim()) {
        aqui("otherMaterial", `${definition.title}: especifique o outro metal.`);
      }
    }
  }

  return issues;
}

/**
 * As mesmas pendências, só as frases.
 *
 * Continua existindo porque o contador da etapa e o aviso do topo só precisam
 * do texto — e porque **deriva** de `validateTechnicalServiceIssues`, não
 * repete a regra. Duas listas escritas à mão divergiriam no primeiro parâmetro
 * novo, e a tela acenderia um campo que o contador não conta.
 */
export function validateTechnicalServiceSelections(selections: TechnicalServiceSelection[]) {
  return validateTechnicalServiceIssues(selections).map((issue) => issue.message);
}

/**
 * As frases do item 8, **copiadas do `.docx`** — desvio nº 12: onde o texto
 * fixo diverge do documento, o documento vence.
 *
 * Antes cada uma era montada em `reportText()` com o título do serviço no meio
 * ("Após a conclusão do serviço de flushing primário, ..."). Ficava bem escrito
 * e **não era o texto do documento**: o `.docx` fala por RELATÓRIO, não por
 * serviço — "dos serviços de flushing e/ou filtragem absoluta" cobre sete
 * serviços numa frase só. Com a montagem antiga, uma proposta de flushing
 * primário e secundário imprimia o mesmo parágrafo de RCPU duas vezes.
 *
 * A ordem deste objeto é a ordem do documento, e é ela que sai impressa.
 */
export const TECHNICAL_REPORT_SENTENCES: Record<TechnicalReportCode, string> = {
  RLQ: "Após a conclusão dos serviços de limpeza química será emitido um RLQ (relatório de limpeza química) com os registros fotográficos da tubulação, este relatório será encaminhado ao responsável pela fiscalização para aceitação dos serviços;",
  RCPU: "Após a conclusão dos serviços de flushing e/ou filtragem absoluta, será emitido RCPU (relatório de contagem de partículas e umidade) com os registros de contagem de partículas inicial e final, este será encaminhado ao responsável pela fiscalização para aceitação dos serviços;",
  RTP: "Após a conclusão do teste hidrostático será emitido um RTP (relatório de teste hidrostático) para cada sistema descrevendo as informações dos manômetros utilizados, pressão de projeto e teste, tempo de teste e fotos dos manômetros e sistema;",
  RLR: "Após a conclusão dos serviços de limpeza de reservatório será emitido um RLR (relatório de limpeza de reservatório) com registros fotográficos antes e após os serviços;",
  RLF: "Após a conclusão dos serviços de flushing será emitido um RLF (relatório de flushing) descrevendo as informações específicas das atividades, bem como, as imagens do antes e depois de alguns pontos da estrutura.",
};

/**
 * O RDO **aparece sempre**, contratado o que for. Texto do `.docx`.
 *
 * Termina em **ponto e vírgula**, como as outras frases do item 8 — eu tinha
 * copiado com ponto final. Um caractere, e é o tipo de divergência que o
 * desvio nº 12 existe para não deixar passar: o documento é o original.
 */
export const RDO_SENTENCE =
  "Será entregue diariamente o RDO (relatório diário de obra) descrevendo quais serviços foram executados referente ao dia de trabalho;";

/** A ressalva que só faz sentido quando existe relatório específico. */
export const REPORTS_NOTICE =
  "Obs: Visando a redução de tempo e retrabalho com manutenção de relatórios, os relatórios abaixo só serão elaborados e entregues após a regularização e aprovação dos RDOs.";

/**
 * Quais relatórios a proposta promete: o RDO e **um parágrafo por código
 * distinto** entre os serviços contratados.
 *
 * Decidido pelo mantenedor em 13/08. Até aqui o documento emitido listava
 * todos, sempre — uma proposta só de limpeza química prometia contagem de
 * partículas, teste de pressão e limpeza de reservatório que ninguém contratou.
 */
export function technicalReportCodesFor(selections: TechnicalServiceSelection[]) {
  const codes = new Set<TechnicalReportCode>();
  for (const selection of selections) {
    if (selection.reportCode && REPORT_CODES.has(selection.reportCode)) codes.add(selection.reportCode);
  }
  // A ordem é a do documento, não a da seleção: o vendedor escolhe em qualquer
  // ordem, e o item 8 não pode embaralhar por causa disso.
  return (Object.keys(TECHNICAL_REPORT_SENTENCES) as TechnicalReportCode[]).filter((code) => codes.has(code));
}

export function buildTechnicalReportEntries(selections: TechnicalServiceSelection[]) {
  const entries: TechnicalReportEntry[] = [{ code: "RDO", text: RDO_SENTENCE }];
  for (const code of technicalReportCodesFor(selections)) {
    entries.push({ code, text: TECHNICAL_REPORT_SENTENCES[code] });
  }
  return entries;
}

export function buildTechnicalReportsText(selections: TechnicalServiceSelection[], additionalNotes = "") {
  const entries = buildTechnicalReportEntries(selections);
  const paragraphs = entries.map((entry, index) => `8.${index + 1} — ${entry.text}`);
  // Só entra havendo relatório específico: "os relatórios abaixo" sem nada
  // abaixo é a frase solta que o documento já teve.
  if (entries.length > 1) paragraphs.splice(1, 0, REPORTS_NOTICE);
  if (additionalNotes.trim()) paragraphs.push(`Informações complementares: ${additionalNotes.trim()}`);
  return paragraphs.join("\n\n");
}

export function technicalReportName(code: "RDO" | TechnicalReportCode) {
  return {
    RDO: "Relatório Diário de Obra",
    RCPU: "Relatório de Contagem de Partículas e Umidade",
    RTP: "Relatório de Teste de Pressão",
    RLR: "Relatório de Limpeza de Reservatório",
    RLQ: "Relatório de Limpeza Química",
    RLF: "Relatório de Flushing",
  }[code];
}


function normalizeParameters(value: unknown, definition: TechnicalServiceDefinition) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const parameters: TechnicalServiceParameters = { ...definition.defaultParameters };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
  if (definition.asksNas) {
    parameters.nasTarget = String(has("nasTarget") ? record.nasTarget ?? "" : parameters.nasTarget || "").slice(0, 40);
  }
  if (definition.asksPpm) {
    parameters.ppmTarget = String(has("ppmTarget") ? record.ppmTarget ?? "" : parameters.ppmTarget || "").slice(0, 20);
  }
  if (definition.asksOilType) {
    parameters.oilType = !has("oilType")
      ? definition.defaultParameters.oilType
      : record.oilType === "Óleo lubrificante" || record.oilType === "Óleo hidráulico"
        ? record.oilType
        : undefined;
  }
  if (definition.asksMaterial) {
    parameters.material = !has("material")
      ? definition.defaultParameters.material
      : record.material === "Aço carbono" || record.material === "Aço inoxidável" || record.material === "Outro metal"
        ? record.material
        : undefined;
    parameters.otherMaterial = String(record.otherMaterial || "").slice(0, 80);
  }
  return parameters;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}
