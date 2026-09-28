import type {
  ComercialConfiguracao,
  EnderecoLocalizado
} from '../../../api/comercial';

export function normalizarEnderecoDaSede(valor: string): string {
  return String(valor || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function configuracaoDaSedeMudou(
  config: ComercialConfiguracao | null,
  endereco: string,
  placeId: string
): boolean {
  if (!config) return false;
  return (
    normalizarEnderecoDaSede(endereco) !==
      normalizarEnderecoDaSede(config.sedeEndereco) ||
    String(placeId || '').trim() !== String(config.sedePlaceId || '').trim()
  );
}

/** A localização conferida deve ser a mesma referência gravada no salvamento seguinte. */
export function placeIdDaLocalizacao(local: EnderecoLocalizado): string {
  return local.enderecoEncontrado ? String(local.placeId || '').trim() : '';
}
