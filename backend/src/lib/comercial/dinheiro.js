/**
 * Leitura da máscara de moeda — **uma definição só**, e ela não mora mais aqui.
 *
 * A implementação foi para `shared/comercial/src/dinheiro.ts` quando a tela
 * passou a precisar da mesma conta (T130): ela mostra a soma de cada cenário ao
 * lado da escolha do vendedor, e o front tinha o próprio leitor, que diverge
 * 100× deste em valor sem máscara ("1000" é mil aqui e dez reais lá).
 *
 * O motivo é o mesmo que tirou esta função de dentro de `proposta-docx.js`:
 *
 * > Duas implementações da mesma conta divergem em silêncio, e a divergência
 * > aparece como um valor no histórico diferente do TOTAL GERAL impresso no PDF
 * > que o cliente já recebeu.
 *
 * Este arquivo continua existindo como o endereço que o módulo já conhece —
 * `proposals.js` e `proposta-docx.js` importam daqui.
 */
export { lerDinheiro, moeda, somarDinheiro } from '../../../../shared/comercial/dist/dinheiro.js';
