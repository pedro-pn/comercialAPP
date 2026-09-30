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
4. Crie o primeiro gestor, digitando uma senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.local.yml exec -T api npm run db:bootstrap-manager --workspace @comercialapp/backend -- gestor "Gestor Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

5. Para parar: `docker compose -f docker-compose.local.yml down`.
   Os volumes PostgreSQL e `comercial_files` permanecem. Use `down -v` apenas
   para descartar um ambiente de teste identificado; esse comando apaga os
   dados e os arquivos da stack Comercial.

A API executa `prisma migrate deploy` ao iniciar, como ocorre no FiltroAPP.
O Compose espera o banco ficar saudável antes de iniciar a API e espera a API
antes de iniciar o Nginx do Comercial.
O arquivo `docker-compose.local.yml` é completo e pode ser usado sozinho. Em
produção, `docker-compose.prod.yml` complementa `docker-compose.yml`.
Para preparar o Nectar, preencha as variáveis `NECTAR_*` no `.env` da raiz,
conforme [o guia do CRM](NECTAR.md), e recrie a API com o Compose. O valor
inicial `NECTAR_MODE=off` não faz chamadas externas.

## Produção na VPS compartilhada

O checkout atual da infraestrutura usa o `infra-proxy-caddy` para publicar
80/443 e emitir os certificados TLS. O arquivo `docker-compose.prod.yml` liga
**somente o Nginx do Comercial** à rede Docker externa `proxy-net`, compartilhada
com esse Caddy. A API e o banco permanecem na rede privada do Comercial. O
proxy alcança `comercialapp-web:80`; nenhum serviço do Comercial publica porta
no host. Este desenho exige que o Compose do Comercial use o mesmo daemon Docker
que o Caddy. A integração de dados com o FiltroAPP não é necessária.

1. Publique o registro DNS de `comercial.filtrovali.com.br` apontando para a VPS.
   Confirme que o Caddy está ativo, a rede `proxy-net` existe e 80/443 chegam ao
   Caddy. Se usar um registro AAAA, o IPv6 também precisa alcançar a VPS.
2. No checkout da versão que será implantada, copie `.env.example` para `.env`,
   gere `COMERCIAL_DB_PASSWORD` com `openssl rand -hex 24` e guarde o arquivo
   fora do Git, com permissão `600`. Para operar sem integrações externas, deixe
   `NECTAR_MODE=off`, `SHAREPOINT_MODE=off`, `GOOGLE_MAPS_MODE=off` e
   `FILTROAPP_API_URL`/`FILTROAPP_API_TOKEN` vazios. O domínio de produção está
   fixado em `APP_ORIGIN` no `docker-compose.yml`.
3. Confira e suba a stack do Comercial:

   ```bash
   docker network inspect proxy-net >/dev/null
   docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   ```

   A API aplica `prisma migrate deploy` ao iniciar. O volume PostgreSQL e o
   volume dos documentos pertencem ao projeto Compose `comercialapp`.
4. Acrescente o bloco de `deploy/proxy/comercial.Caddyfile.example` ao
   `deploy/infra-proxy/Caddyfile` da infraestrutura na VPS. Valide e recarregue
   o Caddy sem reiniciar os demais aplicativos:

   ```bash
   docker exec infra-proxy-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec infra-proxy-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   curl -fsS https://comercial.filtrovali.com.br/api/health
   ```

   O Caddy emite e renova o certificado automaticamente depois que o DNS e as
   portas estiverem corretos. O limite de upload de 22 MB está no Nginx interno;
   não existe limite de 1 MB para downloads nesse caminho.
5. Crie o primeiro gestor com senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api npm run db:bootstrap-manager --workspace @comercialapp/backend -- gestor "Gestor Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

   Antes de criar propostas reais, o gestor deve configurar o número inicial
   após conferir o último código usado no CRM e no legado; essa operação só
   pode ser feita uma vez. Valide login, permissões, fotos, anexos de mais de
   1 MB, geração e download de DOCX/PDF pelo domínio HTTPS.
6. Configure [backup e restauração](BACKUP.md) recorrentes do banco e de
   `comercialapp_comercial_files`, retenção fora da VPS e um teste de
   restauração. Monitore o estado dos
   contêineres, espaço dos volumes e expiração do certificado.

O usuário de implantação precisa de acesso ao daemon Docker usado pelo Caddy;
esse acesso também permite administrar outros contêineres da VPS. Defina quem
terá esse privilégio antes de concedê-lo. Esta configuração não foi aplicada
à VPS por este repositório.
