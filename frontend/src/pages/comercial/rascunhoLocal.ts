/**
 * Rascunho local do módulo Comercial — a lacuna **L3**.
 *
 * O que se perde sem isto: na referência, um F5 na tela de custos volta ao diálogo
 * "Como deseja começar?" e apaga 465 controles de trabalho. Sem aviso, sem
 * confirmação de saída, sem nada gravado. O mantenedor citou *"fechar a página sem
 * querer"* como perda real, não hipótese.
 *
 * Este módulo é **puro**: mexe em `Storage` e em `Date`, e nada mais. Fica separado
 * do React porque as decisões que importam — quando um rascunho é velho demais, o
 * que fazer quando a chave muda, o que conta como alteração — são regras, e regra
 * dentro de componente não se testa.
 *
 * Duas decisões que valem registrar:
 *
 * 1. **A recuperação é oferecida, não imposta** (T090). Restaurar em silêncio é
 *    pior do que perder: o usuário abre a tela achando que começou do zero, digita
 *    por cima de dados antigos, e o resultado é um levantamento híbrido que ninguém
 *    consegue explicar depois.
 *
 * 2. **A chave inclui conta, modo e código da proposta.** Um rascunho da proposta
 *    4435 não pode reaparecer na 4436 nem para outra pessoa que use o mesmo
 *    navegador — seriam dados do cliente errado numa conta que não é a autora.
 */

const PREFIXO = 'filtrovali:comercial:rascunho';

/** Depois disso o rascunho não é mais oferecido: dado velho confunde mais do que ajuda. */
export const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export type RascunhoGuardado = {
  /** O payload do levantamento ou da proposta, como estava na última alteração. */
  dados: unknown;
  /** Quando foi guardado, em epoch ms. */
  salvoEm: number;
  /** Rótulo mostrado na oferta de recuperação — "Custos 4435", por exemplo. */
  rotulo?: string;
};

export function chaveDoRascunho(
  conta: string,
  tela: string,
  modo: string,
  codigo: string
) {
  // O código entra normalizado: `4435` e `4435 ` são a mesma proposta.
  return `${PREFIXO}:${String(conta || '').trim()}:${tela}:${modo}:${String(codigo || '').trim()}`;
}

export function guardarRascunho(
  storage: Storage,
  chave: string,
  dados: unknown,
  rotulo?: string,
  agora = Date.now()
) {
  const registro: RascunhoGuardado = { dados, salvoEm: agora, rotulo };
  try {
    storage.setItem(chave, JSON.stringify(registro));
    return true;
  } catch {
    // Cota estourada ou storage bloqueado. Falhar aqui não pode derrubar a tela:
    // o rascunho é uma rede de segurança, não o caminho principal. O usuário
    // continua com o trabalho na memória e o salvamento no servidor intacto.
    return false;
  }
}

export function lerRascunho(
  storage: Storage,
  chave: string,
  agora = Date.now()
): RascunhoGuardado | null {
  let bruto: string | null;
  try {
    bruto = storage.getItem(chave);
  } catch {
    return null;
  }
  if (!bruto) return null;

  let registro: RascunhoGuardado;
  try {
    registro = JSON.parse(bruto) as RascunhoGuardado;
  } catch {
    // Registro corrompido — descarta em silêncio. Oferecer "recuperar" e falhar
    // na restauração seria prometer o trabalho de volta e não entregar.
    descartarRascunho(storage, chave);
    return null;
  }

  if (!registro || typeof registro.salvoEm !== 'number' || registro.dados === undefined) {
    descartarRascunho(storage, chave);
    return null;
  }

  if (agora - registro.salvoEm > VALIDADE_MS) {
    descartarRascunho(storage, chave);
    return null;
  }

  return registro;
}

export function descartarRascunho(storage: Storage, chave: string) {
  try {
    storage.removeItem(chave);
  } catch {
    /* storage indisponível: nada a fazer, e nada que justifique quebrar a tela */
  }
}

/** Remove todo rascunho do módulo. Usado depois de salvar no servidor (T091). */
export function descartarRascunhosDaTela(storage: Storage, conta: string, tela: string) {
  const alvo = `${PREFIXO}:${String(conta || '').trim()}:${tela}:`;
  const chaves: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const chave = storage.key(i);
      if (chave && chave.startsWith(alvo)) chaves.push(chave);
    }
  } catch {
    return;
  }
  for (const chave of chaves) descartarRascunho(storage, chave);
}

/** "há 2 minutos", "ontem" — para a oferta de recuperação dizer de quando é. */
export function descreverIdade(salvoEm: number, agora = Date.now()): string {
  const minutos = Math.floor((agora - salvoEm) / 60000);
  if (minutos < 1) return 'agora há pouco';
  if (minutos === 1) return 'há 1 minuto';
  if (minutos < 60) return `há ${minutos} minutos`;

  const horas = Math.floor(minutos / 60);
  if (horas === 1) return 'há 1 hora';
  if (horas < 24) return `há ${horas} horas`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}
