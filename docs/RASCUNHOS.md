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

As telas copiadas ainda não foram ligadas ao roteador. A API cobre apenas o
salvamento e a leitura inicial: faltam documentos DOCX/PDF, arquivos anexos,
fotos de escopo, finalização, integração CRM e revisão visual das telas.

## Verificação

`npm run check` valida o esquema, compila frontend e regras e executa testes
sem banco. Um teste HTTP mais amplo está em
`backend/test/commercial.integration.test.js`; para executá-lo, use um
PostgreSQL de teste com base chamada exatamente `comercialapp_test`, aplique as
migrações e defina `TEST_DATABASE_URL`. O teste apaga **somente** as tabelas
comerciais e de usuários dessa base de teste.
