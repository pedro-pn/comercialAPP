import type { TechnicalServiceId } from "./technical-services.js";

export type ProposalVisualDefinition = {
  src: string;
  aspectRatio: number;
};

const visual = (src: string, width: number, height: number): ProposalVisualDefinition => ({
  src,
  aspectRatio: width / height,
});

export const PROPOSAL_VISUAL_DEFINITIONS = {
  metrics: visual("/proposal-assets/metricas-filtrovali.jpg", 1948, 595),
  clients: visual("/proposal-assets/clientes-filtrovali.jpg", 1754, 938),
  scopeReference: visual("/proposal-assets/tubulacoes-industriais.jpg", 803, 452),
  serviceGallery: [
    visual("/proposal-assets/tubulacao-antes-depois.jpg", 690, 521),
    visual("/proposal-assets/oleo-antes-depois.jpg", 509, 521),
    visual("/proposal-assets/planta-industrial.jpg", 385, 531),
    visual("/proposal-assets/tecnico-em-campo.jpg", 340, 534),
  ],
  equipmentGallery: [
    visual("/proposal-assets/unidade-filtragem.jpg", 513, 480),
    visual("/proposal-assets/unidade-bombeamento.jpg", 421, 481),
    visual("/proposal-assets/termovacuo.jpg", 285, 490),
    visual("/proposal-assets/contador-particulas.jpg", 522, 350),
  ],
} as const;

export const TECHNICAL_SERVICE_VISUAL_DEFINITIONS: Record<
  TechnicalServiceId,
  ProposalVisualDefinition[]
> = {
  flushing_primario: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[0],
  ],
  flushing_secundario: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[3],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[1],
  ],
  filtragem_hidraulico_lubrificante: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[3],
  ],
  filtragem_oleo_termico: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[2],
  ],
  // Desvio nº 16: as imagens são as mesmas da filtragem — o equipamento não
  // muda com o fluido. O que muda é o preço, e a categoria no CRM.
  filtragem_oleo_diesel: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[2],
  ],
  filtragem_oleo_tempera: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[2],
  ],
  desidratacao_oleo: [
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[2],
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
  ],
  // As mesmas imagens da desidratação: o equipamento de termovácuo é o mesmo, o
  // que muda entre os dois é o fluido — e o preço. Desvio nº 16.
  desidratacao_oleo_diesel: [
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[2],
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[1],
  ],
  limpeza_quimica: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[1],
  ],
  hidrojateamento: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[3],
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
  ],
  passagem_pig: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
    PROPOSAL_VISUAL_DEFINITIONS.scopeReference,
  ],
  teste_hidrostatico: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[2],
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[3],
  ],
  pre_engenharia: [
    PROPOSAL_VISUAL_DEFINITIONS.scopeReference,
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[2],
  ],
  limpeza_reservatorio: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[3],
    PROPOSAL_VISUAL_DEFINITIONS.scopeReference,
  ],
  // As mesmas do flushing primário: a tubulação antes/depois e a unidade de
  // bombeamento ilustram os dois. O acervo não tem foto de flushing com água.
  flushing_agua: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
    PROPOSAL_VISUAL_DEFINITIONS.equipmentGallery[1],
  ],
  // Boroscopia é inspeção interna: a tubulação antes/depois e a referência de
  // escopo são o que o acervo tem de mais próximo. Não há foto de boroscópio.
  boroscopia: [
    PROPOSAL_VISUAL_DEFINITIONS.serviceGallery[0],
    PROPOSAL_VISUAL_DEFINITIONS.scopeReference,
  ],
};
