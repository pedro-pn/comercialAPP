# Execução em Docker

O Comercial segue a base do FiltroAPP: frontend React/Vite compilado para Nginx,
API Node/Express e PostgreSQL 16. Ele usa um projeto Compose próprio chamado
`comercialapp`, com volume e rede privada próprios. O banco não publica porta no
host. Nenhum contêiner consulta o banco do FiltroAPP.

## Teste local

1. Copie `.env.example` para `.env` na raiz e troque a senha por uma sequência
   aleatória **segura em URL**. `openssl rand -hex 24` gera uma opção adequada.
2. Execute:

   ```bash
   docker compose -f docker-compose.local.yml up -d --build
   ```

3. Abra `http://localhost:8086`. A API responde em
   `http://localhost:8086/api/health`.
   Nesse modo, o frontend é servido pelo Nginx do contêiner. Para desenvolver
   com atualização automática como no FiltroAPP, execute `npm install`,
   `npm run build --workspace @comercialapp/rules` e `npm run dev:web` em outro
   terminal. Abra `http://localhost:5174`. O Vite encaminha `/api` para a API
   publicada pelo Compose em `127.0.0.1:4300`; as duas portas usam o mesmo
   banco local. A API aceita somente as origens locais 8086 e 5174 nesse modo.
4. Crie o primeiro administrador, digitando uma senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.local.yml exec -T api npm run db:bootstrap-admin --workspace @comercialapp/backend -- admin "Administrador Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

5. Para parar: `docker compose -f docker-compose.local.yml down`.
   Os volumes PostgreSQL e `comercial_files` permanecem. Use `down -v` apenas
   para descartar um ambiente de teste identificado; esse comando apaga os
   dados e os arquivos da stack Comercial.

A API executa `prisma migrate deploy` ao iniciar, como ocorre no FiltroAPP.
O Compose espera o banco ficar saudável antes de iniciar a API e espera a API
antes de iniciar o Nginx do Comercial.
Os arquivos `docker-compose.local.yml` e `docker-compose.prod.yml` são completos;
cada um pode ser usado sozinho com um único `-f`.
O `docker-compose.staging.yml` também é completo: use `--env-file .env.staging`
e siga o [guia de staging na VPS](STAGING.md) para publicar HTTP em 8087 com
login local e recursos separados da produção.
Para preparar o Nectar, preencha as variáveis `NECTAR_*` no `.env` da raiz,
conforme [o guia do CRM](NECTAR.md), e recrie a API com o Compose. O valor
inicial `NECTAR_MODE=off` não faz chamadas externas.

## Produção na VPS compartilhada

O `infra-proxy-caddy` da VPS publica 80/443 e emite os certificados TLS. O
ComercialAPP roda sob um usuário e **Docker rootless próprios**, como o
filtroboard. Esse daemon não participa da `proxy-net` do Caddy. O Nginx do
Comercial publica HTTP somente em `172.17.0.1:8083`, gateway da bridge do
Docker root; o Caddy alcança essa porta por `host.docker.internal:8083`.
API e PostgreSQL ficam apenas na rede privada do Comercial, sem portas no host.
O limite de upload de 22 MB já está no Nginx interno.

1. Prepare o usuário de implantação com Docker rootless e `linger` habilitado
   para o daemon iniciar no boot. Entre como esse usuário, **sem `sudo docker`**,
   e confirme que está falando com o daemon correto:

   ```bash
   export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
   docker info | grep -i rootless
   docker compose version
   ```

   Na VPS, confirme também que `docker0` possui o endereço `172.17.0.1` e que
   a porta 8083 está livre (`ip -4 addr show docker0` e
   `ss -ltn '( sport = :8083 )'`). Se o gateway for outro, ajuste o endereço no
   `docker-compose.prod.yml` e no roteamento do Caddy. Não publique o Nginx em
   `0.0.0.0`: isso permitiria acesso HTTP direto, fora do Caddy.
2. Publique o registro DNS de `comercial.filtrovali.com.br` apontando para a
   VPS. Confirme que o Caddy está ativo e que 80/443 chegam à VPS. Se houver
   registro AAAA, o IPv6 também precisa chegar à VPS.
3. No checkout da versão a implantar, copie `.env.example` para `.env`, gere
   `COMERCIAL_DB_PASSWORD` com `openssl rand -hex 24` e proteja o arquivo com
   permissão `600`. Para operar sem integrações externas, deixe
   `NECTAR_MODE=off`, `SHAREPOINT_MODE=off`, `GOOGLE_MAPS_MODE=off` e
   `FILTROAPP_API_URL`/`FILTROAPP_API_TOKEN` vazios. O domínio de produção está
   fixado em `APP_ORIGIN` no `docker-compose.prod.yml`. Não grave credenciais no Git.
4. Confira e suba a stack como o usuário rootless:

   ```bash
   docker compose -f docker-compose.prod.yml config -q
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml ps
   curl -fsS http://172.17.0.1:8083/api/health
   ```

   A API aplica `prisma migrate deploy` ao iniciar. O volume PostgreSQL e o
   volume dos documentos pertencem ao projeto Compose `comercialapp` **desse
   usuário rootless**. A porta 8083 é interna à VPS e não deve ser liberada no
   firewall público.
5. O operador do proxy deve acrescentar o bloco de
   `deploy/proxy/comercial.Caddyfile.example` ao
   `deploy/infra-proxy/Caddyfile` do FiltroAPP na VPS e validar/recarregar o
   Caddy **no daemon Docker root**, separado do daemon do Comercial. Em uma
   sessão do operador com acesso a esse daemon:

   ```bash
   docker exec infra-proxy-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec infra-proxy-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   curl -fsS https://comercial.filtrovali.com.br/api/health
   ```

   O Caddy emite e renova o certificado depois que DNS e portas estiverem
   corretos. Se o domínio responder 502, verifique primeiro o acesso do Caddy a
   `host.docker.internal:8083` e o estado do contêiner `web`.
6. Crie o primeiro administrador com senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.prod.yml exec -T api npm run db:bootstrap-admin --workspace @comercialapp/backend -- admin "Administrador Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

   Se já houver um gestor criado e ainda não existir administrador, promova
   essa conta com `docker compose -f docker-compose.prod.yml exec -T api npm run db:promote-admin --workspace @comercialapp/backend -- nome-do-usuario`.
   Antes de criar propostas reais, a gestão deve configurar o número inicial
   após conferir o último código usado no CRM e no legado; essa operação só
   pode ser feita uma vez. Valide login, permissões, fotos, anexos de mais de
   1 MB, geração e download de DOCX/PDF pelo domínio HTTPS.
7. Configure [backup](BACKUP.md) recorrente do banco e de
   `comercialapp_comercial_files` **no daemon rootless do Comercial**. O usuário
   precisa de escrita em `BACKUP_ROOT`; mantenha retenção fora da VPS e faça um
   teste conforme o [guia de restauração](RESTORE.md). Monitore contêineres,
   espaço dos volumes rootless e expiração do certificado.

O usuário do Comercial não precisa de acesso ao daemon Docker root do Caddy.
O operador do proxy faz a etapa 5 separadamente. Esta configuração ainda não
foi aplicada à VPS por este repositório.
