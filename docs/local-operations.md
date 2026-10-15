# 로컬 운영

SaveMe를 배포하기 전까지는 사용자 PC의 compose 스택에 진짜 데이터가 있다 (기획안 5.15). 이 문서는 그 운영 절차다.

## 앱 띄우기

```
docker compose up -d --build        # 처음
```

http://localhost:8100 을 열고 "이 PC에서 바로 시작"(로컬 로그인, `DEV_LOGIN=true`)을 누른다. 스택은 Docker Desktop과 함께 다시 켜진다 (`restart: unless-stopped`).

| DB | 쓰는 곳 | 담긴 것 |
|---|---|---|
| `saveme` | `app` 컨테이너 (http://localhost:8100) | 진짜 데이터 |
| `saveme_dev` | 개발 서버 (`make run back`, `make run front` → http://localhost:5180), 마이그레이션 시험 | 실험, 샘플 데이터 |

둘 다 `saveme-pgdata` 볼륨에 있다. **`docker compose down -v`는 절대 쓰지 않는다** (볼륨이 지워진다). `-v` 없는 `docker compose down`은 괜찮다.

## 새 코드로 업데이트

```
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

먼저 `saveme`를 백업하고 (실패하면 멈춘다), 스택을 다시 빌드해 띄운 뒤 (앱이 시작할 때 `saveme`를 마이그레이션한다) 앱이 응답할 때까지 기다린다. 마이그레이션이 실패하면 앱이 시작하지 않고, 데이터는 그대로이며, 백업이 남아 있다.

## 병합 전 브랜치 미리 보기

```
powershell -ExecutionPolicy Bypass -File scripts\preview.ps1 -Branch step8-jobs
```

아직 `main`에 합치지 않은 브랜치를 진짜 스택 옆에 따로 띄운다. 그 브랜치가 worktree에 체크아웃돼 있어야 한다 (개발자 에이전트의 worktree, 또는 `git worktree add`).

| | 진짜 스택 | 미리 보기 |
|---|---|---|
| compose 프로젝트 | `save-me` | `saveme-preview` |
| 앱 | http://localhost:8100 | http://localhost:8200 |
| DB 포트 | 5442 | 5452 |
| 볼륨 | `saveme-pgdata` | `saveme-preview-pgdata` |
| 이미지 | `saveme` | `saveme-preview` (`scripts/preview.override.yaml`) |

돌 때마다 진짜 `saveme`를 pg_dump로 읽어 미리 보기 DB에 복사하고, 미리 보기 앱이 그 복사본을 마이그레이션한다. 그래서 미리 보기에서 바꾼 것은 다음 실행 때 사라진다 (`-KeepData`면 복사하지 않고 둔다). `-Stop`은 미리 보기를 끄고 그 볼륨만 이름으로 지운다.

`APP_PORT`, `DB_PORT`, `PGDATA_VOLUME`은 셸에 남기지 않는다. 남아 있으면 진짜 스택의 `docker compose up`도 그 값을 읽어 진짜 db 컨테이너를 다른 볼륨에 다시 만든다 (데이터는 `saveme-pgdata`에 그대로지만 앱이 빈 DB를 본다). 스크립트는 이 값을 미리 보기 명령 하나에만 주고, 진짜 db가 `saveme-pgdata`에 있는지 확인한다.

## 백업

`scripts/backup.ps1`은 컨테이너 안에서 `saveme`를 `pg_dump`(custom 형식)하고, 그 파일을 백업 폴더에 `saveme-YYYYMMDD-HHMMSS-<이유>.dump`로 복사한다. 최신 30개만 남긴다. 돌 때마다 그 폴더의 `backup.log`에 한 줄을 남긴다. 필요하면 Docker Desktop과 DB를 켠다.

백업 폴더는 `-BackupDir`, 없으면 환경 변수 `SAVEME_BACKUP_DIR`, 그것도 없으면 `%USERPROFILE%\SaveMe-backups`다. 이 PC에서는 사용자 환경 변수 `SAVEME_BACKUP_DIR`이 `N:\개인\SaveMe-backups`다. N:은 네이버 MYBOX 탐색기 앱의 드라이브라서, 거기 쓴 파일은 앱이 올린다 (MYBOX는 N: 바로 아래에 폴더를 둘 수 없다). MYBOX는 로그인한 채로, Windows와 함께 시작하게 둔다. 그 폴더를 쓸 수 없으면 (MYBOX가 꺼져 N:이 없으면) 덤프는 `%USERPROFILE%\SaveMe-backups`에 가고, 그 폴더의 `backup.log`에 경고가 남는다. 나중에 옮겨 두면 된다. MYBOX에는 공개 업로드 API가 없어서 스크립트는 MYBOX와 직접 이야기하지 않는다. 덤프에는 개인 기록이 있으니 공유 링크를 만들지 않는다.

매일 백업:

```
powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -BackupDir "<MYBOX가 동기화하는 폴더>"
```

예약 작업 "SaveMe backup"을 등록한다 (매일 21:00, 놓치면 되도록 빨리). 시각(`-At 08:30`)이나 폴더를 바꾸려면 다시 돌린다. 이 PC에는 `-BackupDir "N:\개인\SaveMe-backups"`로 등록돼 있다 (2026-10-15).

## 복원

```
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1
```

인자가 없으면 **복원 연습**이다: 가장 최근 덤프를 임시 DB(`saveme_restore_check`)에 복원하고, 행 수를 `saveme`와 비교한 뒤 임시 DB를 지운다. 백업을 설정한 뒤 한 번, 그리고 가끔 해 본다.

- `-File <덤프>`로 덤프를 고른다. `-KeepScratch`는 살펴보도록 임시 DB를 남긴다.
- `-Database saveme_dev`는 실험용 DB를 바꾼다.
- `-Database saveme -IntoRealData`는 진짜 데이터를 바꾼다. 먼저 지금 `saveme`를 백업한다 (`before-restore`).

## 기존 데이터 가져오기

메뉴마다 만드는 단계의 마지막에 사용자의 기존 기록을 가져온다 (기획안 7). 가져오기는 JSON 파일을 읽는다. 진짜 데이터가 든 JSON은 `private/`(git이 무시)에 둔다. `saveme_dev`에 먼저 넣고, 화면을 확인하고, 백업한 뒤 `saveme`에 넣는다. 두 번 돌려도 괜찮다: 이미 있는 기록(같은 키)은 중복되지 않고 고쳐진다.

```
cd backend
# 실험용 DB 먼저 (개발 서버의 기본값)
uv run python -m app.importers.applications ../private/applications.json
# 백업한 뒤 진짜 DB에
uv run python -m app.importers.applications ../private/applications.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```

### 면접 후기 (`app.importers.reviews`)

지원 건을 먼저 가져온 뒤에 돌린다. 파일 모양:

```json
{
  "reviews": [
    {
      "company": "라온소프트",
      "appliedAt": "2026-07-13",
      "round": "1차 면접",
      "extra": "실무진",
      "interviewedAt": "2026-08-04",
      "summary": "화상 면접, 분위기 좋음",
      "questions": [
        {
          "question": "중복 처리를 어떻게 막나요?",
          "isFavorite": true,
          "answers": [{ "kind": "mine", "body": "멱등 키로 걸렀다" }]
        }
      ]
    }
  ]
}
```

- 지원 건은 로컬 사용자의 (`company`, `appliedAt`)으로 찾는다. 하나라도 없으면 그 지원 건들을 알려 주고 아무것도 쓰지 않는다.
- 같은 지원 건에 같은 `round`의 후기가 있으면 통째로 바꾼다 (질문, 말풍선, 별 표시까지). 그래서 두 번 돌려도 달라지지 않는다.
- 한 파일에 같은 (지원 건, `round`)가 두 번 있으면 그것들을 알려 주고 아무것도 쓰지 않는다.
- 파일 전체를 트랜잭션 하나로 쓴다. 도중에 실패하면 아무것도 남지 않는다.
- `kind`: `follow`(꼬리질문), `interviewer`(면접관), `mine`(내 답), `retry`(다시 답한다면), `memo`(메모), `ai`(AI 첨언). `extra`, `interviewedAt`, `summary`, `questions`, `isFavorite`, `answers`는 빼도 된다.

```
cd backend
uv run python -m app.importers.reviews ../private/reviews.json
uv run python -m app.importers.reviews ../private/reviews.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```

### 공고분석 (`app.importers.jobs`)

연결할 지원 건이 있으면 지원 건을 먼저 가져온 뒤에 돌린다. 항목마다 API의 `POST /api/jobs` 본문(`openapi.yaml`의 `JobFields`, `applicationId` 빼고)에 `analyzedAt`과 `application`을 더한다:

```json
{
  "jobs": [
    {
      "company": "한결로보틱스",
      "title": "로봇 데이터 플랫폼 엔지니어",
      "analyzedAt": "2026-10-11",
      "fit": "중",
      "conclusion": "시계열 저장소 경험을 어떻게 말할지가 관건",
      "requirements": [
        { "category": "must", "text": "Python, SQL 능숙", "level": "full", "evidence": ["2022-09 정산배치-튜닝"] },
        { "category": "pref", "text": "ROS 사용 경험", "level": "" }
      ],
      "gaps": ["ROS"],
      "notes": "다른 칸에 맞지 않는 내용",
      "application": { "company": "한결로보틱스", "appliedAt": "2026-10-20" }
    }
  ]
}
```

- API와 달리 `analyzedAt`(원래 분석한 날)을 그대로 쓴다. 앱에서 저장하면 그날로 바뀐다.
- 같은 분석인지는 로컬 사용자의 (`company`, `title`)로 정한다. 있으면 통째로 바꾸므로 두 번 돌려도 달라지지 않는다. 한 파일에 같은 (`company`, `title`)가 두 번 있으면 알려 주고 아무것도 쓰지 않는다.
- `application`은 연결할 지원 건 (`company`, `appliedAt`)이거나 `null`. 없는 지원 건이 있으면 알려 주고 아무것도 쓰지 않는다. 연결하면 지원 여부는 `applied`가 된다. 지원 건 하나에는 분석 하나: 이미 다른 분석과 연결된 지원 건이나 한 지원 건을 가리키는 두 항목이 있으면 아무것도 쓰지 않는다.
- `level`: `full`(충족), `part`(부분·인접), `none`(없음), `""`(미평가). 해당도를 매기지 않은 기존 분석은 `""`로 둔다.
- 파일 전체를 트랜잭션 하나로 쓴다. `company`와 `analyzedAt` 말고는 빼도 된다. 점수는 0~1000.
- 파일이 망가졌으면 (JSON, 칸 모양) 한 줄 오류를 보이고 아무것도 쓰지 않는다.

```
cd backend
uv run python -m app.importers.jobs ../private/jobs.json
uv run python -m app.importers.jobs ../private/jobs.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```

---

# Local operations (English)

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

## Previewing a branch before merging

```
powershell -ExecutionPolicy Bypass -File scripts\preview.ps1 -Branch step8-jobs
```

Runs a branch that isn't merged into `main` yet, next to the real stack. The branch must be checked out in a worktree (the developer agent's, or `git worktree add`). It uses the compose project `saveme-preview`, the app on http://localhost:8200, the database on 5452, the volume `saveme-preview-pgdata` and the image `saveme-preview` (`scripts/preview.override.yaml`); the real stack keeps `save-me`, 8100, 5442, `saveme-pgdata` and `saveme`.

Each run copies the real `saveme` (read with pg_dump) into the preview database, and the preview app migrates the copy, so changes made in the preview are gone on the next run (`-KeepData` skips the copy). `-Stop` stops the preview and removes only its volume, by name.

Never leave `APP_PORT`, `DB_PORT` or `PGDATA_VOLUME` set in a shell: the real stack's `docker compose up` reads them too and recreates the real db container on another volume (the data stays in `saveme-pgdata`, but the app sees an empty database). The script sets them for each preview command only, and checks that the real db is on `saveme-pgdata`.

## Backups

`scripts/backup.ps1` runs `pg_dump` (custom format) of `saveme` inside the container and copies the file to the backup folder as `saveme-YYYYMMDD-HHMMSS-<reason>.dump`, keeping the newest 30. Each run appends a line to `backup.log` in that folder. It starts Docker Desktop and the database if needed.

The backup folder is `-BackupDir`, else the `SAVEME_BACKUP_DIR` environment variable, else `%USERPROFILE%\SaveMe-backups`. On this PC the user environment variable `SAVEME_BACKUP_DIR` is `N:\개인\SaveMe-backups`: N: is the drive of the Naver MYBOX Explorer app (MYBOX 탐색기), so a file written there is uploaded by the app (MYBOX doesn't allow folders directly under N:). Keep MYBOX logged in and starting with Windows. If the folder can't be used (N: missing because MYBOX isn't running), the dump goes to `%USERPROFILE%\SaveMe-backups` with a warning in that folder's `backup.log`; copy it over later. MYBOX has no public upload API, so the scripts never talk to it. Don't create share links for the dumps: they contain personal records.

Daily backups:

```
powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1 -BackupDir "<folder MYBOX syncs>"
```

registers the scheduled task "SaveMe backup" (daily at 21:00, or as soon as possible after a missed run). Run it again to change the time (`-At 08:30`) or the folder. On this PC it is registered with `-BackupDir "N:\개인\SaveMe-backups"` (2026-10-15).

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

### Interview reviews (`app.importers.reviews`)

Run it after the applications are imported. The file is `{"reviews": [...]}` with the shape shown in the Korean section above (`company`, `appliedAt`, `round`, `extra`, `interviewedAt`, `summary`, `questions: [{question, isFavorite, answers: [{kind, body}]}]`).

- The application is found by (`company`, `appliedAt`) for the local user. If any is missing, the importer names them and writes nothing.
- A review with the same application and `round` is replaced as a whole (questions, bubbles and stars), so running it twice changes nothing.
- If the file has the same (application, `round`) twice, the importer names them and writes nothing.
- The whole file is written in one transaction; if anything fails midway, nothing is kept.
- `kind`: `follow`, `interviewer`, `mine`, `retry`, `memo`, `ai`. Everything but `company`, `appliedAt` and `round` may be left out.

```
cd backend
uv run python -m app.importers.reviews ../private/reviews.json
uv run python -m app.importers.reviews ../private/reviews.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```

### Job analyses (`app.importers.jobs`)

Run it after the applications are imported when analyses link to them. The file is `{"jobs": [...]}`; each item is the `POST /api/jobs` body (`JobFields` in `openapi.yaml`, without `applicationId`) plus `analyzedAt` and `application`, as shown in the Korean section above.

- Unlike the API, the given `analyzedAt` (the original analysis day) is kept. Saving in the app changes it to that day.
- The same analysis is the same (`company`, `title`) for the local user; it is replaced as a whole, so running twice changes nothing. The same (`company`, `title`) twice in the file is named and nothing is written.
- `application` is the application to link (`company`, `appliedAt`) or `null`. A missing application is named and nothing is written. Linking stores the status as `applied`. One analysis per application: an application already linked to another analysis, or two items pointing at one application, write nothing.
- `level`: `full`, `part`, `none`, or `""` (not rated yet). Existing analyses without per-item ratings use `""`.
- The whole file is written in one transaction. Everything but `company` and `analyzedAt` may be left out. Scores are 0-1000.
- A malformed file (JSON, field shapes) prints a one-line error and writes nothing.

```
cd backend
uv run python -m app.importers.jobs ../private/jobs.json
uv run python -m app.importers.jobs ../private/jobs.json --database-url postgresql://saveme:saveme@127.0.0.1:5442/saveme
```
