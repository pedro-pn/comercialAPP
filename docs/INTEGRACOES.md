# Integrações externas

O ComercialAPP grava e finaliza os documentos antes de qualquer envio. Uma falha
externa deixa os arquivos no histórico para download e retentativa.

## Nectar

Configure `NECTAR_MODE`, `NECTAR_API_TOKEN`, `NECTAR_PIPELINE_IDS` e
`NECTAR_RESPONSAVEL_ID` no `.env` da raiz (Docker) ou em `backend/.env` (API
local). O modo `fake` simula a criação do card; `real` usa a conta configurada.
O gestor escolhe um funil autorizado, uma empresa e um contato vinculado.

Teste real realizado em 29/09/2026 no funil **Funil de testes** com empresa,
contato e proposta sintéticos. O segundo envio retornou o mesmo card, sem criar
outro.

## Aprovação e FiltroAPP

O Nectar pode disparar o webhook de oportunidade **Ganhar** para
`POST /api/integrations/nectar/webhook`, com autenticação Bearer usando
`NECTAR_WEBHOOK_TOKEN` (`CRM_EVENT_TOKEN` permanece como fallback legado).
O ComercialAPP consulta a oportunidade na API do Nectar e confirma seu estado
antes de registrar a aprovação. O gestor também pode usar
“Consultar aprovação no Nectar” na proposta. O evento de aprovação requer
`status=2` (oportunidade ganha). O ID do projeto é lido do campo personalizado
cujo **nome exato** foi configurado em `NECTAR_PROJECT_FIELD`.

