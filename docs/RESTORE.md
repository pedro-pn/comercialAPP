# Restauração do ComercialAPP

`deploy/restore-prod.sh` restaura **juntos** o banco `comercialapp` e o volume
`comercialapp_comercial_files`. Execute com a **conta de implantação** e seu
Docker rootless. O script verifica os arquivos antes de alterar a
stack, para `web` e `api`, substitui o banco e o volume e volta a iniciar os dois
serviços. **A restauração causa indisponibilidade; o backup não.** Se houver
falha depois da parada, o app permanece parado para evitar servir dados de
momentos diferentes. Programe uma janela de manutenção.

Cada pasta de backup válida precisa conter:

- `postgres.sql.gz`: dump do banco;
- `comercial-files.tar.gz`: documentos, fotos e anexos;
- `SHA256SUMS`: checksums dos dois arquivos.

Não restaure uma pasta `.partial` nem misture arquivos de timestamps diferentes.
O arquivo `.env`, segredos em `ENTRA_SECRETS_DIR` e dados do Caddy compartilhado
não fazem parte desse backup. Veja [BACKUP.md](BACKUP.md) para a configuração do
Backblaze B2 e do crontab.

## Variáveis do restore

| Variável | Exemplo fictício para a VPS | Uso |
| --- | --- | --- |
| `DOCKER_HOST` | `unix:///run/user/UID/docker.sock` | Seleciona o Docker rootless do usuário de implantação. |
| `BACKUP_ROOT` | `/home/USUARIO_DEPLOY/backups/comercialapp` | O mesmo diretório usado no backup; contém `backup.lock`. |
| `BACKUP_SOURCE` | Pasta com timestamp ou `latest` | Origem dos três arquivos. Obrigatória. |
| `VERIFY_ONLY` | `true` | Verifica checksums, gzip e tar sem alterar a stack. |
| `CONFIRM_RESTORE` | `comercialapp` | Autoriza a substituição do banco e do volume. |

`PROJECT_NAME=comercialapp`, `COMPOSE_FILE=docker-compose.prod.yml` e
`FILES_VOLUME=comercialapp_comercial_files` já são os padrões. Se usar
`PROJECT_NAME` ou `COMPOSE_FILE` diferentes em um ensaio, escolha um projeto,
volumes e portas isolados da produção.

## Verificar um backup sem alterar o aplicativo

No checkout de produção, como o usuário de implantação, escolha a pasta exata.
Substitua o timestamp no comando:

```bash
cd "$HOME/apps/comercialAPP"  # ajuste para o checkout escolhido
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
export BACKUP_ROOT="$HOME/backups/comercialapp"
BACKUP_SOURCE="$BACKUP_ROOT/AAAA-MM-DD-HHMMSS" VERIFY_ONLY=true ./deploy/restore-prod.sh
```

Para verificar o backup local mais recente, use
`BACKUP_SOURCE="$BACKUP_ROOT/latest"`. O script exige os três arquivos, confere
`SHA256SUMS`, testa o dump gzip e a leitura do tar, e rejeita caminhos de arquivo
que saiam do volume. Essa verificação não testa se cada referência do banco tem
o arquivo correspondente; faça também um ensaio de restauração em ambiente
isolado.

## Restaurar o backup local

Depois da verificação, em janela de manutenção, execute no mesmo checkout:

```bash
BACKUP_SOURCE="$BACKUP_ROOT/AAAA-MM-DD-HHMMSS" \
  CONFIRM_RESTORE=comercialapp ./deploy/restore-prod.sh
```

O script usa `$BACKUP_ROOT/backup.lock` para impedir que um backup ocorra ao
mesmo tempo. Ele confirma que o volume pertence ao projeto `comercialapp`, para
`web` e `api`, mantém o PostgreSQL ativo, recria o banco, importa o dump, limpa
e extrai o volume de arquivos e então inicia `api` e `web`. A API aplica as
migrações pendentes ao iniciar. Se o script falhar após parar os serviços,
identifique e corrija o erro antes de voltar a expor o aplicativo.

## Baixar do Backblaze e restaurar

Use a CLI B2 já autorizada como o usuário de implantação segundo
[BACKUP.md](BACKUP.md).
Escolha um timestamp presente no prefixo `daily` ou `monthly` e baixe a pasta
completa para um diretório vazio. Ajuste `NOME_BUCKET` e `BACKUP_TIMESTAMP`:

```bash
cd "$HOME/apps/comercialAPP"  # ajuste para o checkout escolhido
export B2_BIN="$HOME/.local/share/comercialapp-b2/bin/b2"
export B2_ACCOUNT_INFO="$HOME/.b2_account_info"
"$B2_BIN" ls --recursive 'b2://NOME_BUCKET/comercialapp/daily/'
BACKUP_TIMESTAMP='AAAA-MM-DD-HHMMSS'
mkdir -p "$HOME/restore/comercialapp/$BACKUP_TIMESTAMP"
"$B2_BIN" sync \
  "b2://NOME_BUCKET/comercialapp/daily/$BACKUP_TIMESTAMP" \
  "$HOME/restore/comercialapp/$BACKUP_TIMESTAMP"
```

Para uma cópia mensal, troque `daily` por `monthly`. Verifique a pasta baixada
antes de confirmar o restore:

```bash
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
export BACKUP_ROOT="$HOME/backups/comercialapp"
BACKUP_SOURCE="$HOME/restore/comercialapp/$BACKUP_TIMESTAMP" \
  VERIFY_ONLY=true ./deploy/restore-prod.sh
BACKUP_SOURCE="$HOME/restore/comercialapp/$BACKUP_TIMESTAMP" \
  CONFIRM_RESTORE=comercialapp ./deploy/restore-prod.sh
```

## Recuperar em uma VPS nova

1. Prepare o usuário de implantação, o Docker rootless e o checkout de produção,
   conforme [DOCKER.md](DOCKER.md). Restaure o `.env` do Compose e os segredos
   externos, inclusive `ENTRA_SECRETS_DIR`, antes de iniciar a API.
2. Suba a stack com o projeto `comercialapp` para criar o banco e o volume de
   documentos. Confirme que o volume se chama
   `comercialapp_comercial_files` e pertence ao daemon rootless da conta de
   implantação.

   ```bash
   cd "$HOME/apps/comercialAPP"  # ajuste para o checkout escolhido
   export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
   docker compose -f docker-compose.prod.yml up -d --build
   docker volume inspect comercialapp_comercial_files \
     --format '{{index .Labels "com.docker.compose.project"}}'
   ```

   O último comando deve imprimir `comercialapp`.
3. Baixe o backup do B2, execute `VERIFY_ONLY=true` e faça o restore como acima
   antes de liberar o domínio pelo Caddy.
4. Configure `COMERCIAL_PUBLIC_ORIGIN` com a origem HTTPS somente na sessão do
   operador. Teste `curl -fsS "$COMERCIAL_PUBLIC_ORIGIN/api/health"`, login,
   histórico, fotos, anexos e downloads de DOCX/PDF. Faça um ensaio periódico em
   um projeto Compose separado; não use o projeto de produção no ensaio.

Os nomes de usuários, caminhos e buckets apresentados são marcadores. Não
registre destinos reais, credenciais do B2, conteúdo de backups ou arquivos de
configuração preenchidos neste guia. Consulte a
[política de informações sensíveis](../README.md#informações-sensíveis-na-documentação).
