import { SCOPE_PHOTO_LIMITS } from '../../../../../shared/schemas/comercial.js';

/**
 * Otimização da foto do escopo **no cliente**, antes do envio (tarefa T058b, FR-048).
 *
 * Porte do preparo que a referência faz antes de chamar `/api/scope-assets`.
 *
 * A foto que sai de um celular tem 4 a 8 MB e 12 megapixels. Ela não precisa disso
 * para virar meia página de PDF, e mandá-la assim gasta a banda do orçamentista em
 * obra — que é justamente onde a foto é tirada e onde a conexão é pior.
 *
 * **O servidor não confia nisto e revalida tudo.** A otimização existe para caber; a
 * validação existe porque isto roda no navegador do usuário e pode ser contornado.
 * As duas coisas não são redundantes: têm donos diferentes.
 *
 * A recusa sempre **nomeia o arquivo**. Quem seleciona seis fotos de uma vez e recebe
 * "arquivo muito grande" não sabe qual tirar da lista.
 */

export class FotoRecusadaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FotoRecusadaError';
  }
}

export type FotoOtimizada = {
  blob: Blob;
  fileName: string;
  contentType: string;
  width: number;
  height: number;
};

const QUALIDADES = [0.82, 0.64];

function megapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

/** Cabe no maior lado sem distorcer: a proporção original é preservada. */
export function dimensoesReduzidas(
  width: number,
  height: number,
  maiorLado = SCOPE_PHOTO_LIMITS.maxEdgePixels
) {
  const maior = Math.max(width, height);
  if (maior <= maiorLado) return { width, height };

  const fator = maiorLado / maior;
  return {
    width: Math.max(1, Math.round(width * fator)),
    height: Math.max(1, Math.round(height * fator))
  };
}

async function carregarImagem(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new FotoRecusadaError(`Não foi possível ler a imagem "${file.name}".`));
      img.src = url;
    });
  } finally {
    // Sempre: sem isto cada foto selecionada vaza um objeto até a aba fechar.
    URL.revokeObjectURL(url);
  }
}

function paraBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade));
}

export async function otimizarFoto(file: File): Promise<FotoOtimizada> {
  if (!SCOPE_PHOTO_LIMITS.allowedTypes.includes(file.type)) {
    throw new FotoRecusadaError(
      `"${file.name}" não é JPEG, PNG ou WebP. Converta antes de enviar.`
    );
  }

  if (file.size > SCOPE_PHOTO_LIMITS.maxOriginalBytes) {
    throw new FotoRecusadaError(
      `"${file.name}" passa de 10 MB. Reduza a imagem antes de enviar.`
    );
  }

  const imagem = await carregarImagem(file);
  const original = megapixels(imagem.naturalWidth, imagem.naturalHeight);
  if (original > SCOPE_PHOTO_LIMITS.maxMegapixels) {
    // O limite de megapixels é separado do de bytes de propósito: um PNG de 24
    // megapixels pode ter poucos MB e ainda assim estourar a memória ao decodificar.
    throw new FotoRecusadaError(
      `"${file.name}" tem ${original.toFixed(0)} megapixels, acima do limite de ` +
        `${SCOPE_PHOTO_LIMITS.maxMegapixels}.`
    );
  }

  const { width, height } = dimensoesReduzidas(imagem.naturalWidth, imagem.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const contexto = canvas.getContext('2d');
  if (!contexto) throw new FotoRecusadaError('O navegador não permitiu processar a imagem.');

  /* Achata sobre BRANCO antes de desenhar. PNG e WebP com transparência viram
     preto ao recomprimir em JPEG, que não tem canal alfa — e uma foto de escopo
     saindo preta no PDF é um defeito que só aparece no documento final. */
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, width, height);
  contexto.drawImage(imagem, 0, 0, width, height);

  for (const qualidade of QUALIDADES) {
    const blob = await paraBlob(canvas, qualidade);
    if (blob && blob.size <= SCOPE_PHOTO_LIMITS.maxBytes) {
      return { blob, fileName: file.name, contentType: 'image/jpeg', width, height };
    }
  }

  throw new FotoRecusadaError(
    `"${file.name}" continua acima de 1,5 MB mesmo depois de otimizada. ` +
      'Use uma imagem menor ou com menos detalhe.'
  );
}
