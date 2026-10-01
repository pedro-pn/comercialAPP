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
O contêiner inclui LibreOffice e `python3-uno` para atualizar o sumário e suas
páginas antes de emitir Word e PDF. Fora do Docker, instale esses dois pacotes;
`PYTHON_BIN` pode indicar o Python que possui o módulo `uno`.
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

## Produção com proxy HTTPS

A implantação de produção usa um daemon Docker rootless dedicado e um proxy
HTTPS separado. API e PostgreSQL ficam na rede privada do Comercial. O Nginx
publica HTTP em um endereço do host acessível ao proxy; o limite de upload de
22 MB já está no Nginx interno.

Os dados do ambiente não devem ser copiados para este guia. Ajuste a origem
HTTPS (`APP_ORIGIN`) e o vínculo de porta do serviço `web` em
[docker-compose.prod.yml](../docker-compose.prod.yml), além do
[exemplo de Caddy](../deploy/proxy/comercial.Caddyfile.example), para a
infraestrutura escolhida. Esses campos estão definidos diretamente nos arquivos;
alterar somente o `.env` não substitui seus valores. Guarde a configuração
preenchida do ambiente em local restrito.

1. Prepare uma conta de implantação com Docker rootless e `linger` habilitado
   para o daemon iniciar no boot. Entre como essa conta e confirme o daemon:

   ```bash
   export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
   docker info | grep -i rootless
   docker compose version
   ```

   Verifique o endereço do host alcançável pelo proxy e a disponibilidade da
   porta configurada. Com um proxy em outro daemon, uma rede Docker privada
   do Comercial não é compartilhada automaticamente. Restrinja a publicação
   HTTP ao endereço usado pelo proxy e não a libere no firewall público.
2. Configure o DNS do domínio escolhido e o proxy TLS, com acesso às portas
   públicas 80/443. Nos exemplos, use `comercial.example.com`; substitua pelo
   domínio real apenas na configuração do ambiente. Se houver registro AAAA,
   confira também o acesso IPv6.
3. No checkout da versão a implantar, copie `.env.example` para `.env`, gere
   `COMERCIAL_DB_PASSWORD` com `openssl rand -hex 24` e proteja o arquivo com
   permissão `600`. Para operar sem integrações, deixe `NECTAR_MODE=off`,
   `SHAREPOINT_MODE=off`, `GOOGLE_MAPS_MODE=off` e
   `FILTROAPP_API_URL`/`FILTROAPP_API_TOKEN` vazios.
4. Valide e suba a stack como a conta rootless:

   ```bash
   docker compose -f docker-compose.prod.yml config -q
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml ps
   ```

   A API aplica `prisma migrate deploy` ao iniciar. Os volumes PostgreSQL e
   de documentos pertencem ao projeto Compose `comercialapp` desse daemon.
   Configure `COMERCIAL_INTERNAL_ORIGIN` na sessão do operador com o endereço
   HTTP interno escolhido e confira a API:

   ```bash
   curl -fsS "$COMERCIAL_INTERNAL_ORIGIN/api/health"
   ```

5. O operador do proxy deve adaptar o exemplo de Caddy ao domínio e ao destino
   HTTP configurados, validar e recarregar o proxy no daemon que o executa.
   Configure `PROXY_CONTAINER` com o nome do contêiner e
   `COMERCIAL_PUBLIC_ORIGIN` com a origem HTTPS somente na sessão do operador:

   ```bash
   docker exec "$PROXY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec "$PROXY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   curl -fsS "$COMERCIAL_PUBLIC_ORIGIN/api/health"
   ```

   O Caddy emite e renova o certificado quando DNS e acesso estiverem corretos.
   Em caso de 502, verifique a conexão do proxy ao destino HTTP e o estado de
   `web` e `api`.
6. Crie o primeiro administrador com senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.prod.yml exec -T api npm run db:bootstrap-admin --workspace @comercialapp/backend -- admin "Administrador Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

   Se já houver um gestor criado e ainda não existir administrador, promova
   essa conta com `docker compose -f docker-compose.prod.yml exec -T api npm run db:promote-admin --workspace @comercialapp/backend -- NOME_USUARIO`.
   Antes de criar propostas reais, configure o número inicial após conferir
   os códigos do CRM e do legado. Valide login, permissões, fotos, anexos e
   geração/download de DOCX/PDF pela origem HTTPS.
7. Configure [backup](BACKUP.md) recorrente do banco e do volume de arquivos
   no mesmo daemon rootless. A conta precisa de escrita em `BACKUP_ROOT`.
   Mantenha retenção fora da VPS e faça um teste de [restauração](RESTORE.md).
   Monitore contêineres, espaço dos volumes e certificados.

O operador do proxy e a conta de implantação podem ter acessos separados.
Habilite o [login Microsoft](MICROSOFT_LOGIN.md) e as
[integrações externas](INTEGRACOES.md) conforme a configuração do ambiente.
Senhas, URLs reais, nomes de contas e detalhes da infraestrutura devem permanecer
fora dos documentos, conforme a
[política do projeto](../README.md#informações-sensíveis-na-documentação).
