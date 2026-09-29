# Persistência inicial de rascunhos

Esta etapa cria tabelas independentes para levantamentos, versões salvas,
propostas e reservas de números. Não há referência ao banco do FiltroAPP.
A segunda migração é `20260929120000_commercial_drafts` e entra com o mesmo
`prisma migrate deploy` usado no Docker.

## Numeração

- `GET /api/comercial/numeracao/status`: mostra se existe valor inicial.
- `POST /api/comercial/numeracao/inicializar`: gestor informa
  `{ "initialNumber": 8700 }` **uma única vez**. O número do exemplo não é um
  valor aprovado para produção.
- `POST /api/comercial/propostas/proximo-numero`: gestor ou vendedor reserva e
  consome um número. A operação registra autor e não reutiliza números. Não há
  emissão enquanto o valor inicial não for configurado.

O valor inicial real precisa ser comparado com os códigos do CRM e do legado
antes do primeiro uso. A API não consulta esses sistemas para fazer a checagem.
Não configurar produção com um número de exemplo.

## Rascunhos

- `GET/POST /api/comercial/levantamentos` e `GET/PUT` por ID.
- `GET/POST /api/comercial/propostas` e `GET/PUT` por ID.
- `POST .../:id/arquivar` e `POST .../:id/desarquivar`; não há exclusão.
- `GET /api/comercial/consultores` deriva a lista das contas ativas.
- `GET /api/comercial/propostas/:codigo/revisao` prepara a revisão sem gravá-la.

O servidor recalcula custo, preço e margem a partir do payload, sem aceitar
valores enviados pelo navegador. O vendedor só alcança seus registros; o gestor
alcança todos. O perfil de consulta lê a lista de propostas sem campos de
valor e não abre o registro completo. Edições exigem `expectedUpdatedAt` e
respondem conflito 409 quando outro usuário salvou uma versão mais recente.

O histórico usa o login próprio. Gestor e vendedor podem abrir e editar seus
levantamentos e rascunhos de proposta; consulta vê somente a lista de propostas
sem valores. O gestor
pode configurar o primeiro número pela tela de acesso, confirmando antes que
ele não aparece no CRM ou no legado. No levantamento, endereços e distâncias
são informados manualmente enquanto o serviço de mapas não existe neste app.
A montagem de propostas aceita rascunhos com ou sem levantamento vinculado. A migração
`20260929180000_local_documents` acrescenta documentos, anexos e fotos de escopo.
`POST /api/comercial/propostas/documentos` emite os modelos comercial e técnico
em DOCX/PDF a partir da proposta salva. `GET /api/comercial/documentos/:id`
baixa os arquivos; `GET /api/comercial/propostas/:id/documentos` lista a emissão
atual. `POST /api/comercial/propostas/previa.pdf` gera uma prévia sem salvar.
`POST /api/comercial/escopo/fotos` guarda fotos válidas de até 1,5 MB.
`GET/POST /api/comercial/propostas/:id/anexos` e `DELETE` por ID gerem os anexos.
`POST /api/comercial/propostas/:id/finalizar-local` fecha a edição somente com
documentos atualizados e PDFs mais anexos dentro do limite agregado de 20 MB.
O perfil de consulta pode baixar apenas o documento técnico. A etapa Nectar
acrescenta `GET /nectar/funis`, `GET /crm/empresas`, `GET /crm/empresas/:id`,
`GET /propostas/:id/integracao-crm` e `POST /propostas/:id/enviar-crm` sob
`/api/comercial`. O envio real ainda depende de configuração e validação com
credenciais no funil de teste. SharePoint, FiltroAPP e a revisão visual completa
das telas ficam para depois.

## Verificação

`npm run check` valida o esquema, compila frontend e regras e executa testes.
Sem `TEST_DATABASE_URL`, os testes de banco são pulados. Um teste HTTP mais amplo está em
`backend/test/commercial.integration.test.js`; para executá-lo, use um
PostgreSQL de teste com base chamada exatamente `comercialapp_test`, aplique as
migrações e defina `TEST_DATABASE_URL`. O teste apaga **somente** as tabelas
comerciais e de usuários dessa base de teste.
