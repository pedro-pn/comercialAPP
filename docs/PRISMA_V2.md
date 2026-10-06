# Prisma ↔ ComercialAPP — contrato v2

Contrato adaptado a partir dos arquivos fornecidos pelo desenvolvedor do Prisma. Os endpoints de entrada ficam disponíveis após implantação; o envio de PDFs requer configuração explícita. A homologação utiliza somente dados sintéticos.

## Ambientes e identificação

| Sistema | Ambiente | Caminho da API |
|---|---|---|
| Prisma | Produção | `/api/comercialapp/v2/production` |
| Prisma | Sandbox | `/api/comercialapp/v2/sandbox` |
| ComercialAPP | Homologação | `http://IP_DA_VPS:8087/api` ou origem HTTPS pública |
| ComercialAPP | Produção | Origem HTTPS pública seguida de `/api` |

Use a origem real fornecida pelos responsáveis de cada ambiente. `localhost` só atende o próprio host. O ComercialAPP restringe o receptor ao host Prisma contratado; HTTP em loopback é permitido somente fora de produção para testes.

`releaseId` identifica a autorização de um negócio; não apenas o cliente. `clientId`, `opportunityId` e `prismaProjectId` pertencem ao Prisma. `proposalId` é o ID do registro da revisão no ComercialAPP. `proposalCode` e `revisionNumber` identificam a revisão comercial. O ID retornado pelo receptor de PDFs pertence ao Prisma.

`projectId`, quando presente no contrato de eventos, identifica exclusivamente o projeto operacional do FiltroAPP. Nunca preencher com `prismaProjectId`. A implementação nova não inventa vínculo operacional nem dispara criação de projeto por falta desse ID.

## Credenciais separadas

| Direção / finalidade | Credencial | Onde configurar |
|---|---|---|
| Prisma → ComercialAPP: liberações | Token da Central de API com `crm.releases.write` | Segredo privado do Prisma: `COMERCIALAPP_RELEASE_BEARER_TOKEN` (produção), `COMERCIALAPP_SANDBOX_RELEASE_BEARER_TOKEN` (sandbox) |
| Prisma → ComercialAPP: decisões | Outro token da Central de API com `crm.events.write` | Segredo privado do Prisma: `COMERCIALAPP_CALLBACK_BEARER_TOKEN` (produção), `COMERCIALAPP_SANDBOX_CALLBACK_BEARER_TOKEN` (sandbox) |
| ComercialAPP → Prisma: documentos | Service token `prisma_ca_…`, dedicado ao ambiente | `PRISMA_API_TOKEN` e `PRISMA_API_URL` no servidor ComercialAPP |

Não reutilizar tokens entre direções ou ambientes. Tokens da Central são exibidos uma vez, armazenados como hash e podem ser revogados. O administrador seleciona a permissão ao criá-los. Tokens do Prisma são vinculados a produção ou sandbox: um token sandbox não acessa produção. Arquivos e segredos nunca vão para o frontend.

O envio de liberações e o de decisões têm habilitações independentes no Prisma, inicialmente falsas. O trabalhador usa uma credencial interna distinta dos Bearer externos. Em staging do ComercialAPP, utilizar `STAGING_PRISMA_API_URL` / `STAGING_PRISMA_API_TOKEN`, vazios por padrão. As integrações Nectar, SharePoint e FiltroAPP continuam desligadas nesse ambiente.

## 1. Criar, atualizar ou revogar liberação

`POST /api/integrations/crm/releases` no ComercialAPP. `Authorization: Bearer <TOKEN_LIBERACOES>`. Corpo JSON, `Content-Type: application/json`.

```json
{
  "contractVersion": 2,
  "eventId": "7eaefaa1-5e77-4ffc-841d-15d4d0b9c111",
  "releaseId": "36a53577-b7d9-4e14-aa29-01b0f7d66ad1",
  "releaseVersion": 1,
  "releaseStatus": "ACTIVE",
  "clientId": "prisma-company-example",
  "opportunityId": "prisma-deal-example",
  "prismaProjectId": null,
  "contactId": "prisma-contact-example",
  "legalName": "Cliente Sintético Ltda.",
  "taxId": "00000000000191",
  "contactName": "Contato de Homologação",
  "email": "homologacao@example.invalid",
  "department": "Manutenção",
  "site": "Obra de homologação",
  "description": "Solicitação sintética para validar a integração",
  "occurredAt": "2026-10-06T12:00:00.000Z"
}
```

Os IDs de evento e liberação são UUIDs. CNPJ tem 14 dígitos. Todos os campos do exemplo são obrigatórios; departamento pode ser vazio e projeto pode ser `null`. Campos extras são rejeitados. A atualização mantém `releaseId` e aumenta `releaseVersion`. A revogação mantém os dados e envia `releaseStatus: "REVOKED"` com nova versão e novo evento.

