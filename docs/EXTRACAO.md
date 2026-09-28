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
- [ ] Ligar as telas copiadas ao novo fluxo de navegação e revisar modelos DOCX.
- [ ] Extrair serviços de propostas e levantamentos para backend próprio.
- [x] Criar banco PostgreSQL próprio e primeira migração de usuários e sessões.
- [x] Implementar login próprio, cadastro inicial do gestor e permissões da
  administração de acessos.
- [ ] Contratar e implementar o fluxo Comercial → CRM → FiltroAPP.
- [ ] Homologar paridade funcional, operação, backup e implantação.

Os arquivos das telas de propostas já compilam, mas não foram ligados ao
roteador. O adaptador de identidade dessas telas ainda não tem provedor, e os
endpoints de frontend/src/api/comercial.ts ainda não existem no backend
independente. A tela ativa cobre apenas login e gestão de acessos. Não habilitar
os formulários de propostas antes de implementar persistência, validação do
servidor e permissões por operação. O CSS portado ainda precisa ser conferido
visualmente fora do FiltroAPP.

A primeira migração contém somente `User` e `Session`. A API cria sessões no
PostgreSQL, armazena apenas o hash do token e usa cookie HttpOnly. O gestor
inicial é criado por um comando local que lê a senha da entrada padrão. O gestor
pode criar usuários nos papéis gestor, vendedor e consulta, alterar papéis,
desativar acessos e redefinir senhas. A mudança de papel, desativação ou troca
de senha revoga as sessões daquele usuário. O login tem limite local de
tentativas por nome de usuário; para múltiplas instâncias será preciso mover
esse limite a um armazenamento compartilhado.

A migração e o fluxo de autenticação foram exercitados em 28/09/2026 contra um
PostgreSQL 16 isolado. O teste de integração é executado com
`TEST_DATABASE_URL` apontando para um banco chamado `comercialapp_test`.

Na primeira tentativa de empacotar as telas, esbuild confundiu
BuscaDeEmpresa.tsx com buscaDeEmpresa.ts. O helper foi renomeado apenas no
novo repositório para buscaDeEmpresaUtils.ts. O comando npm run check agora
empacota as cinco entradas extraídas e detecta esse tipo de erro.

## Regras da separação

Em 28/09/2026, a auditoria de `main` e `origin/main` do FiltroAPP no commit
`31865b08` confirmou que o novo módulo Comercial existe apenas na branch
`feat/modulo-comercial`. Não há código desse módulo a retirar da `main` por
enquanto. O legado Access/CommercialProposal permanece na `main` e atende
fluxos de Acompanhamento que exigem transição própria. A branch de origem
também contém mudanças fora do Comercial; não encerrá-la inteira sem revisar
essas diferenças.

O aplicativo novo não deve importar arquivos do repositório FiltroAPP em tempo
de execução nem consultar seu banco diretamente. Dados comerciais existentes
no módulo atual são testes locais e não precisam ser migrados. Modelos, ativos
e testes de referência são preservados para a extração.

As propostas do legado Access usadas pelo Acompanhamento permanecem intocadas
até a integração nova estar validada. O primeiro número da nova sequência deve
ser conferido contra códigos do CRM e do legado antes de emissão real.
