#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(dirname "$SCRIPT_DIR")}"
PROJECT_NAME="${PROJECT_NAME:-comercialapp}"
COMPOSE_OVERRIDE_FILE="${COMPOSE_OVERRIDE_FILE-docker-compose.prod.yml}"
FILES_VOLUME="${FILES_VOLUME:-${PROJECT_NAME}_comercial_files}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/comercialapp}"
BACKUP_SOURCE="${BACKUP_SOURCE:-${1:-}}"
VERIFY_ONLY="${VERIFY_ONLY:-false}"

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "[restore] PROJECT_NAME inválido" >&2
  exit 1
fi
if [[ -z "$BACKUP_SOURCE" || ! -d "$BACKUP_SOURCE" ]]; then
  echo '[restore] informe BACKUP_SOURCE com a pasta do backup' >&2
  exit 1
fi
BACKUP_SOURCE="$(cd "$BACKUP_SOURCE" && pwd)"

for file in postgres.sql.gz comercial-files.tar.gz SHA256SUMS; do
  if [[ ! -s "$BACKUP_SOURCE/$file" ]]; then
    echo "[restore] arquivo ausente ou vazio: $BACKUP_SOURCE/$file" >&2
    exit 1
  fi
done

echo '[restore] verificando checksums e arquivos'
(cd "$BACKUP_SOURCE" && sha256sum -c SHA256SUMS)
gzip -t "$BACKUP_SOURCE/postgres.sql.gz"
tar -tzf "$BACKUP_SOURCE/comercial-files.tar.gz" >/dev/null

# Não permitir que um arquivo adulterado escreva fora do volume de destino.
while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      echo "[restore] caminho inválido no arquivo: $entry" >&2
      exit 1
      ;;
  esac
done < <(tar -tzf "$BACKUP_SOURCE/comercial-files.tar.gz")

if [[ "$VERIFY_ONLY" == true ]]; then
  echo '[restore] backup íntegro; nenhuma alteração feita'
  exit 0
fi
if [[ "${CONFIRM_RESTORE:-}" != "$PROJECT_NAME" ]]; then
  echo "[restore] operação destrutiva: defina CONFIRM_RESTORE=$PROJECT_NAME" >&2
  exit 1
fi

command -v flock >/dev/null || { echo '[restore] instale flock (util-linux)' >&2; exit 1; }
mkdir -p "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/backup.lock"
flock -n 9 || { echo '[restore] outro backup ou restore está em andamento' >&2; exit 1; }

COMPOSE=(docker compose -p "$PROJECT_NAME" -f "$PROJECT_DIR/docker-compose.yml")
if [[ -n "$COMPOSE_OVERRIDE_FILE" ]]; then
  if [[ "$COMPOSE_OVERRIDE_FILE" = /* ]]; then
    COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE")
  else
    COMPOSE+=(-f "$PROJECT_DIR/$COMPOSE_OVERRIDE_FILE")
  fi
fi
"${COMPOSE[@]}" config -q
docker image inspect alpine:3.20 >/dev/null 2>&1 || docker pull alpine:3.20
volume_project="$(docker volume inspect "$FILES_VOLUME" --format '{{index .Labels "com.docker.compose.project"}}')"
volume_kind="$(docker volume inspect "$FILES_VOLUME" --format '{{index .Labels "com.docker.compose.volume"}}')"
if [[ "$volume_project" != "$PROJECT_NAME" || "$volume_kind" != comercial_files ]]; then
  echo "[restore] $FILES_VOLUME não é o volume de arquivos do projeto $PROJECT_NAME" >&2
  exit 1
fi

echo '[restore] parando web e API; o app permanecerá parado se houver falha'
"${COMPOSE[@]}" stop -t 90 web api
"${COMPOSE[@]}" up -d --no-recreate db
"${COMPOSE[@]}" exec -T db pg_isready -U comercial -d postgres

echo '[restore] substituindo o banco comercialapp'
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U comercial -d postgres \
  -c 'DROP DATABASE IF EXISTS comercialapp WITH (FORCE);' \
  -c 'CREATE DATABASE comercialapp OWNER comercial;'
gzip -dc "$BACKUP_SOURCE/postgres.sql.gz" |
  "${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U comercial -d comercialapp

echo "[restore] substituindo $FILES_VOLUME (propostas, anexos e fotos)"
docker run --rm -v "$FILES_VOLUME:/to" -v "$BACKUP_SOURCE:/backup:ro" alpine:3.20 \
  sh -euc 'find /to -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -xzf /backup/comercial-files.tar.gz -C /to'

echo '[restore] reiniciando API e web; a API aplica migrações pendentes'
"${COMPOSE[@]}" up -d --no-recreate api web
"${COMPOSE[@]}" ps
echo '[restore] concluído'
