# Backup e restauração do ComercialAPP

Os scripts `deploy/backup-prod.sh` e `deploy/restore-prod.sh` seguem o formato do
FiltroAPP: uma pasta por execução, dump SQL compactado, arquivo do volume e
`SHA256SUMS`. Aqui o volume obrigatório é `comercialapp_comercial_files`, que
contém os DOCX/PDF de propostas, anexos e fotos de escopo. O backup do banco
sozinho não recupera esses arquivos.

## Backup

Na VPS, crie `/var/backups/comercialapp` com escrita apenas para o usuário de
implantação. A partir do checkout do ComercialAPP:

```bash
BACKUP_ROOT=/var/backups/comercialapp ./deploy/backup-prod.sh
```

O script exige `db`, `api` e `web` em execução e o volume pertencente ao projeto
Compose `comercialapp`. Ele para `web` e `api` enquanto exporta o banco e o
volume, garantindo que os dois arquivos representem o mesmo estado, e os
reinicia mesmo se o backup falhar. Durante esse período, o ComercialAPP fica
indisponível; os demais aplicativos da VPS continuam funcionando.

Cada pasta concluída contém:

- `postgres.sql.gz`: usuários, sessões, levantamentos, propostas e metadados;
- `comercial-files.tar.gz`: documentos, anexos e fotos;
- `SHA256SUMS`: verificação de integridade dos dois arquivos.

A pasta `.partial` indica falha e não deve ser usada para restauração. A ligação
`latest` aponta para a última pasta concluída. Opcionalmente, configure
`B2_URI=b2://bucket/caminho` (e `B2_BIN` se necessário) para copiar a pasta
concluída ao Backblaze B2, como no FiltroAPP. Instale `flock` e configure um
agendador, retenção e alerta para falhas; mantenha uma cópia fora da VPS.

## Verificação e restauração

Confira uma pasta de backup sem alterar a stack:

```bash
VERIFY_ONLY=true BACKUP_SOURCE=/var/backups/comercialapp/AAAA-MM-DD-HHMMSS ./deploy/restore-prod.sh
```

Para restaurar, escolha a pasta exata e execute em janela de manutenção:

```bash
CONFIRM_RESTORE=comercialapp BACKUP_SOURCE=/var/backups/comercialapp/AAAA-MM-DD-HHMMSS ./deploy/restore-prod.sh
```

O restore exige **os dois arquivos e os checksums**, substitui o banco
`comercialapp` e todo o volume de arquivos, e então inicia `api` e `web`. Se
falhar depois de parar o app, deixa esses serviços parados para evitar servir
um banco e arquivos de momentos diferentes. Confirme `/api/health`, login,
histórico, fotos e download de uma proposta após a restauração. Teste a
restauração periodicamente em um ambiente separado. Backup e restore usam o
mesmo arquivo de trava em `BACKUP_ROOT`; informe o mesmo valor nas duas operações.

Para ensaios isolados, `PROJECT_NAME` altera o projeto Compose e o volume
esperado; `COMPOSE_OVERRIDE_FILE` pode apontar para outro arquivo ou ser vazio
para usar só `docker-compose.yml`. Nunca use o projeto de produção em um ensaio
de restauração.
