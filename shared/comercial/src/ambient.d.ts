// Declarações de ambiente para compilar os arquivos portados SEM editá-los.
//
// `nectar-pipelines.ts` lê `process.env.NECTAR_API_TOKEN`. O repositório não tem
// `@types/node` instalado, e instalá-lo só para isto puxaria a tipagem inteira do
// Node para um pacote que é regra de negócio pura.
//
// Este arquivo existe para que os seis arquivos de `src/` continuem sendo cópia
// byte a byte da referência congelada. **Não acrescente nada aqui que não seja
// estritamente necessário para compilar.**

declare const process: {
  env: Record<string, string | undefined>;
};
