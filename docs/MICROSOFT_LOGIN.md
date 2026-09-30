# Login institucional Microsoft

O login Microsoft usa um registro de aplicativo **Web, tenant único**, separado
da integração SharePoint. O retorno em produção é
`https://comercial.filtrovali.com.br/api/auth/microsoft/callback`.
O código solicita `openid` e `profile`; a biblioteca MSAL inclui
`offline_access` automaticamente. Nenhum escopo de leitura de e-mails
é necessário.
O botão de login usa o [SVG claro oficial da Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps)
sem alterar o logotipo ou suas proporções.

## Ativação na VPS

1. No Entra, confirme o registro Web, a URI de retorno e a atribuição dos
   usuários autorizados em **Aplicativos empresariais**. Se a atribuição for
   obrigatória, conceda consentimento administrativo às permissões configuradas.
2. Gere um certificado fora do repositório. Na VPS, como usuário `comercial`,
   a partir de `~/apps/comercialAPP`:

   ```sh
   umask 077
   mkdir -p ../comercialapp-entra-secrets
   chmod 700 ../comercialapp-entra-secrets
   openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 365 \
     -keyout ../comercialapp-entra-secrets/entra-private.pem \
     -out ../comercialapp-entra-secrets/entra-public.crt \
     -subj '/CN=ComercialAPP Entra Login'
   chmod 600 ../comercialapp-entra-secrets/entra-private.pem
   openssl x509 -in ../comercialapp-entra-secrets/entra-public.crt \
     -noout -fingerprint -sha256
   ```

   Envie **somente** `entra-public.crt` para **Registros de aplicativo →
   Certificados e segredos → Certificados**. Guarde a chave privada na VPS.
   Copie a impressão digital SHA-256 para o `.env`, sem os dois-pontos.
   O diretório irmão `../comercialapp-entra-secrets` fica fora do Git e é
   montado como somente leitura no contêiner da API.
3. Antes de atualizar a aplicação, execute um backup com
   `deploy/backup-prod.sh` usando o diretório de backup já configurado
   (consulte [BACKUP.md](BACKUP.md)). No `.env` da VPS, configure
   `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`,
   `ENTRA_SECRETS_DIR=../comercialapp-entra-secrets`,
   `ENTRA_PRIVATE_KEY_PATH=/run/secrets/comercial/entra-private.pem` e
   `ENTRA_CERT_SHA256_THUMBPRINT`. Deixe `ENTRA_CLIENT_SECRET` vazio e
   mantenha `ENTRA_LOGIN_ENABLED=off`
   durante a primeira implantação. As variáveis `MICROSOFT_*` continuam
   pertencendo ao SharePoint.
4. Depois que a PR for mesclada à `main`, atualize e implante a versão com
   a migração:

   ```sh
   git pull --ff-only origin main
   docker compose -f docker-compose.prod.yml config -q
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml ps
   curl -fsS https://comercial.filtrovali.com.br/api/health
   ```

   A migração acrescenta os identificadores Microsoft à tabela de usuários,
   sem alterar os IDs e históricos existentes.
5. Vincule cada conta existente pelo **Object ID** obtido em **Entra ID →
   Usuários → usuário → Visão geral**. Para promover uma conta vinculada a
   administrador, use:

   ```sh
   docker compose -f docker-compose.prod.yml exec -T api \
     npm run db:link-microsoft -- NOME_USUARIO OBJECT_ID --admin
   ```

   O script recusa vincular uma identidade a duas contas ou trocar uma
   identidade já associada. Para os demais usuários, omita `--admin`;
   seus papéis continuam sendo definidos na página **Acessos**.
6. Altere `ENTRA_LOGIN_ENABLED=on` e recrie a API e o web:

   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Verifique `https://comercial.filtrovali.com.br/api/auth/providers`
   (deve retornar `{"microsoft":true}`),
   entre pelo botão **Entrar com conta Microsoft** e confira o papel na UI.
   O login local continua disponível durante a transição.

Se ainda não houver certificado, `ENTRA_CLIENT_SECRET` pode ser usado
temporariamente para teste. Configure **um** método de credencial por vez.
Nunca coloque o segredo ou a chave privada no repositório ou em mensagens.

Sessões criadas pelo login Microsoft duram 24 horas. Desativar o usuário no
ComercialAPP invalida imediatamente a sessão na próxima requisição. Uma
remoção de atribuição apenas no Entra impede novos logins, mas a sessão local
já emitida pode durar até 24 horas; retire também o acesso em **Acessos** para
bloqueio imediato.

Em desenvolvimento, o retorno local exige outra URI Web cadastrada no Entra:
`http://localhost:8086/api/auth/microsoft/callback` com o Compose local, ou
`http://localhost:5174/api/auth/microsoft/callback` usando o proxy do Vite.
Use `APP_ORIGIN` correspondente.

## Permissões de usuários novos

Atribuir uma pessoa ao aplicativo empresarial no Entra não cria sua conta no
ComercialAPP. Sem uma conta local vinculada ao `tid` e `oid`, o login é
recusado e nenhum papel é concedido. Crie a conta na página **Acessos** com
o papel desejado e vincule seu Object ID com `db:link-microsoft` sem
`--admin`. O papel da conta local define as permissões no aplicativo.
