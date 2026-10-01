#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(dirname "$SCRIPT_DIR")}"
PROJECT_NAME="${PROJECT_NAME:-comercialapp}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_OVERRIDE_FILE="${COMPOSE_OVERRIDE_FILE:-}"
FILES_VOLUME="${FILES_VOLUME:-${PROJECT_NAME}_comercial_files}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/comercialapp}"
B2_URI="${B2_URI:-}"
B2_BIN="${B2_BIN:-b2}"

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "[backup] PROJECT_NAME inválido" >&2
  exit 1
fi

if [[ "$COMPOSE_FILE" = /* ]]; then
  COMPOSE=(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE")
else
  COMPOSE=(docker compose -p "$PROJECT_NAME" -f "$PROJECT_DIR/$COMPOSE_FILE")
fi
if [[ -n "$COMPOSE_OVERRIDE_FILE" ]]; then
  if [[ "$COMPOSE_OVERRIDE_FILE" = /* ]]; then
    COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE")
  else
    COMPOSE+=(-f "$PROJECT_DIR/$COMPOSE_OVERRIDE_FILE")
  fi
fi

on_exit() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    if [[ -n "${final_dir:-}" && -d "$final_dir" ]]; then
      echo "[backup] envio remoto falhou; backup local concluído em $final_dir" >&2
    else
      echo "[backup] falhou; a pasta .partial não é um backup válido" >&2
    fi
  fi
  exit "$status"
}
trap on_exit EXIT

command -v flock >/dev/null || { echo '[backup] instale flock (util-linux)' >&2; exit 1; }
if [[ -n "$B2_URI" ]]; then
  command -v "$B2_BIN" >/dev/null || { echo "[backup] $B2_BIN não encontrado" >&2; exit 1; }
fi

"${COMPOSE[@]}" config -q
docker image inspect alpine:3.20 >/dev/null 2>&1 || docker pull alpine:3.20
volume_project="$(docker volume inspect "$FILES_VOLUME" --format '{{index .Labels "com.docker.compose.project"}}')"
volume_kind="$(docker volume inspect "$FILES_VOLUME" --format '{{index .Labels "com.docker.compose.volume"}}')"
if [[ "$volume_project" != "$PROJECT_NAME" || "$volume_kind" != comercial_files ]]; then
  echo "[backup] $FILES_VOLUME não é o volume de arquivos do projeto $PROJECT_NAME" >&2
  exit 1
fi

mapfile -t running < <("${COMPOSE[@]}" ps --status running --services)
for service in db api web; do
  found=false
  for active in "${running[@]}"; do
    if [[ "$active" == "$service" ]]; then found=true; break; fi
  done
  if [[ "$found" != true ]]; then
    echo "[backup] serviço $service não está em execução" >&2
    exit 1
  fi
done

mkdir -p "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/backup.lock"
flock -n 9 || { echo '[backup] outro backup está em andamento' >&2; exit 1; }

timestamp="$(date +%F-%H%M%S)"
run_dir="$BACKUP_ROOT/$timestamp.partial"
final_dir="$BACKUP_ROOT/$timestamp"
if [[ -e "$run_dir" || -e "$final_dir" ]]; then
  echo "[backup] pasta de destino já existe: $timestamp" >&2
  exit 1
fi
mkdir "$run_dir"

# O pg_dump não bloqueia o uso normal do banco; o volume é lido sem parar o app.
echo "[backup] exportando PostgreSQL"
"${COMPOSE[@]}" exec -T db pg_dump -U comercial -d comercialapp |
  gzip -1 > "$run_dir/postgres.sql.gz"

echo "[backup] arquivando propostas, anexos e fotos de $FILES_VOLUME"
docker run --rm -v "$FILES_VOLUME:/from:ro" -v "$run_dir:/backup" alpine:3.20 \
  tar -C /from -czf /backup/comercial-files.tar.gz .

(cd "$run_dir" && sha256sum postgres.sql.gz comercial-files.tar.gz > SHA256SUMS)
mv "$run_dir" "$final_dir"
ln -sfn "$final_dir" "$BACKUP_ROOT/latest"

if [[ -n "$B2_URI" ]]; then
  echo "[backup] enviando cópia para ${B2_URI%/}/$timestamp"
  "$B2_BIN" sync "$final_dir" "${B2_URI%/}/$timestamp"
fi

echo "[backup] concluído: $final_dir"
