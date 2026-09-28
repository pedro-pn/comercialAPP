/**
 * Logotipo do módulo Comercial.
 *
 * `LOGO_COLORIDO` e não `LOGO_HEADER`: o header é a variante clara, feita para
 * fundo colorido, e sobre o branco da barra ela sai lavada. A colorida é a que
 * bate com a referência — arco azul, lavanda e vermelho em volta do "F", com o
 * texto em verde escuro.
 *
 * Detalhe que fecha o círculo: as três cores dos arcos são as mesmas da faixa
 * de 3px no pé do hero (`.com-hero::after`). Não é coincidência — é a marca.
 */
const assetsBaseUrl = (import.meta.env.VITE_ASSETS_BASE_URL || '').replace(/\/$/, '');

export const LOGO_URL = `${assetsBaseUrl}/assets/Logo/LOGO_COLORIDO.png`;
