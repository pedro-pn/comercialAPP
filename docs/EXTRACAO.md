# Extração do Comercial

Este documento registra a extração inicial e suas verificações históricas.
As capacidades atuais e o fluxo de uso estão no [README](../README.md) e no
[tutorial](TUTORIAL.md). As pendências de implantação dependem do ambiente e
não representam um inventário atualizado de serviços em produção.

## Proveniência

- Origem funcional: módulo Comercial do FiltroAPP.
- Pacote inicial de regras: `shared/comercial/src`, com adaptações de exportação
  e imports para um pacote ESM independente.
- Interface: telas comerciais, estilos, imagens, esquema e auxiliares portados,
  com adaptadores para API, identidade e rotas próprias.
- Modelos Word, ativos e cenários de referência preservados no novo projeto.
- Referência histórica local: branch `legacy-next-cloudflare`.
- Caminhos de máquinas, identificadores de repositórios privados e dados locais
  da origem não fazem parte da documentação versionada.

## Estado

- [x] Preservar o rascunho antigo em branch.
- [x] Criar main sem o histórico de arquivos do rascunho.
- [x] Criar frontend e API mínimos com execução independente.
- [x] Portar a biblioteca inicial de regras comerciais.
- [x] Trazer os 16 cenários de referência e verificar a paridade dos cálculos
  com 18 testes aprovados em 28/09/2026.
- [x] Copiar os arquivos das telas e seus recursos; verificar TypeScript e os
  bundles das cinco entradas principais.
- [x] Ligar o menu inicial copiado do Comercial à rota `/`, com destinos para
  levantamentos, rascunhos, histórico e administração conforme o papel.
- [x] Ligar as telas copiadas ao novo fluxo de navegação e portar os modelos DOCX.
- [ ] Conferir visualmente as telas e o resultado dos modelos DOCX/PDF.
- [x] Ligar o histórico de rascunhos em modo de leitura ao login local, com
  busca, paginação e visibilidade conforme o perfil.
- [x] Ligar o formulário de levantamentos ao login próprio: reserva de número,
  rascunho, salvamento automático, reabertura pelo histórico e validação.
- [x] Ligar a montagem de rascunhos de proposta a levantamentos salvos ou à
  criação avulsa, com persistência e reabertura no histórico.
- [x] Extrair serviços de propostas e levantamentos para backend próprio.
- [x] Receber fotos e anexos, emitir DOCX/PDF, permitir download e finalizar
  propostas localmente, sem envio externo.
- [x] Criar a persistência e as primeiras rotas de rascunhos de levantamentos e
  propostas, com autoria, cálculo no servidor, versões salvas e conflito de edição.
- [x] Criar reserva automática de números a partir de valor inicial único,
  configurado pelo gestor; valor real ainda pendente.
- [x] Criar banco PostgreSQL próprio e primeira migração de usuários e sessões.
- [x] Implementar login próprio, cadastro inicial do gestor e permissões da
  administração de acessos.
- [x] Preparar imagens Docker e Compose local/produção para frontend, API e
  PostgreSQL próprios; testar a stack localmente.
- [x] Preparar a integração com Nectar: busca de empresa/contato, lista de funis
  autorizados, criação ou reaproveitamento de card e anexação dos arquivos.
- [x] Validar o envio real com credenciais e funil de teste do Nectar: proposta
  e card sintéticos em 29/09/2026.
- [x] Implementar contrato versionado Comercial → CRM → FiltroAPP, aprovação
  autenticada, fallback do gestor, staging de revisões e orçamento selecionado.
- [x] Preparar a integração com o contrato receptor do FiltroAPP.
- [ ] Conferir a implantação do receptor no FiltroAPP e configurar token e URL
  de serviço nos dois ambientes.
- [ ] Configurar webhook do Nectar e o campo personalizado do projeto no CRM.
- [x] Portar SharePoint, configuração da sede e Google Maps com modos off/fake/real.
- [ ] Validar SharePoint e Google Maps em modo real após configurar credenciais.
- [ ] Homologar paridade funcional, operação, backup e implantação. Incluir
  DNS, certificado e configuração do proxy existente nessa etapa.

O formulário de levantamento e a montagem de rascunhos de proposta usam a
sessão própria e as rotas de persistência. Gestor e vendedor podem criá-los e
reabri-los pelo histórico; consulta vê apenas a lista de propostas sem valores.
A numeração inicial é configurada uma única vez pelo gestor, após conferência
com CRM e legado. A distância pode ser calculada por Maps quando configurado,
com edição manual disponível.
As fotos, os anexos e os documentos ficam no volume de arquivos do Comercial.
A finalização local bloqueia edições e exige documentos atualizados. Em seguida,
o envio ao Nectar pode usar os modos `fake` ou `real`, quando configurados.
O SharePoint pode receber os arquivos quando configurado. A entrega ao FiltroAPP
depende da implantação de uma versão receptora compatível e das credenciais de
serviço.
O CSS portado ainda precisa ser conferido visualmente fora do FiltroAPP.

A primeira migração contém somente `User` e `Session`. A API cria sessões no
PostgreSQL, armazena apenas o hash do token e usa cookie HttpOnly. O gestor
inicial é criado por um comando local que lê a senha da entrada padrão. O gestor
pode criar usuários nos papéis gestor, vendedor e consulta, alterar papéis,
desativar acessos e redefinir senhas. A mudança de papel, desativação ou troca
de senha revoga as sessões daquele usuário. O login tem limite local de
tentativas por nome de usuário; para múltiplas instâncias será preciso mover
esse limite a um armazenamento compartilhado.

A migração e o fluxo de autenticação foram exercitados em 28/09/2026 contra um
PostgreSQL 16 isolado. A migração de arquivos e os testes de integração passaram
em 29/09/2026; a conversão DOCX/PDF passou na imagem da API com LibreOffice.
O teste de integração é executado com
`TEST_DATABASE_URL` apontando para um banco chamado `comercialapp_test`.

Na primeira tentativa de empacotar as telas, esbuild confundiu
BuscaDeEmpresa.tsx com buscaDeEmpresa.ts. O helper foi renomeado apenas no
novo repositório para buscaDeEmpresaUtils.ts. O comando npm run check agora
empacota as cinco entradas extraídas e detecta esse tipo de erro.

## Regras da separação

Na auditoria inicial, o módulo Comercial novo estava em desenvolvimento
separado da linha principal do FiltroAPP. O legado Access/CommercialProposal
atendia fluxos de Acompanhamento que exigiam transição própria. Mudanças fora
do Comercial na origem precisam de revisão independente; sua presença não
autoriza descartá-las durante a extração.

O aplicativo novo não deve importar arquivos do repositório FiltroAPP em tempo
de execução nem consultar seu banco diretamente. Dados comerciais existentes
no módulo atual são testes locais e não precisam ser migrados. Modelos, ativos
e testes de referência são preservados para a extração.

As propostas do legado Access usadas pelo Acompanhamento permanecem intocadas
até a integração nova estar validada. O primeiro número da nova sequência deve
ser conferido contra códigos do CRM e do legado antes de emissão real.
