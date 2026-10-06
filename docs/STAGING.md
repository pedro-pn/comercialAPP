# Staging do ComercialAPP na VPS

O staging usa o Compose completo `docker-compose.staging.yml`, com PostgreSQL,
API Node e frontend compilado servido por Nginx. O login é local, com usuário e
senha; o login Microsoft fica sempre desativado e não exige registro Entra,
certificado ou segredo. A API aplica as migrações automaticamente ao iniciar.

## Como convive com o staging do FiltroAPP

Se outro aplicativo já publica a porta **80 do host**, o ComercialAPP
publica **8087 do host → 80 do seu contêiner Nginx**:

| Aplicativo | Endereço no navegador | Porta na VPS |
| --- | --- | --- |
| Outro aplicativo de staging (exemplo) | `http://IP_DA_VPS` | 80 |
| ComercialAPP staging | `http://IP_DA_VPS:8087` | 8087 |

Cada contêiner pode ouvir na porta 80 da sua própria rede. O conflito só acontece
se dois serviços tentarem publicar a mesma porta no mesmo IP **do host**.
O Nginx do FiltroAPP pode continuar com a configuração atual. Não precisa mudar
DNS nem usar subpasta: o Comercial abre na raiz `/` da porta 8087.
Esse mapeamento segue o [modelo de publicação de portas do Docker](https://docs.docker.com/engine/network/port-publishing/).

O Compose usa o projeto `comercialapp-staging`, a rede
`comercialapp-staging_private` e os volumes
`comercialapp-staging_comercial_pgdata` e
`comercialapp-staging_comercial_files`. O banco se chama `comercialapp_staging`.
API e banco não publicam portas no host. A sessão usa o cookie
`comercial_staging_session`, separado do cookie do Comercial em produção.
Não use `-p comercialapp` nem combine este arquivo com o Compose de produção.

## 1. Preparar o checkout e o ambiente

Na VPS, use a conta de implantação e o daemon Docker escolhidos para staging.
Não é necessário configurar Docker rootless para este Compose. Requer Git,
Docker Engine e o plugin `docker compose` já instalados.

Para um checkout novo:

```bash
mkdir -p "$HOME/apps"
git clone URL_DO_REPOSITORIO "$HOME/apps/comercialAPP-staging"
cd "$HOME/apps/comercialAPP-staging"
```

Substitua `URL_DO_REPOSITORIO` pela URL autorizada, sem incluir credenciais no
comando ou na documentação. Faça checkout do
branch ou commit que contém estes arquivos antes de continuar. Se já existe
um checkout exclusivo de staging, entre nele em vez de clonar novamente.

Confirme o daemon e a disponibilidade da porta:

```bash
docker context show
docker compose version
ss -ltn '( sport = :8087 )'
```

Se a porta estiver ocupada, escolha outra em `STAGING_HTTP_PORT` e atualize também
`STAGING_APP_ORIGIN`. Use o daemon escolhido para staging; não reutilize a
sessão com `DOCKER_HOST` de produção do Comercial.

Crie o arquivo de configuração:

```bash
umask 077
cp .env.staging.example .env.staging
chmod 600 .env.staging
openssl rand -hex 24
nano .env.staging
```

Preencha pelo menos estes valores:

```dotenv
STAGING_DB_PASSWORD=COLE_A_SENHA_GERADA
STAGING_APP_ORIGIN=http://IP_DA_VPS:8087
STAGING_HTTP_PORT=8087
STAGING_BIND_IP=0.0.0.0
```

Substitua `IP_DA_VPS` pelo IP público ou DNS usado no navegador. A origem precisa
ser **exata**, incluindo a porta, sem caminho nem barra final: acessar por outro
IP/DNS fará as operações de escrita retornarem 403. `DATABASE_URL`, `APP_ENV`
e `NODE_ENV` são definidos pelo Compose. A senha do banco só é preenchida uma vez.
Use credenciais de teste neste ambiente HTTP.

As conexões de saída com Nectar, FiltroAPP, SharePoint e Google Maps ficam
desativadas diretamente no Compose. Não configure credenciais desses serviços.
Propostas, levantamentos, fotos, anexos e geração de DOCX/PDF funcionam
localmente. Recursos que dependem dos provedores externos ficam indisponíveis.
O recebimento de liberações e eventos do **CRM Prisma** está disponível em
`POST /api/integrations/crm/releases` e `POST /api/integrations/crm/events`,
com tokens de permissões separadas emitidos na Central de API.
Ele funciona com Nectar desligado; veja o procedimento abaixo.
O login Microsoft também continua desativado, mesmo que
`ENTRA_LOGIN_ENABLED=on` seja definido por engano fora do Compose.

## 2. Subir os serviços

Execute sempre com `--env-file .env.staging`, inclusive nos comandos de logs,
execução e parada. Isso seleciona o arquivo próprio de staging em vez do `.env`
padrão, conforme a [documentação de variáveis do Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build --wait
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
curl -fsS http://127.0.0.1:8087/api/health
curl -fsS http://127.0.0.1:8087/api/auth/providers
```

O health deve retornar `{"status":"ok","service":"comercialapp"}`; os
providers devem retornar `{"microsoft":false}`. A primeira compilação pode
demorar por causa das dependências e do LibreOffice para geração de PDF.

Para acesso externo, permita TCP **8087** no firewall da VPS/provedor. Se o
staging do FiltroAPP usa IPs autorizados, aplique a mesma política à porta 8087.
Abra `http://IP_DA_VPS:8087` após criar o administrador abaixo.

O banco começa vazio, com as tabelas criadas pelas migrações. Cadastros e arquivos
de produção não são copiados por este procedimento.

## 3. Criar o administrador local

Execute uma única vez no banco novo, com senha de pelo menos 12 caracteres:

```bash
read -rsp 'Senha do administrador de staging: ' COMERCIAL_STAGING_ADMIN_PASSWORD
printf '%s\n' "$COMERCIAL_STAGING_ADMIN_PASSWORD" | docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T api npm run db:bootstrap-admin --workspace @comercialapp/backend -- admin "Administrador Staging"
unset COMERCIAL_STAGING_ADMIN_PASSWORD
```

Entre no navegador com `admin` e a senha escolhida. Na tela **Acessos**, crie
as contas de teste. Configure a numeração inicial antes de criar propostas.
O bootstrap recusa executar novamente quando já há usuários no banco.

## 4. Liberar a Central de API e receber eventos do Prisma

A **Central de API** (`/api-central`) aparece no menu somente para contas com
perfil **Administrador** (`ADMIN`). Uma conta com perfil **Gestor** (`MANAGER`)
pode administrar acessos comuns, mas não emitir tokens nem acessar essa tela.
Não há uma variável de ambiente para habilitar o menu ou o endpoint do Prisma.

Se `/api-central` abre uma tela em branco em HTTP com o erro
`crypto.randomUUID is not a function` no console do navegador, atualize o
frontend para a versão com a geração de UUID compatível com HTTP. Os exemplos
de eventos usam `crypto.getRandomValues`, disponível nesse ambiente; o token
continua sendo gerado no backend.

Se a Central não aparece, confira o perfil da conta em **Acessos e numeração**.
Se já existe administrador ativo, entre com essa conta ou peça a ele para
alterar o perfil da conta desejada para **Administrador**. Depois, entre
novamente: a mudança de perfil encerra as sessões anteriores.

Em um staging antigo que só possui gestores e **nenhum administrador ativo**,
use o comando já disponível para promover um gestor ativo existente:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T api npm run db:promote-admin --workspace @comercialapp/backend -- NOME_USUARIO
```

Substitua `NOME_USUARIO` pelo usuário do gestor e entre novamente. O comando
recusa executar se já houver administrador ativo; não use o bootstrap em uma
base que já possui usuários.

Se a conta já é administradora e o cartão ainda não aparece, atualize o checkout
para a versão que contém a Central e recompile **API e frontend**:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build --wait api web
```

Recarregue o navegador e abra `/api-central`. Se o acesso direto volta ao início,
confira novamente o perfil da sessão. Se a página abre, mas as chamadas a
`/api/admin/api-credentials` retornam 404, a API implantada também precisa ser
atualizada.

Na Central, crie um token exclusivo de homologação com a permissão **Status das revisões** e configure no Prisma:

| Campo | Valor |
| --- | --- |
| Método | `POST` |
| URL | `http://IP_DA_VPS:8087/api/integrations/crm/events`, ou a origem HTTPS pública de staging seguida desse caminho. |
| Autorização | `Authorization: Bearer <token emitido no staging>` |
| Tipo do corpo | `Content-Type: application/json` |

O token é criado no banco de staging e o segredo aparece uma única vez. Não use
um token de produção nem `CRM_EVENT_TOKEN`: essa variável é um fallback do
webhook Nectar e não autentica eventos do Prisma. A chamada externa não exige
cookie de sessão, `Origin` ou `X-Comercial-Request`.

O Nginx já encaminha `/api/` à API interna. Libere o acesso do emissor à porta
pública de staging ou ao proxy HTTPS; não é necessário publicar a porta 4300.
Para conferir o roteamento sem token e sem alterar propostas:

```bash
curl -i -X POST http://127.0.0.1:8087/api/integrations/crm/events \
  -H 'Content-Type: application/json' --data '{}'
```

A resposta esperada é **401**, indicando que a rota está disponível e exige
autenticação. **404** indica caminho/versão incorretos; falha de conexão ou
**502** exige conferir firewall, proxy e saúde dos serviços. Use a origem pública
no teste feito a partir da rede do Prisma.

Crie e finalize uma proposta de teste no próprio staging. Use **Testar contrato**
na Central para validar código, revisão e JSON sem registrar um evento. A chamada
autenticada retorna **202** para um evento novo e **200** no reenvio do mesmo
evento. O [contrato de integração](INTEGRACOES.md) descreve os campos e conflitos.

Neste Compose, a entrega posterior ao FiltroAPP permanece desligada. Uma
aprovação com `projectId` pode ser aceita com **202** e
`delivery.status=PENDENTE`; isso confirma o recebimento pelo ComercialAPP, mas
não uma entrega ao FiltroAPP.

Para iniciar propostas com negócios do Prisma e devolver os dois PDFs, siga o
[contrato v2 e o roteiro de homologação](PRISMA_V2.md#6-homologação-e-entrada-em-produção).
Crie outro token, com **Liberações de negócios**, para o endpoint de liberações.
O envio de PDFs é opcional: configure `STAGING_PRISMA_API_URL` (receptor sandbox)
e `STAGING_PRISMA_API_TOKEN` em `.env.staging`, depois recrie a API. Essas variáveis
ficam vazias por padrão e não habilitam as outras conexões de saída.

## Atualizar, acompanhar e parar

No checkout exclusivo de staging, depois de publicar o código no branch usado:

```bash
git pull --ff-only
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build --wait
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=100 api web
```

Para parar sem remover os dados:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

Os volumes do banco e dos documentos permanecem. `down -v` remove os volumes e
apaga os dados de staging. Alterar `STAGING_DB_PASSWORD` no arquivo não altera
a senha de um PostgreSQL já inicializado; nesse caso, atualize a senha no banco
e no env em conjunto.

## Se quiser os dois apps na porta 80, sem porta na URL

Será necessário um **único proxy na porta 80**, encaminhando por hostname,
por exemplo `filtro-staging.example.com` e `comercial-staging.example.com`.
Se a porta 80 pertence hoje diretamente ao contêiner do FiltroAPP, esse serviço
precisa assumir o roteamento dos dois hostnames ou liberar a porta para um proxy
compartilhado. Criar outro Nginx publicando `80:80` no mesmo IP não funciona.

Com proxy no host, configure `STAGING_BIND_IP=127.0.0.1` e encaminhe o hostname do
Comercial para `http://127.0.0.1:8087`. Com proxy em Docker, use uma rede compartilhada
ou um endereço do host acessível ao contêiner; `127.0.0.1` dentro do proxy aponta
para o próprio contêiner, não para a VPS. Atualize `STAGING_APP_ORIGIN` para a
origem pública final. Se ela usar HTTPS, a API marca o cookie de staging como
`Secure` automaticamente.

No cenário de portas distintas descrito neste guia, o acesso direto por **8087**
não exige alteração no proxy do outro aplicativo. Os hostnames, IPs e caminhos
reais do ambiente devem ficar fora da documentação versionada.
