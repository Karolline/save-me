# Local operations

Until SaveMe is deployed, the compose stack on the user's PC is where the real data lives (tech plan 5.15). This page is the runbook.

## Running the app

```
docker compose up -d --build        # first time
```

Open http://localhost:8100 and choose "이 PC에서 바로 시작" (the local login, `DEV_LOGIN=true`). The stack restarts with Docker Desktop (`restart: unless-stopped`).

| Database | Used by | Holds |
|---|---|---|
| `saveme` | the `app` container (http://localhost:8100) | the real data |
| `saveme_dev` | the dev servers (`make run back`, `make run front` → http://localhost:5180) and trying migrations | experiments, sample data |

Both are in the `saveme-pgdata` volume. **Never run `docker compose down -v`** (it deletes the volume); `docker compose down` without `-v` is safe.

## Updating to new code

```
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

It backs up `saveme` first (stops if that fails), rebuilds and restarts the stack (the app migrates `saveme` when it starts), and waits until the app answers. If a migration fails the app doesn't start, the data is unchanged, and the backup is there.

## Backups

`scripts/backup.ps1` runs `pg_dump` (custom format) of `saveme` inside the container and copies the file to the backup folder as `saveme-YYYYMMDD-HHMMSS-<reason>.dump`, keeping the newest 30. Each run appends a line to `backup.log` in that folder. It starts Docker Desktop and the database if needed.

The backup folder is `-BackupDir`, else the `SAVEME_BACKUP_DIR` environment variable, else `%USERPROFILE%\SaveMe-backups`. Make the Naver MYBOX PC app sync that folder (or point the folder at one MYBOX already syncs), with MYBOX set to keep the login and start with Windows; then every dump is uploaded without anyone logging in. MYBOX has no public upload API, so the scripts never talk to it. Don't create share links for the dumps: they contain personal records.

Daily backups:

```
powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -BackupDir "<folder MYBOX syncs>"
```

registers the scheduled task "SaveMe backup" (daily at 21:00, or as soon as possible after a missed run). Run it again to change the time (`-At 08:30`) or the folder.

## Restoring

```
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1
```

With no arguments this is a **restore drill**: it restores the newest dump into a scratch database (`saveme_restore_check`), compares its row counts with `saveme`, and drops the scratch database. Do one after setting up backups, and now and then.

- `-File <dump>` picks a dump; `-KeepScratch` keeps the scratch database to look at.
- `-Database saveme_dev` replaces the experiments database.
- `-Database saveme -IntoRealData` replaces the real data. It backs up the current `saveme` first (`before-restore`).

## Importing existing data

Each menu's build step ends by importing the user's existing records for it (tech plan 7). The importer reads a JSON file; the JSON with real data lives in `private/` (git-ignored). Import into `saveme_dev`, check the screens, back up, then import into `saveme`. Importers are safe to run twice: existing records (same key) are updated, not duplicated.

```
cd backend
# experiments database first (the dev server's default)
uv run python -m app.importers.applications ../private/applications.json
# then the real one, after a backup
uv run python -m app.importers.applications ../private/applications.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```
