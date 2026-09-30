import type { DriveStep } from 'driver.js';

/**
 * O roteiro do tutorial do módulo — T097, a partir de
 * [`contracts/baseline/roteiro.md`](../../../../specs/009-modulo-comercial/contracts/baseline/roteiro.md).
 *
 * **Um roteiro por tela**, e não um só percorrendo as três: `driver.js` aponta
 * para elementos da página aberta, e um passo que mira um seletor de outra tela
 * não destaca nada — ele simplesmente não aparece, sem erro.
 *
 * A T097 exige, no mínimo, dois pontos, e os dois vêm de achados do roteiro:
 *
 * 1. **A cadeia de prioridade do rodapé** (§2.3). O botão muda de texto e de
 *    destino conforme o que falta, e o mantenedor confirmou que **segue a
 *    cadeia** em vez de clicar nas abas. O roteiro registra: *"o app já sabe o
 *    caminho e já sabe o que falta — ele só não diz qual campo"*.
 * 2. **A armadilha do e-mail/CNPJ inválido** na etapa 1 (§ "Decisões", item 3).
 *    Campo preenchido e recusado é o travamento mais provável do app, porque
 *    "obrigatório" e "inválido" parecem a mesma coisa para quem está com pressa.
 *
 * Os textos falam do que a tela **faz**, não do que ela **é**: "clique aqui para
 * ver a lista" não ensina nada a quem já está vendo a lista.
 */

/** Só entram os passos cujo elemento existe: passo órfão não destaca nada. */
export function passosPresentes(passos: DriveStep[], existe: (seletor: string) => boolean) {
  return passos.filter(passo =>
    typeof passo.element === 'string' ? existe(passo.element) : true
  );
}

/** A entrada do módulo — levantamento opcional antes da proposta. */
export const ROTEIRO_DA_ENTRADA: DriveStep[] = [
  {
    element: '.com-menu',
    popover: {
      title: 'Escolha como começar',
      description:
        'Você pode criar a proposta diretamente ou usar um levantamento concluído para aproveitar o preço e o número.'
    }
  },
  {
    element: '[data-tutorial="menu-custos"]',
    popover: {
      title: 'Levantar custos',
      description:
        'Cinco seções — premissas, mão de obra, materiais, mobilização e resumo. O total recalcula a cada tecla; não existe botão de calcular.'
    }
  },
  {
    element: '[data-tutorial="menu-propostas"]',
    popover: {
      title: 'Montar a proposta',
      description:
        'Monte a proposta em sete etapas. Na revisão, emita os documentos em PDF e DOCX e finalize a proposta localmente.'
    }
  },
  {
    element: '[data-tutorial="rever-tutorial"]',
    popover: {
      title: 'Este tutorial fica aqui',
      description:
        'Use este botão para rever o guia quando precisar.'
    }
  }
];

/** O levantamento (`/comercial/custos`) — a cadeia do rodapé é o coração. */
export const ROTEIRO_DOS_CUSTOS: DriveStep[] = [
  {
    element: '.com-workflow-nav',
    popover: {
      title: 'As cinco seções são livres',
      description:
        'Dá para ir e voltar em qualquer ordem — o levantamento é uma calculadora, não um formulário em fila. O que trava é salvar, não navegar.'
    }
  },
  {
    element: '.com-rodape',
    popover: {
      title: 'O rodapé é um guia, não um botão',
      description:
        'Ele muda de texto conforme o que falta, numa ordem fixa: mão de obra → materiais e insumos → mobilização → comissões → salvar. Clicar leva direto à seção pendente. Se você não sabe o que fazer a seguir, é ele que responde.'
    }
  },
  {
    element: '.com-rodape',
    popover: {
      title: 'E quando ele diz "Salvar"',
      description:
        'Salvar pede a confirmação do código, porque o mesmo número vai para o levantamento, para a proposta técnica e para a comercial. Confira antes de confirmar: o número é consumido e não volta.'
    }
  }
];

/** A proposta (`/comercial/propostas`) — a armadilha da etapa 1 vem primeiro. */
export const ROTEIRO_DA_PROPOSTA: DriveStep[] = [
  {
    element: '.com-crm',
    popover: {
      title: 'Comece buscando a empresa',
      description:
        'Preencher daqui não é atalho: é o que vincula a proposta ao CRM. Digitar o nome à mão preenche o documento, mas a finalização vai recusar por falta do vínculo. A busca encontra pelo início do nome.'
    }
  },
  {
    element: '[data-tutorial="cnpj"]',
    popover: {
      title: 'Campo preenchido também pode estar errado',
      description:
        'CNPJ e e-mail têm dois estados diferentes: vazio diz "Informe o CNPJ"; preenchido e inválido diz "Informe um CNPJ válido com 14 dígitos". Se o contador acusa pendência num campo que parece cheio, é este segundo caso — o campo fica vermelho com a mensagem embaixo.'
    }
  },
  {
    element: '.com-stepper',
    popover: {
      title: 'A trava é etapa a etapa',
      description:
        'Cada etapa conta quantos campos faltam e não deixa avançar antes de zerar. O número no topo é o que falta nesta etapa, não na proposta inteira.'
    }
  },
  {
    element: '.com-previa',
    popover: {
      title: 'A prévia é o documento',
      description:
        'Ela desenha as páginas como elas vão sair, inclusive as quebras. Conferir aqui é mais rápido do que emitir o PDF para descobrir que uma tabela partiu no meio.'
    }
  }
];
