# Backup do ComercialAPP

## O que salvar

- Banco PostgreSQL `comercialapp`: usuários, sessões, levantamentos, propostas e metadados.
- Volume Docker `comercialapp_comercial_files`: DOCX/PDF, anexos e fotos.
- Fora deste script, o `.env` do Compose e eventuais chaves em `ENTRA_SECRETS_DIR`.

O volume `comercialapp_comercial_pgdata` mantém o banco no host, mas não substitui
uma cópia externa. Guarde o `.env` e as chaves fora do repositório, em um local
protegido. O Caddy compartilhado pertence à infraestrutura de implantação e tem
seu próprio procedimento de backup.

## Script pronto

`deploy/backup-prod.sh` executa `pg_dump`, compacta o volume de documentos,
gera `SHA256SUMS` e, quando `B2_URI` está definido, envia os três arquivos ao
Backblaze B2. Cada execução cria uma pasta com timestamp em `BACKUP_ROOT` e
atualiza o link `latest`. Uma pasta `.partial` indica falha e não deve ser
restaurada. O script exige `db`, `api` e `web` em execução e valida que o volume
pertence ao projeto Compose `comercialapp` do Docker rootless.

**O backup não para o aplicativo.** Como no FiltroAPP, `pg_dump` é feito com o
banco em uso e o volume é lido com a API e a web ativas. O dump do banco tem uma
visão consistente; a cópia do volume em uso não é atômica com ele. Arquivos
criados ou removidos durante o backup podem não coincidir com o dump. Checksums
não detectam essa diferença. Teste a restauração e confira fotos e documentos.
[Documentação do `pg_dump` no PostgreSQL 16](https://www.postgresql.org/docs/16/app-pgdump.html).

## Variáveis

| Variável | Exemplo fictício para a VPS | Uso |
| --- | --- | --- |
| `DOCKER_HOST` | `unix:///run/user/UID/docker.sock` | Usa o Docker rootless do usuário de implantação. Obtenha `UID` com `id -u`. |
| `BACKUP_ROOT` | `/home/USUARIO_DEPLOY/backups/comercialapp` | Diretório local gravável. O padrão do script é `/var/backups/comercialapp`. |
| `B2_URI` | `b2://NOME_BUCKET/comercialapp/daily` | Prefixo remoto. Sem ele, o backup fica somente na VPS; o script acrescenta o timestamp. |
| `B2_BIN` | Caminho absoluto da CLI `b2` | Necessário se a CLI não estiver no `PATH` do cron. O padrão é `b2`. |
| `B2_ACCOUNT_INFO` | `/home/USUARIO_DEPLOY/.b2_account_info` | Cache de autenticação da CLI B2; não é uma variável do script de backup. |

`PROJECT_NAME=comercialapp`, `COMPOSE_FILE=docker-compose.prod.yml` e
`FILES_VOLUME=comercialapp_comercial_files` já são os padrões. Não precisam ser
configurados na implantação normal. Use sempre o **mesmo `BACKUP_ROOT`** no
backup e no restore, pois ambos usam `$BACKUP_ROOT/backup.lock`.

## Backblaze B2

1. Crie um bucket privado e uma Application Key `Read and Write` limitada ao
   bucket. Não use a chave master.
2. Instale `flock` (`util-linux`), `cron`, Python e `venv` pelos pacotes da sua
   distribuição. Entre na VPS com a **conta de implantação** que executa o
   Docker rootless.
3. Instale a CLI e crie os diretórios:

   ```bash
   python3 -m venv "$HOME/.local/share/comercialapp-b2"
   "$HOME/.local/share/comercialapp-b2/bin/pip" install --upgrade b2
   install -d -m 700 "$HOME/backups/comercialapp" "$HOME/logs"
   ```

4. Autorize a CLI **como o usuário de implantação**. Ela pede o Key ID e a
   Application Key
   interativamente, sem gravá-los na linha de comando ou no crontab:

   ```bash
   export B2_BIN="$HOME/.local/share/comercialapp-b2/bin/b2"
   export B2_ACCOUNT_INFO="$HOME/.b2_account_info"
   umask 077
   "$B2_BIN" account authorize
   "$B2_BIN" ls 'b2://NOME_BUCKET/comercialapp/'
   ```

Substitua `NOME_BUCKET`. O crontab do mesmo usuário reutiliza o cache indicado
por `B2_ACCOUNT_INFO`. [Referência da CLI B2](https://b2-command-line-tool.readthedocs.io/en/master/quick_start.html).

## Executar manualmente

No checkout de produção, como o usuário de implantação, preencha o bucket real:

```bash
cd "$HOME/apps/comercialAPP"  # ajuste para o checkout escolhido
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
export BACKUP_ROOT="$HOME/backups/comercialapp"
export B2_BIN="$HOME/.local/share/comercialapp-b2/bin/b2"
export B2_ACCOUNT_INFO="$HOME/.b2_account_info"
export B2_URI='b2://NOME_BUCKET/comercialapp/daily'
docker info | grep -i rootless
docker compose -f docker-compose.prod.yml ps
./deploy/backup-prod.sh
```

Confira os arquivos locais, a integridade e o destino remoto:

```bash
ls -lh "$BACKUP_ROOT/latest/"
BACKUP_SOURCE="$BACKUP_ROOT/latest" VERIFY_ONLY=true ./deploy/restore-prod.sh
"$B2_BIN" ls --recursive 'b2://NOME_BUCKET/comercialapp/daily/'
```

`VERIFY_ONLY=true` não altera a stack. O B2 deve conter `SHA256SUMS`,
`postgres.sql.gz` e `comercial-files.tar.gz` sob o mesmo timestamp. Se o upload
falhar, o script retorna erro e preserva a pasta local concluída. Veja
[RESTORE.md](RESTORE.md) para baixar e restaurar uma cópia.

## Configurar o crontab manualmente

Ainda como o usuário de implantação, descubra o UID e o caminho absoluto do
checkout:

```bash
id -u
realpath deploy/backup-prod.sh
crontab -e
```

Substitua `UID`, `NOME_BUCKET`, `USUARIO_DEPLOY` e o caminho do checkout pelos
valores reais. Exemplo de backup **diário completo às 04:15**:

```cron
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
DOCKER_HOST=unix:///run/user/UID/docker.sock
BACKUP_ROOT=/home/USUARIO_DEPLOY/backups/comercialapp
B2_BIN=/home/USUARIO_DEPLOY/.local/share/comercialapp-b2/bin/b2
B2_ACCOUNT_INFO=/home/USUARIO_DEPLOY/.b2_account_info

15 4 * * * (cd /home/USUARIO_DEPLOY/apps/comercialAPP && B2_URI=b2://NOME_BUCKET/comercialapp/daily ./deploy/backup-prod.sh) >> /home/USUARIO_DEPLOY/logs/backup-comercialapp.log 2>&1
```

O `cd` faz o Compose carregar o `.env` do checkout. As variáveis no topo do
crontab são literais: informe o número do UID e o caminho completo, sem
`$(id -u)` ou `$HOME`. Para uma cópia mensal em outro prefixo, acrescente:

```cron
15 5 1 * * (cd /home/USUARIO_DEPLOY/apps/comercialAPP && B2_URI=b2://NOME_BUCKET/comercialapp/monthly ./deploy/backup-prod.sh) >> /home/USUARIO_DEPLOY/logs/backup-comercialapp.log 2>&1
```

Cada execução salva **banco e documentos** com o app em funcionamento. `flock`
impede dois backups ou um backup e um restore simultâneos. Confira `crontab -l`,
o log e a criação de novas pastas locais e remotas. Configure um alerta na VPS
para falhas ou ausência de backup recente.

## Retenção

O script não elimina cópias locais antigas. Acompanhe o espaço em disco e só
remova backups locais depois de conferir o envio ao B2. No painel do Backblaze,
configure Lifecycle Rules para `comercialapp/daily/` e, se usado,
`comercialapp/monthly/`. Exemplo: ocultar os arquivos diários após 60 dias e os
mensais após 365 dias, além de definir quando excluir as versões ocultas. Como
cada execução cria nomes novos, uma regra de manter apenas a última versão não
expira esses backups. [Referência das regras do B2](https://www.backblaze.com/docs/cloud-storage-configure-and-manage-lifecycle-rules).

Os nomes de usuários, caminhos e buckets apresentados são marcadores. Não
registre destinos reais, credenciais do B2, conteúdo de backups ou arquivos de
configuração preenchidos neste guia. Consulte a
[política de informações sensíveis](../README.md#informações-sensíveis-na-documentação).
