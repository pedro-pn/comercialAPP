# Extração do Comercial

## Proveniência

- Origem do módulo: /home/relat/apps/NewRDO, branch feat/modulo-comercial,
  commit 94b74278043a7416febf3c52f4ae4ca093924920.
- Pacote de regras inicial: shared/comercial/src copiado da origem nesse commit.
  Apenas os caminhos de exportação do índice e um import de tipo foram ajustados
  para o novo pacote ESM; a lógica dos cálculos não foi alterada.
- Arquivos de interface: frontend/src/pages/comercial, estilos, imagens, esquema
  comercial e auxiliares copiados da mesma origem. Pequenos adaptadores locais
  substituem imports do FiltroAPP para API, identidade e registro de rotas.
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
- [x] Trazer os 16 cenários de referência e verificar a paridade dos cálculos
  com 18 testes aprovados em 28/09/2026.
- [x] Copiar os arquivos das telas e seus recursos; verificar TypeScript e os
  bundles das cinco entradas principais.
- [ ] Extrair telas, estilos, modelos DOCX, imagens e fluxo de navegação.
- [ ] Extrair serviços de propostas e levantamentos para backend próprio.
- [ ] Criar banco PostgreSQL e migrações apenas do domínio Comercial.
- [ ] Implementar login próprio, cadastro inicial do gestor e permissões.
- [ ] Contratar e implementar o fluxo Comercial → CRM → FiltroAPP.
- [ ] Homologar paridade funcional, operação, backup e implantação.

Os arquivos de interface já compilam, mas não foram ligados ao roteador.
O adaptador de identidade ainda não tem provedor, e os endpoints de
frontend/src/api/comercial.ts ainda não existem no backend independente.
Não habilitar os formulários para usuários antes de implementar login,
persistência e validação do servidor. O CSS portado ainda precisa ser conferido
visualmente fora do FiltroAPP.

Na primeira tentativa de empacotar as telas, esbuild confundiu
BuscaDeEmpresa.tsx com buscaDeEmpresa.ts. O helper foi renomeado apenas no
novo repositório para buscaDeEmpresaUtils.ts. O comando npm run check agora
empacota as cinco entradas extraídas e detecta esse tipo de erro.

## Regras da separação

Em 28/09/2026, a auditoria de `main` e `origin/main` do FiltroAPP no commit
`31865b08` confirmou que o novo módulo Comercial existe apenas na branch
`feat/modulo-comercial`. Não há código desse módulo a retirar da `main` por
enquanto. O legado Access/CommercialProposal permanece na `main` e atende
fluxos de Acompanhamento que exigem transição própria.

O aplicativo novo não deve importar arquivos do repositório FiltroAPP em tempo
de execução nem consultar seu banco diretamente. Dados comerciais existentes
no módulo atual são testes locais e não precisam ser migrados. Modelos, ativos
e testes de referência são preservados para a extração.

As propostas do legado Access usadas pelo Acompanhamento permanecem intocadas
até a integração nova estar validada. O primeiro número da nova sequência deve
ser conferido contra códigos do CRM e do legado antes de emissão real.