O CRM Prisma envia para `POST /api/integrations/crm/events` na origem pública do
ComercialAPP configurada no ambiente, com HTTPS obrigatório em produção.
Em staging, a mesma rota está disponível mesmo com `NECTAR_MODE=off`; o
[guia de staging](STAGING.md#4-liberar-a-central-de-api-e-receber-eventos-do-prisma)
explica como acessar a Central e testar o recebimento pela origem HTTP ou HTTPS
de homologação.
O administrador cria o Bearer token na **Central de API** (`/api-central`),
com validade de 1 a 365 dias ou sem vencimento. Um token sem vencimento permanece
ativo até ser revogado. O segredo aparece uma única vez; no banco fica
somente seu hash. O administrador pode revogar o token, consultar uso e validar
o contrato sem gravar um evento no playground. Corpo versão 1, com valores
fictícios de exemplo:

```json
{
  "contractVersion": 1,
  "eventId": "00000000-0000-4000-8000-000000000001",
  "proposalCode": "CODIGO-EXEMPLO",
  "revisionNumber": 0,
  "opportunityId": "ID-EXEMPLO",
  "approvalStatus": "APPROVED",
  "projectId": "id-do-projeto-no-filtroapp",
  "occurredAt": "2026-09-29T18:47:18.804Z"
}
```

Ambos os endpoints exigem `Authorization: Bearer <token>` e operam sem
cookie de usuário. O token criado na UI funciona somente na rota do Prisma;
o webhook Nectar continua com segredo separado no ambiente. Eventos repetidos
são idempotentes; eventos antigos e vínculos que contradizem uma entrega
concluída são recusados. O primeiro evento do Prisma vincula a oportunidade à
proposta; eventos posteriores precisam informar o mesmo `opportunityId`. Se o Nectar não trouxer
aprovação ou vínculo, a gestão do Comercial pode registrar manualmente
o ID do projeto, com motivo e trilha no banco. A tela permite buscar projetos
ativos do FiltroAPP por código, nome ou cliente.

Defina `FILTROAPP_API_URL` como a origem da API do FiltroAPP e
`FILTROAPP_API_TOKEN` como o mesmo segredo definido em
`COMERCIALAPP_SERVICE_TOKEN` no FiltroAPP. A entrega vai para
`POST /api/acompanhamento/comercial/comercialapp/propostas`. O FiltroAPP guarda
a proposta em `CommercialAppProposal`; se o projeto não tem orçamento, seleciona
a primeira revisão aprovada. Revisões posteriores e projetos com orçamento do
Access ficam em staging até a escolha explícita de um gestor do Acompanhamento
por `POST /api/acompanhamento/comercial/projetos/:projectId/comercialapp/selecionar`.
O endpoint de consulta é `GET .../comercialapp/revisoes`. Quando o orçamento
atual vem do Access, a troca exige `replaceLegacy: true` e confirmação na tela.
O dashboard usa o
orçamento selecionado sem apagar as linhas `CommercialProposal` importadas do
Access.
O Prisma informa ao FiltroAPP a identidade do projeto e o vínculo com a proposta.
Após a aprovação, o ComercialAPP entrega diretamente os dados da proposta ao
FiltroAPP, incluindo os itens estruturados do escopo da proposta. Quando há
levantamento vinculado, a entrega inclui `estimateSummary`
com horas normais, extras e totais, carga de trabalho por fase e categorias de
custo calculadas pelo mesmo motor que gera o levantamento. A revisão fica no
histórico do FiltroAPP; somente a revisão selecionada alimenta o orçamento e as
horas previstas do cronograma. Sem levantamento, `estimateSummary` é `null`.
O custo previsto é o custo direto. Insumos já incluem filtros e efluente;
tributos, comissões, despesas comerciais e overhead são valores de precificação
informados separadamente, sem somá-los novamente ao custo previsto.
O CSV anexado ao CRM e esse resumo usam a última versão do levantamento salva
até a finalização da proposta; edições posteriores do levantamento não alteram
os dados entregues da proposta finalizada.
Falhas de entrega têm até dez tentativas automáticas com espera progressiva;
após isso, o gestor pode corrigir o vínculo e reenviar. Revisões em staging são
consultadas novamente a cada quinze minutos para atualizar o estado local.
Na implantação, publique primeiro o receptor do FiltroAPP e depois o emissor
do ComercialAPP. Propostas já marcadas como `SUCESSO` não são reenviadas pela
rotina automática; para preencher o novo resumo nelas será necessária uma
rotina específica de atualização.

É preciso implantar uma versão do FiltroAPP que implemente esse contrato receptor
antes de ativar `FILTROAPP_API_URL`. A presença do emissor neste repositório não
comprova que o receptor esteja ativo em outro ambiente.

## SharePoint e Google Maps

O SharePoint grava os PDFs, o CSV de custos (quando houver) e os anexos, após a
finalização. Configure `SHAREPOINT_MODE=real`, as credenciais de aplicativo
`MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, um
destino (`SHAREPOINT_DRIVE_ID`, ou `SHAREPOINT_SITE_ID`, ou hostname e caminho)
e `SHAREPOINT_BASE_FOLDER`. A pasta base é obrigatória em modo real. O gestor
pode indicar uma pasta existente dentro dela. `fake` testa sem usar a rede.

O cálculo de distância usa Geocoding, Routes e Places. Configure
`GOOGLE_MAPS_MODE=real` e `GOOGLE_MAPS_API_KEY`; restrinja a chave às APIs
necessárias. O gestor informa o endereço da sede na tela Configurações. Quando
o serviço não encontra um endereço com confiança, a distância permanece
editável manualmente. Os limites diários são `GOOGLE_MAPS_MAX_DIA` e
`GOOGLE_MAPS_MAX_DIA_SUGESTOES`.

SharePoint e Maps foram validados em modo `fake`. O uso real depende das
credenciais e destinos preenchidos no ambiente; os `.env.example` listam todas
as variáveis. Guarde valores reais, tokens e identificadores dos serviços somente
no ambiente ou no cofre de segredos. Os exemplos de documentação devem permanecer
fictícios, conforme a [política do projeto](../README.md#informações-sensíveis-na-documentação).

## Prisma v2: liberações, PDFs e decisões

Consulte [PRISMA_V2.md](PRISMA_V2.md) para o contrato coordenado, credenciais por direção, limites, exemplos e homologação. O envio de documentos usa PRISMA_API_URL / PRISMA_API_TOKEN e fica desligado sem configuração.
