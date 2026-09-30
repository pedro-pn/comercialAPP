# comercialAPP

Aplicativo Comercial independente da Filtrovali. Esta branch main começou limpa
em 28/09/2026. O aplicativo antigo em Next/Cloudflare está preservado na branch
legacy-next-cloudflare; ele não é a base desta implementação.

O módulo Comercial do FiltroAPP é a origem funcional da extração. A biblioteca
de regras e os arquivos das telas foram copiados. O app tem banco próprio,
login local, administração de usuários, levantamentos e propostas no banco
próprio. A proposta salva pode receber fotos e anexos, gerar os modelos
comercial e técnico em DOCX/PDF e ser finalizada localmente. O envio ao Nectar
CRM foi validado no funil de testes do Nectar. O app também tem envio ao
SharePoint, cálculo de distância e contrato de aprovação/entrega ao FiltroAPP.
O receptor está integrado à `main` local do FiltroAPP. Sua implantação e a
homologação externa ainda são etapas de operação.

## Executar localmente

Requer Node.js e npm compatíveis com as dependências declaradas. Para emitir PDF
sem Docker, instale também o LibreOffice (`soffice` no `PATH`).

Para executar os três serviços em Docker, use o
[guia de Docker](docs/DOCKER.md). O frontend React/Vite é compilado em uma
imagem Nginx; a API Node e o PostgreSQL ficam em contêineres separados.
O mesmo guia mostra como usar o Vite na porta 5174 com a API do Compose para
desenvolvimento local.

1. Crie um banco PostgreSQL exclusivo e um usuário próprio para este app.
2. Execute `npm install` na raiz, copie `backend/.env.example` para
   `backend/.env` e configure `DATABASE_URL` e `APP_ORIGIN`.
3. Execute `npm run db:generate --workspace @comercialapp/backend` e
   `npm run db:migrate --workspace @comercialapp/backend`.
4. Crie o primeiro gestor com senha lida pela entrada padrão, por exemplo:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | npm run db:bootstrap-manager --workspace @comercialapp/backend -- gestor "Gestor Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

5. Em terminais separados, execute `npm run dev:api` e `npm run dev:web`.
6. Abra http://localhost:5174 e entre com o usuário do gestor. O gestor pode
   criar, desativar e alterar os papéis de outros usuários.
7. Execute `npm run check` para compilar a interface e as regras, verificar as
   telas extraídas, testar os cálculos e validar o esquema Prisma. Para executar
   também os testes de integração, configure `TEST_DATABASE_URL` com um banco
   exclusivo chamado `comercialapp_test` e aplique as migrações nele.

O [CI](.github/workflows/ci.yml) executa `npm ci`, aplica as migrações em um
PostgreSQL de teste, roda `npm run check` e valida os arquivos Compose e os
scripts de backup. Ele é executado nos PRs para `main` e nos pushes à `main`.

O backend escuta em 127.0.0.1:4300 por padrão. A sessão usa cookie HttpOnly;
em produção, `APP_ORIGIN` deve ser a origem HTTPS pública e o cookie é marcado
como Secure. As variáveis de exemplo estão em backend/.env.example e
frontend/.env.example. O primeiro gestor só pode ser criado quando a tabela de
usuários está vazia.

## Estrutura

- frontend: React e Vite, com a entrada visual do módulo Comercial, login,
  gestão de acessos, histórico, levantamentos, propostas e arquivos gerados.
- backend: Express, Prisma e PostgreSQL; `/api/health`, `/api/auth/*`,
  `/api/users` e rotas `/api/comercial/*`. O LibreOffice converte os modelos
  DOCX para PDF; `COMERCIAL_DIR` guarda fotos, anexos e documentos.
- shared/comercial: regras copiadas do módulo Comercial atual do FiltroAPP,
  com os cenários de referência do cálculo em test/goldens.
- docs/EXTRACAO.md: proveniência, decisões e próximas etapas.

## Decisões de produto

- Repositório remoto privado: `pedro-pn/comercialAPP`.
- Produção: comercial.filtrovali.com.br na mesma VPS do FiltroAPP, sob outro
  usuário do sistema e com banco próprio. O Compose é separado e só o Nginx do
  Comercial compartilha a rede do proxy do FiltroAPP.
- Primeira entrega: login próprio; o gestor do Comercial administra acessos
  e papéis. Login compartilhado fica para uma etapa futura.
- Integração: Comercial envia propostas ao CRM, que escolhe o projeto e envia
  proposta e vínculo ao FiltroAPP. A aprovação vem do CRM, com seleção manual
  quando não houver retorno.
- Numeração: o gestor configura o valor inicial uma única vez; o Comercial
  reserva os números automaticamente e registra quem fez a reserva.

Antes do uso real, confira a numeração com os sistemas existentes, implante a
branch receptora do FiltroAPP e configure os tokens de serviço. Veja
[as integrações externas](docs/INTEGRACOES.md),
[a configuração do Nectar](docs/NECTAR.md) e
[a etapa de persistência](docs/RASCUNHOS.md). O modo `off` é o padrão para
SharePoint e Maps.
