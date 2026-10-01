# Staging do ComercialAPP na VPS

O staging usa o Compose completo `docker-compose.staging.yml`, com PostgreSQL,
API Node e frontend compilado servido por Nginx. O login é local, com usuário e
senha; o login Microsoft fica sempre desativado e não exige registro Entra,
certificado ou segredo. A API aplica as migrações automaticamente ao iniciar.

## Como convive com o staging do FiltroAPP

Considerando que o FiltroAPP já publica a porta **80 do host**, o ComercialAPP
publica **8087 do host → 80 do seu contêiner Nginx**:

| Aplicativo | Endereço no navegador | Porta na VPS |
| --- | --- | --- |
| FiltroAPP staging existente | `http://IP_DA_VPS` | 80 |
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

Na VPS, entre como `root`, no mesmo daemon Docker usado pelo staging do FiltroAPP.
Não é necessário configurar Docker rootless para este staging. Requer Git,
Docker Engine e o plugin `docker compose` já instalados.

Para um checkout novo:

```bash
mkdir -p /root/apps
git clone git@github.com:pedro-pn/comercialAPP.git /root/apps/comercialAPP-staging
cd /root/apps/comercialAPP-staging
```

O repositório é privado; use a chave Git já autorizada na VPS. Faça checkout do
branch ou commit que contém estes arquivos antes de continuar. Se já existe
um checkout exclusivo de staging, entre nele em vez de clonar novamente.

Confirme o daemon e a disponibilidade da porta:

```bash
docker context show
docker compose version
ss -ltn '( sport = :8087 )'
```

Se a porta estiver ocupada, escolha outra em `STAGING_HTTP_PORT` e atualize também
`STAGING_APP_ORIGIN`. Use o daemon root do staging do FiltroAPP; não reutilize a
sessão com `DOCKER_HOST` do usuário rootless de produção do Comercial.

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

As integrações com Nectar/CRM, FiltroAPP, SharePoint e Google Maps ficam
desativadas diretamente no Compose. Não configure credenciais desses serviços.
Propostas, levantamentos, fotos, anexos e geração de DOCX/PDF funcionam
localmente. Recursos que dependem dos provedores externos ficam indisponíveis.
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
por exemplo `filtro-staging.seudominio.com` e `comercial-staging.seudominio.com`.
Se a porta 80 pertence hoje diretamente ao contêiner do FiltroAPP, esse serviço
precisa assumir o roteamento dos dois hostnames ou liberar a porta para um proxy
compartilhado. Criar outro Nginx publicando `80:80` no mesmo IP não funciona.

Com proxy no host, configure `STAGING_BIND_IP=127.0.0.1` e encaminhe o hostname do
Comercial para `http://127.0.0.1:8087`. Com proxy em Docker, use uma rede compartilhada
ou um endereço do host acessível ao contêiner; `127.0.0.1` dentro do proxy aponta
para o próprio contêiner, não para a VPS. Atualize `STAGING_APP_ORIGIN` para a
origem pública final. Se ela usar HTTPS, a API marca o cookie de staging como
`Secure` automaticamente.

Para a estrutura atual informada, o acesso direto por **8087** é suficiente e
não exige alteração no Nginx do FiltroAPP.
