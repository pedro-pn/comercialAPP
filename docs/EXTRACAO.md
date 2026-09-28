# Extração do Comercial

## Proveniência

- Origem do módulo: /home/relat/apps/NewRDO, branch feat/modulo-comercial,
  commit 94b74278043a7416febf3c52f4ae4ca093924920.
- Pacote de regras inicial: shared/comercial/src copiado da origem nesse commit.
  Apenas os caminhos de exportação do índice e um import de tipo foram ajustados
  para o novo pacote ESM; a lógica dos cálculos não foi alterada.
- Referência histórica: branch legacy-next-cloudflare deste repositório.
- Capturas não rastreadas do legado foram adicionadas à branch histórica no
  commit 109c259. Caches, dependências e estado local do antigo Cloudflare D1
  foram movidos para ../comercialAPP-legacy-local-20260928.
- A origem NewRDO contém alterações locais do usuário; não foram modificadas
  nem descartadas durante a preparação deste repositório.

## Estado

- [x] Preservar o rascunho antigo em branch.
- [x] Criar main sem o histórico de arquivos do rascunho.
- [x] Criar frontend e API mínimos com execução independente.
- [x] Portar a biblioteca inicial de regras comerciais.
- [ ] Registrar resultados de paridade dos cálculos e trazer testes/goldens.
- [ ] Extrair telas, estilos, modelos DOCX, imagens e fluxo de navegação.
- [ ] Extrair serviços de propostas e levantamentos para backend próprio.
- [ ] Criar banco PostgreSQL e migrações apenas do domínio Comercial.
- [ ] Implementar login próprio, cadastro inicial do gestor e permissões.
- [ ] Contratar e implementar o fluxo Comercial → CRM → FiltroAPP.
- [ ] Homologar paridade funcional, operação, backup e implantação.

## Regras da separação

O aplicativo novo não deve importar arquivos do repositório FiltroAPP em tempo
de execução nem consultar seu banco diretamente. Dados comerciais existentes
no módulo atual são testes locais e não precisam ser migrados. Modelos, ativos
e testes de referência são preservados para a extração.

As propostas do legado Access usadas pelo Acompanhamento permanecem intocadas
até a integração nova estar validada. O primeiro número da nova sequência deve
ser conferido contra códigos do CRM e do legado antes de emissão real.