Resposta de novo evento, HTTP 202:

```json
{"duplicate":false,"releaseId":"36a53577-b7d9-4e14-aa29-01b0f7d66ad1","releaseVersion":1,"status":"ACTIVE"}
```

Retentativa com mesmo evento e conteúdo: HTTP 200, `duplicate: true`. Mesmo evento com conteúdo diferente, versão anterior, versão repetida com outro evento ou mudança de identidade: HTTP 409. Versão mais nova não pode ter horário anterior ao último evento aceito.

No Prisma, o usuário com permissão de edição libera o negócio na seção **ComercialAPP · liberação e revisões**, na oportunidade. Requer negócio aberto de funil comercial, empresa e contato vinculados. Atualizar/revogar exige a versão corrente, impedindo alteração concorrente. Cada negócio tem sua própria liberação. O envio usa uma fila transacional persistente e preserva o `eventId` nas retentativas.

No ComercialAPP, a tela **Negócios liberados pelo Prisma** mostra as liberações ativas e inicia a proposta com seus dados. Uma revisão herda o vínculo da proposta anterior. Liberações revogadas deixam de autorizar novas propostas; os documentos anteriores permanecem no histórico.

## 2. Receber uma revisão finalizada com dois PDFs

`POST /api/comercialapp/v2/{production|sandbox}/revisions` no Prisma. Headers:

```http
Authorization: Bearer <TOKEN_INGESTAO_PRISMA>
Idempotency-Key: 754a6ee0-636c-4b83-8be5-cfc8a3442a81
Content-Type: multipart/form-data; boundary=<gerado pelo cliente>
```

Exatamente três partes: `metadata` (texto JSON), `technical_pdf` e `commercial_pdf`. Ambos arquivos precisam ter MIME `application/pdf`, nome terminado em `.pdf` e conteúdo iniciado por `%PDF-`. O servidor limita os bytes recebidos, inclusive sem `Content-Length`.

Metadados:

```json
{
  "contractVersion": 2,
  "releaseId": "36a53577-b7d9-4e14-aa29-01b0f7d66ad1",
  "clientId": "prisma-company-example",
  "opportunityId": "prisma-deal-example",
  "prismaProjectId": null,
  "proposalId": "comercialapp-id-da-revisao",
  "proposalCode": "3088",
  "revisionNumber": 2,
  "amountBrl": "12500.00"
}
```

`amountBrl` é opcional e usa ponto decimal; os outros campos são obrigatórios. `revisionNumber` é inteiro entre 0 e 999999999. `proposalCode` é texto, preservando zeros. Não enviar `projectId` nesses metadados.

Exemplo cURL (variáveis contêm credenciais fornecidas fora da documentação):

```bash
curl --fail-with-body "$PRISMA_BASE/revisions" \
  -H "Authorization: Bearer $PRISMA_TOKEN" \
  -H "Idempotency-Key: $REQUEST_UUID" \
  -F 'metadata=<metadata.json' \
  -F 'technical_pdf=@tecnica.pdf;type=application/pdf' \
  -F 'commercial_pdf=@comercial.pdf;type=application/pdf'
```

Resposta de criação, HTTP 201:

```json
{
  "id":"cee9eeb0-c548-4f26-822c-d63cfd4c42ad",
  "releaseId":"36a53577-b7d9-4e14-aa29-01b0f7d66ad1",
  "opportunityId":"prisma-deal-example",
  "proposalId":"comercialapp-id-da-revisao",
  "proposalCode":"3088",
  "revisionNumber":2,
  "replayed":false
}
```

Retentativa idêntica retorna HTTP 200 e o mesmo `id`, até com outra chave de requisição. Mesmo registro/revisão com arquivos, nomes ou metadados diferentes retorna 409. Outra oportunidade/cliente/projeto divergente também retorna 409. A transação salva os dois PDFs e finaliza o registro conjuntamente: falha em um arquivo não deixa meia proposta.

Cada revisão é imutável no Prisma. Correção de documentos após recebimento exige nova revisão; regenerar documentos localmente não substitui a versão já recebida. Uma liberação revogada bloqueia novas revisões, mas não invalida a confirmação de uma revisão já recebida.

### Limites

- PDF técnico: até **10.000.000 bytes**; PDF comercial: até **10.000.000 bytes**.
- Multipart completo: até **20.100.000 bytes**, incluindo limites, cabeçalhos e JSON.
- Metadados: até **64.000 bytes**.
- Nome do arquivo: até 255 caracteres, sem controles.
- Identificador externo da revisão: até 200 caracteres; código: até 40 caracteres.
- Duas requisições de upload simultâneas por processo web.
- Orçamento atual por service token: 120 operações/minuto e quatro gravações de arquivo/minuto. Uma revisão consome duas gravações, permitindo duas revisões novas/minuto por token. Recebimentos idênticos reutilizam o registro.

