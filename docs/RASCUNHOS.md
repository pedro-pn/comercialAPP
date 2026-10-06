# Rascunhos e persistência

O aplicativo usa tabelas independentes para levantamentos, versões salvas,
propostas e reservas de números. Não há referência ao banco do FiltroAPP.
A segunda migração é `20260929120000_commercial_drafts` e entra com o mesmo
`prisma migrate deploy` usado no Docker.

## Numeração

- `GET /api/comercial/numeracao/status`: mostra se existe valor inicial.
- `POST /api/comercial/numeracao/inicializar`: administrador/gestor informa
  `{ "initialNumber": 1000 }` para configurar uma sequência ainda não iniciada.
  O número do exemplo não é um
  valor aprovado para produção.
- `PUT /api/comercial/numeracao/inicial`: somente o administrador altera uma
  sequência já configurada com `{ "initialNumber": 1000 }`. O valor inicial e o
  próximo número passam a usar o valor informado, com data e autor atualizados.
  Reservas e propostas anteriores são preservadas; números já reservados,
  inclusive os legados registrados, continuam sendo pulados.
- `POST /api/comercial/propostas/proximo-numero`: administrador, gestor ou vendedor reserva e
  consome um número. A operação registra autor e não reutiliza números. Não há
  emissão enquanto o valor inicial não for configurado.

O valor inicial real precisa ser comparado com os códigos do CRM e do legado
antes do primeiro uso ou de uma alteração. A tela pede confirmação em um diálogo
antes de gravar. A API não consulta esses sistemas para fazer a checagem.
Não configurar produção com um número de exemplo.

## Rascunhos

- `GET/POST /api/comercial/levantamentos` e `GET/PUT` por ID.
- `GET/POST /api/comercial/propostas` e `GET/PUT` por ID.
- `POST .../:id/arquivar` e `POST .../:id/desarquivar`; não há exclusão.
- `GET /api/comercial/consultores` reúne contas ativas e consultores cadastrados.
- `POST /api/comercial/consultores` cadastra um consultor pelo nome completo;
  exclusivo de administradores e gestores.
- `PATCH /api/comercial/consultores/:id` altera o nome e `DELETE` remove o cadastro
  da seleção de novas propostas; exclusivos da gestão. A remoção preserva vínculos
  e nomes das propostas anteriores, inclusive para novas revisões.
- `GET /api/comercial/propostas/:codigo/revisao` prepara a revisão sem gravá-la.

O servidor recalcula custo, preço e margem do levantamento a partir do payload,
sem aceitar totais calculados pelo navegador. Na proposta, o total é calculado
a partir dos itens de preço. O vendedor só alcança seus registros;
administradores e gestores alcançam todos. O perfil de consulta lê a lista de
propostas sem campos de valor e não abre o registro completo.
Edições exigem `expectedUpdatedAt` e
respondem conflito 409 quando outro usuário salvou uma versão mais recente.

Ao voltar ao menu ou sair do sistema pela tela da proposta, o aplicativo aguarda
o salvamento em andamento e grava as alterações mais recentes antes de sair.
Se a gravação falhar, o formulário permanece aberto com os valores digitados.
O rascunho local é separado por número e revisão; uma resposta de salvamento
anterior não apaga alterações mais novas guardadas no navegador.

O histórico usa o login próprio. Gestor e vendedor podem abrir e editar seus
levantamentos e rascunhos de proposta; consulta vê somente a lista de propostas
sem valores. Administradores/gestores
podem configurar o primeiro número em **Acessos e numeração**, confirmando antes
que ele não aparece no CRM ou no legado. A sequência pula números legados já
registrados no aplicativo. Uma primeira revisão legada pode ser registrada por
`POST /api/comercial/propostas/legado/revisao`, com o número e a revisão conferidos.
No levantamento, endereços e distâncias podem ser informados manualmente ou
usados com Google Maps quando configurado; a sede é definida em **Configurações**.
A montagem de propostas aceita rascunhos com ou sem levantamento vinculado. A migração
`20260929180000_local_documents` acrescenta documentos, anexos e fotos de escopo.
`POST /api/comercial/propostas/documentos` emite os modelos comercial e técnico
em DOCX/PDF a partir da proposta salva. `GET /api/comercial/documentos/:id`
baixa os arquivos; `GET /api/comercial/propostas/:id/documentos` lista a emissão
atual. `POST /api/comercial/propostas/previa.pdf` gera uma prévia sem salvar.
`POST /api/comercial/escopo/fotos` guarda fotos válidas de até 1,5 MB.
`GET/POST /api/comercial/propostas/:id/anexos` e `DELETE` por ID gerem os anexos.
`POST /api/comercial/propostas/:id/finalizar-local` fecha a edição somente com
documentos atualizados e PDFs, CSV de custos quando houver e anexos dentro do
limite agregado de 20 MB. A finalização preserva os dados do levantamento vinculado
para as integrações; edições posteriores não alteram o conteúdo entregue.
O perfil de consulta pode baixar apenas o documento técnico. A etapa Nectar
acrescenta `GET /nectar/funis`, `GET /crm/empresas`, `GET /crm/empresas/:id`,
`GET /propostas/:id/integracao-crm` e `POST /propostas/:id/enviar-crm` sob
`/api/comercial`. O envio real depende de configuração e validação com
credenciais do ambiente. SharePoint, Maps e a aprovação/entrega ao FiltroAPP estão
descritos em [Integrações externas](INTEGRACOES.md); a configuração do CRM está em
[Nectar](NECTAR.md). Para o fluxo nas telas, consulte o [tutorial](TUTORIAL.md).

## Verificação

`npm run check` valida o esquema, compila frontend e regras e executa testes.
Sem `TEST_DATABASE_URL`, os testes de banco são pulados. Um teste HTTP mais amplo está em
`backend/test/commercial.integration.test.js`; para executá-lo, use um
PostgreSQL de teste com base chamada exatamente `comercialapp_test`, aplique as
migrações e defina `TEST_DATABASE_URL`. O teste apaga **somente** as tabelas
comerciais e de usuários dessa base de teste.
