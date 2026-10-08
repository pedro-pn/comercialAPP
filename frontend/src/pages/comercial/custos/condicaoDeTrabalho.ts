import { trabalhoSomenteNaSede } from '../../../../../shared/comercial/dist/work-location.js';

type Registro = Record<string, unknown>;

/** Ajusta a logística ao mudar o local, preservando escolhas manuais nas demais edições. */
export function ajustarLogisticaPelaCondicao(atual: Registro, proximo: Registro): Registro {
  const eraNaSede = trabalhoSomenteNaSede(atual);
  const seraNaSede = trabalhoSomenteNaSede(proximo);
  if (eraNaSede === seraNaSede) return proximo;
  return {
    ...proximo,
    scopeConfirmations: {
      ...(proximo.scopeConfirmations as Registro),
      noLogistics: seraNaSede
    }
  };
}
