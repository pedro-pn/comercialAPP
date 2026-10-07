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
- `POST /api/comercial/levantamentos/iniciar`, com `title` e `payload`, reserva
  o próximo número e cria o levantamento como rascunho na mesma transação.
  Uma falha desfaz as duas operações.
- `GET/POST /api/comercial/propostas` e `GET/PUT` por ID.
- `POST .../:id/arquivar` e `POST .../:id/desarquivar`; não há exclusão.
- `GET /api/comercial/consultores` reúne contas ativas e consultores cadastrados.
- `POST /api/comercial/consultores` cadastra um consultor pelo nome completo;
  exclusivo de administradores e gestores.
- `PATCH /api/comercial/consultores/:id` altera o nome e `DELETE` remove o cadastro
  da seleção de novas propostas; exclusivos da gestão. A remoção preserva vínculos
  e nomes das propostas anteriores, inclusive para novas revisões.
- `GET /api/comercial/propostas/:codigo/revisao` prepara a revisão sem gravá-la.
- `POST /api/comercial/propostas/:id/reabrir`, com `expectedUpdatedAt`, reabre
  uma proposta finalizada e ativa como rascunho, mantendo ID, número, revisão,
  vínculos e arquivos. A ação **Editar proposta** está disponível no histórico
  e na tela de documentos para os perfis com permissão de edição.

Uma proposta já vinculada pode continuar sendo salva quando seu levantamento
volta a rascunho durante a edição de custos. Criar ou trocar o vínculo ainda
exige um levantamento concluído e ativo.

O servidor recalcula custo, preço e margem do levantamento a partir do payload,
sem aceitar totais calculados pelo navegador. Na proposta, o total é calculado
a partir dos itens de preço. O vendedor só alcança seus registros;
administradores e gestores alcançam todos. O perfil de consulta lê a lista de
propostas sem campos de valor e não abre o registro completo.
Edições exigem `expectedUpdatedAt` e
respondem conflito 409 quando outro usuário salvou uma versão mais recente.

Ao voltar ao menu ou sair do sistema pelas telas de proposta e custos, o aplicativo aguarda
o salvamento em andamento e grava as alterações mais recentes antes de sair.
Se a gravação falhar, o formulário permanece aberto com os valores digitados.
O rascunho local é separado por número e revisão; uma resposta de salvamento
anterior não apaga alterações mais novas guardadas no navegador.

A cópia local acompanha cada edição, sem aguardar o salvamento automático no
servidor. Recarregar imediatamente oferece a recuperação da última alteração.
Quando o primeiro salvamento atribui um número, a cópia pendente acompanha esse
número. A oferta de recuperação precisa ser resolvida antes de editar ou salvar.

Propostas e custos salvam rascunhos automaticamente após cada edição, com um
pequeno intervalo para agrupar a digitação. Não há botão de salvar rascunho.
Ao escolher **Novo orçamento**, o levantamento já fica salvo em **Custos em
andamento**, mesmo sem preencher nenhum campo. Reabri-lo mantém o mesmo número.
Desde a primeira gravação, os campos obrigatórios podem estar vazios: propostas
aceitam e-mail e CNPJ incompletos e consultor ainda não selecionado; custos aceitam
título vazio. As listas apagadas também são recuperadas vazias. O primeiro
salvamento da proposta reserva seu número, mesmo com identificação incompleta.

Ao abrir Propostas ou Custos, a entrada lista os rascunhos em andamento, ordenados
pela última edição, com a ação Continuar. Registros concluídos e arquivados não
aparecem nessa lista; os concluídos permanecem acessíveis pelo histórico.

O menu de etapas e o botão de próxima etapa aguardam a gravação antes de mudar
de aba. Uma falha mantém a etapa atual aberta e permite tentar novamente. O menu
e o botão de próxima etapa permitem continuar com campos incompletos.
Uma gravação automática que falha não é repetida para os mesmos dados; uma nova
edição permite tentar novamente, sem um ciclo permanente de salvamento.

A finalização também confere no servidor os campos obrigatórios de todas as
etapas, usando as mesmas regras da tela. Chamadas diretas à API com dados
incompletos recebem HTTP 422 e a proposta permanece como rascunho, inclusive
quando já existem documentos gerados. Salvar um rascunho parcial continua permitido.

O histórico usa o login próprio. Gestor e vendedor podem abrir e editar seus
levantamentos e rascunhos de proposta; consulta vê somente a lista de propostas
sem valores. Administradores/gestores
podem configurar o primeiro número em **Acessos e numeração**, confirmando antes
que ele não aparece no CRM ou no legado. A sequência pula números legados já
registrados no aplicativo. Uma primeira revisão legada pode ser registrada por
`POST /api/comercial/propostas/legado/revisao`, com o número e a revisão conferidos.

O fluxo com arquivos usa `POST /api/comercial/propostas/legado/lec/previa` para
analisar sem gravar, e `POST /api/comercial/propostas/legado/lec/importar` para
criar a reserva, o levantamento e a proposta em uma transação. Os corpos JSON
contêm `lec: {fileName, base64}` e `pdf: {fileName, base64}` opcional. A importação
acrescenta `proposalCode`, `revisionNumber`, `modelo` e `resolutions`, que associa
cada campo divergente a `lec` ou `pdf`. Cada arquivo aceita até 10 MB. A revisão
de destino deve ser maior que a revisão presente nos arquivos. O servidor relê
os arquivos no momento da gravação e exige uma escolha para todas as diferenças.
Ambos os registros nascem em rascunho; os custos precisam ser concluídos antes do
salvamento normal da proposta. Uma repetição com os mesmos arquivos e opções
retorna os registros existentes sem sobrescrever edições.
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