A aplicação ComercialAPP guarda o ID recebido, apresenta o status na proposta e no histórico e reenvia falhas transitórias com espera progressiva. A retentativa automática para após dez tentativas. Respostas 429 respeitam `Retry-After`; falhas transitórias usam espera progressiva. Erros de validação precisam de correção e envio manual. A geração de PDFs enviada fica registrada para repetir exatamente os mesmos arquivos caso a confirmação se perca. Finalização local permanece salva mesmo se a integração estiver indisponível.

## 3. Aceite, recusa ou cancelamento por revisão

`POST /api/integrations/crm/events` no ComercialAPP, `Authorization: Bearer <TOKEN_STATUS>`, JSON:

```json
{
  "contractVersion":2,
  "eventId":"f7ab6255-3f08-4bfe-9551-2b7d640796b1",
  "proposalCode":"3088",
  "revisionNumber":2,
  "proposalId":"comercialapp-id-da-revisao",
  "releaseId":"36a53577-b7d9-4e14-aa29-01b0f7d66ad1",
  "clientId":"prisma-company-example",
  "opportunityId":"prisma-deal-example",
  "prismaProjectId":null,
  "approvalStatus":"APPROVED",
  "statusSequence":2,
  "occurredAt":"2026-10-06T13:00:00.000Z"
}
```

Estados: `APPROVED` (aceita), `REJECTED` (recusada), `CANCELLED` (cancelada). Cada decisão no Prisma indica a revisão exata. `statusSequence` aumenta a cada mudança dessa revisão; pode começar acima de 1 porque a finalização já representa uma transição.

O contrato legado v1 continua aceitando APPROVED/REJECTED. CANCELLED exige v2. Em v2, sequência é obrigatória e novos IDs, quando enviados, precisam corresponder à revisão armazenada. O Prisma envia todos os IDs do vínculo. Se houver projeto operacional conhecido, `projectId` pode ser enviado separadamente; ele não é obrigatório para registrar a decisão comercial.

Novo evento: HTTP 202, resposta com `duplicate`, `proposalId`, `approvalStatus`, `deliveryStatus` e `delivery`. Repetição idêntica: 200. Evento antigo/incompatível: 409. Um evento repetido de aceite, após cancelamento mais recente, é reconhecido sem restaurar o aceite nem repetir uma ação operacional. Eventos de outra revisão alteram somente aquela revisão.

Cancelar ou recusar preserva PDFs e histórico. Não apaga nem desfaz automaticamente uma entrega operacional já concluída no FiltroAPP. O registro da decisão no Prisma não fecha automaticamente a oportunidade: essa ação comercial continua explícita.

## 4. Consulta e teste sandbox

`GET /api/comercialapp/v2/{environment}/releases` consulta até 100 liberações por página. A próxima página usa `?after=<releaseId da última linha>`. Autenticação de serviço obrigatória. Resultado `{ "data": [...] }`; inclui ativas e revogadas para reconciliação.

`POST /api/comercialapp/v2/sandbox/sandbox-release`, JSON `{ "status":"ACTIVE" }` ou `REVOKED`, Bearer sandbox e UUID em Idempotency-Key: prepara uma liberação sintética. Não modifica oportunidades de produção. A fila sandbox só entrega ao destino de homologação explicitamente permitido quando a configuração sandbox for habilitada.

`POST /api/comercialapp/v2/sandbox/sandbox-status`, Bearer sandbox e Idempotency-Key, JSON `{ "id":"<id recebido no Prisma>", "status":"accepted", "expectedSequence":1 }`: registra uma decisão sintética. Também aceita `declined` e `cancelled`. Em produção, essas rotas de teste são rejeitadas.

Downloads autenticados de revisões continuam disponíveis pela API v1 compatível e pelas rotas v2 de consulta delegadas. Na interface Prisma, o usuário acessa os PDFs pela oportunidade; o RPC de download revalida a permissão do negócio.

## 5. Erros e tratamento

| HTTP | Tratamento |
|---|---|
| 400 | Corrigir metadados/campos; não repetir automaticamente. |
| 401/403 | Corrigir token, escopo ou ambiente. |
| 404 | Conferir liberação, negócio e revisão. |
| 409 | Comparar versão/identidade/conteúdo; nunca sobrescrever uma revisão recebida. |
| 413 | Reduzir PDFs ou corpo total. |
| 415 | Corrigir Content-Type, nome e formato do arquivo. |
| 429 | Aguardar Retry-After; reenviar com os mesmos IDs/chave/conteúdo. |
| 5xx/timeout | Repetir com espera progressiva, mantendo idempotência. |

