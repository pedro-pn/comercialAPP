# Login institucional Microsoft

O login Microsoft usa um registro de aplicativo **Web, tenant único**, separado
da integração SharePoint. O retorno em produção é
`https://comercial.filtrovali.com.br/api/auth/microsoft/callback`.
O código solicita `openid` e `profile`; a biblioteca MSAL inclui
`offline_access` automaticamente. Nenhum escopo de leitura de e-mails
é necessário.

## Ativação na VPS

1. No Entra, confirme o registro Web e a URI de retorno. Em **Aplicativos
   empresariais**, configure **Atribuição necessária? = Sim**, atribua somente
   os usuários autorizados e conceda consentimento administrativo às permissões
   configuradas. Essa restrição é essencial porque o primeiro login agora cria
   uma conta automaticamente no ComercialAPP.
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
5. Vincule cada conta local existente cujo histórico precisa ser preservado pelo **Object ID** obtido em **Entra ID →
   Usuários → usuário → Visão geral**. Para promover uma conta vinculada a
   administrador, use:

   ```sh
   docker compose -f docker-compose.prod.yml exec -T api \
     npm run db:link-microsoft -- NOME_USUARIO OBJECT_ID --admin
   ```

   O script recusa vincular uma identidade a duas contas ou trocar uma
   identidade já associada. Para os demais usuários, omita `--admin`;
   seus papéis continuam sendo definidos na página **Acessos**.
   Não vincule contas apenas pela coincidência do e-mail.
6. Altere `ENTRA_LOGIN_ENABLED=on` e recrie a API e o web:

   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Verifique `https://comercial.filtrovali.com.br/api/auth/providers`
   (deve retornar `{"microsoft":true}`),
   entre pelo botão **Entrar com conta Microsoft** e confira o papel na UI.
   O login local continua disponível durante a transição.

Crie a conta inicial de administrador antes de habilitar o login Microsoft.
No primeiro login de uma pessoa atribuída ao aplicativo no Entra que ainda
não tem conta vinculada, o ComercialAPP cria uma conta ativa **Vendedor** sem
senha local. O token Microsoft precisa trazer um e-mail válido (claim `email`
ou `preferred_username`); o e-mail aparece em **Acessos** e pode ser atualizado
em logins posteriores. A identidade da conta é o par `tid` + `oid`, nunca o
e-mail, que pode mudar. Administradores e gestores podem alterar o papel ou
desativar a conta em **Acessos**; só administradores podem atribuir o papel
Administrador. Uma conta local preexistente não é vinculada automaticamente:
use o script acima antes do primeiro login Microsoft para manter seu histórico.

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
