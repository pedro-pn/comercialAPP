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
`CRM_EVENT_TOKEN`. O ComercialAPP consulta a oportunidade na API do Nectar e
confirma seu estado antes de registrar a aprovação. O gestor também pode usar
“Consultar aprovação no Nectar” na proposta. O evento de aprovação requer
`status=2` (oportunidade ganha). O ID do projeto é lido do campo personalizado
cujo **nome exato** foi configurado em `NECTAR_PROJECT_FIELD`.

Também existe `POST /api/integrations/crm/events` para um integrador que já
conheça a proposta, a revisão, a aprovação e o projeto. Corpo versão 1:

```json
{
  "contractVersion": 1,
  "eventId": "c8994e3f-7dc0-429a-9d15-20f9ba635925",
  "proposalCode": "CODIGO-EXEMPLO",
  "revisionNumber": 0,
  "opportunityId": "ID-EXEMPLO",
  "approvalStatus": "APPROVED",
  "projectId": "id-do-projeto-no-filtroapp",
  "occurredAt": "2026-09-29T18:47:18.804Z"
}
```

Ambos os endpoints exigem `Authorization: Bearer <CRM_EVENT_TOKEN>` e operam sem
cookie de usuário. Eventos repetidos são idempotentes; eventos antigos e vínculos
que contradizem uma entrega concluída são recusados. Se o Nectar não trouxer
aprovação ou vínculo, somente o gestor do Comercial pode registrar manualmente
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
Falhas de entrega têm até dez tentativas automáticas com espera progressiva;
após isso, o gestor pode corrigir o vínculo e reenviar. Revisões em staging são
consultadas novamente a cada quinze minutos para atualizar o estado local.

O receptor está na `main` local do FiltroAPP, commit `4bc5def0`, preparado em
um worktree isolado e depois integrado por avanço direto. É preciso implantar
essa revisão no ambiente do FiltroAPP antes de ativar `FILTROAPP_API_URL`.

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
as variáveis.