O Prisma mantém fila, lease e resultado de entrega para liberações e decisões. Estados de fila e tentativas são operacionais, separados do estado comercial. Um erro de integração não deve ser interpretado como aceite ou recusa.

## 6. Homologação e entrada em produção

Validação executada nesta adaptação: suíte geral ComercialAPP com PostgreSQL descartável e ciclo conjunto com o código real Prisma no commit `8203e7e` (v1.20.0), incluindo multipart HTTP, duas revisões/quatro PDFs, decisões e revogação. A homologação entre os serviços publicados deve ser executada após implantação, com credenciais próprias do sandbox. O teste com o código real do Prisma exige também seu checkout e dependências.

1. Publicar backend e frontend do ComercialAPP; o entrypoint da API aplica as migrações. A nova migração adiciona tabelas de liberações, identidade das revisões e controle persistente de envio. Não reverter removendo tabelas ou PDFs.
2. Na Central de API de staging, criar duas credenciais: **Liberações de negócios** (`crm.releases.write`) e **Status das revisões** (`crm.events.write`). Compartilhar os segredos por canal privado, preservando a separação por ambiente.
3. No Prisma, configurar o destino público de staging nos caminhos `/api/integrations/crm/releases` e `/api/integrations/crm/events`, com cada Bearer correspondente. Configurar os segredos `COMERCIALAPP_SANDBOX_RELEASE_BEARER_TOKEN` e `COMERCIALAPP_SANDBOX_CALLBACK_BEARER_TOKEN` no Prisma para sandbox (nomes padrão do contrato). Confirmar com o desenvolvedor as opções de habilitação do trabalhador sandbox.
4. Solicitar ao Prisma um service token **sandbox** de ingestão de PDFs e a URL base terminada em `/api/comercialapp/v2/sandbox`. No `.env.staging` do ComercialAPP configurar `STAGING_PRISMA_API_URL` e `STAGING_PRISMA_API_TOKEN`. Recriar a API para carregar as variáveis. O Compose recusa receptor de produção em staging; Nectar, SharePoint e FiltroAPP permanecem desligados.
5. Preparar CNPJ sintético com dígitos verificadores válidos. O fixture sandbox do Prisma v1.20.0 (`8203e7e`) usa `00000000000000`, rejeitado pela validação existente da tela ComercialAPP; ajustar esse fixture antes do ciclo pela interface. Executar a liberação sintética: esperar 202, repetir o mesmo evento e confirmar 200. Conferir o negócio em **Negócios liberados pelo Prisma**, preencher/finalizar uma proposta e verificar os dois PDFs e o ID de recebimento no Prisma.
6. Criar uma nova revisão e confirmar novo registro, preservando os documentos anteriores. Enviar aceite, recusa e cancelamento com `statusSequence` crescente por revisão. Repetir um aceite antigo após cancelamento: a resposta deve reconhecer o evento sem restaurar o estado anterior. Sem `projectId`, não há envio operacional.
7. Revogar a liberação e confirmar o bloqueio de novas propostas/revisões e a preservação do histórico. Validar credenciais cruzadas, conflitos, indisponibilidade transitória e reenvio com os mesmos arquivos.
8. Somente após aprovação desse ciclo, configurar tokens de produção separados e habilitar o envio de produção no Prisma. Para suspender PDFs em staging, esvaziar as duas variáveis `STAGING_PRISMA_*` e recriar a API; para suspender eventos de entrada, desabilitar o trabalhador Prisma ou revogar as credenciais correspondentes.

Teste independente, após migrar o banco descartável `comercialapp_test`:

```bash
TEST_DATABASE_URL='<URL privada do banco de teste>' \
node --test backend/test/prisma-v2.integration.test.js
```

Teste com os dois checkouts:

```bash
TEST_DATABASE_URL='<URL privada do banco de teste>' \
PRISMA_SOURCE_DIR='<checkout absoluto do Prisma>' \
node --test backend/test/prisma-exchange.integration.test.js

# No checkout Prisma, conforme os scripts do contrato fornecido:
node scripts/verify-comercialapp-v2.mjs
node --import tsx --test tests/demo/comercialapp-api.test.ts tests/demo/comercialapp-callback.test.ts tests/demo/comercialapp-v2.test.ts
```

O teste entre repositórios é ignorado quando `PRISMA_SOURCE_DIR` não é informado. A verificação de renderização Word também depende do LibreOffice instalado. Testes ignorados não confirmam esses caminhos.
