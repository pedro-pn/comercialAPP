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
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   ```

3. Abra `http://localhost:8086`. A API responde em
   `http://localhost:8086/api/health`.
4. Crie o primeiro gestor, digitando uma senha de pelo menos 12 caracteres:

   ```bash
   read -rsp 'Senha inicial: ' COMERCIAL_INITIAL_PASSWORD
   printf '%s\n' "$COMERCIAL_INITIAL_PASSWORD" | docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T api npm run db:bootstrap-manager --workspace @comercialapp/backend -- gestor "Gestor Comercial"
   unset COMERCIAL_INITIAL_PASSWORD
   ```

5. Para parar: `docker compose -f docker-compose.yml -f docker-compose.local.yml down`.
   O volume PostgreSQL permanece. Use `down -v` apenas para descartar um ambiente
   de teste identificado; esse comando apaga os dados da stack Comercial.

A API executa `prisma migrate deploy` ao iniciar, como ocorre no FiltroAPP.
O Compose espera o banco ficar saudável antes de iniciar a API e espera a API
antes de iniciar o Nginx do Comercial.

## Produção na VPS compartilhada

O arquivo `docker-compose.prod.yml` liga **somente o Nginx do Comercial** à
rede Docker externa `filtrovali-net`, criada pelo Compose de produção do
FiltroAPP. A API e o banco permanecem na rede privada do Comercial. O serviço
fica disponível para o proxy existente pelo nome `comercialapp-web:80`, sem
publicar 80/443 nem outra porta no host.

Antes de ativar o domínio:

1. Prepare DNS e certificado TLS para `comercial.filtrovali.com.br`.
2. Inclua as regras de `deploy/proxy/comercial.conf.example` no Nginx do
   FiltroAPP **após** o certificado existir. O proxy atual é o único serviço
   que publica 80/443 na VPS.
3. Crie `.env` no checkout de produção com `COMERCIAL_DB_PASSWORD` aleatória e
   mantenha esse arquivo fora do Git. Configure backup para o volume
   `comercialapp_comercial_pgdata`.
4. Execute como o usuário de implantação do Comercial:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

5. Crie o gestor inicial pelo mesmo comando acima, trocando a lista de arquivos
   Compose pela de produção. Depois, valide `/api/health`, login e permissões
   pelo domínio HTTPS.

Dar ao usuário de implantação acesso ao daemon Docker pode dar privilégios
amplos sobre a VPS. A forma de conceder esse acesso precisa ser definida na
implantação para preservar a separação operacional entre os aplicativos.

Esta configuração ainda não foi aplicada à VPS nem ao Nginx do FiltroAPP.
