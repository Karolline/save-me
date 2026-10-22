# AGENTS.md

이 저장소에서 일하는 코딩 에이전트를 위한 안내.

## 프로젝트

SaveMe: 취업 준비생이 지원 현황, 공고 분석, 지원 서류, 면접 후기, 경험, 이력을 한곳에 모아 두는 웹앱. PC 전용으로 만든다 (모바일은 당분간 하지 않는다, 아래 "모바일" 참고). 카카오 로그인이 있는 공개 서비스가 될 예정이고, 지금은 사용자 PC(docker compose)에서 돌며 사용자의 진짜 데이터를 담고 있다.

MVP의 모든 화면은 만들었다. 화면의 기준은 `frontend/src` 코드, API의 기준은 `openapi.yaml`, 데이터 모델의 기준은 `backend/app/db.py`와 마이그레이션이다. 요청이 이것들과 어긋나면 짐작하지 말고 묻는다. 만들 때의 옛 문서(목업, 기획안)는 평소에 열지 않는다. 맨 아래 "옛 문서" 절 참고.


## 언어

한국어가 먼저다 (사용자 결정, 2026-10-15):

- UI 글, 주석, 커밋 메시지는 한국어. 커밋 끝줄(`Co-Authored-By: ...`)은 그대로 둔다.
- 식별자(변수, 함수, 파일, 경로, DB 이름)는 영어.
- 사람이 읽는 문서(`docs/`, `CHANGELOG.md`): 한국어를 먼저, 같은 내용의 영어판을 그 아래에.
- 한국어만: "옛 문서" 절의 기획 파일들과 `README.md`, 그리고 AI만 읽는 글인 `AGENTS.md`와 에이전트·스킬 파일(`.claude/`). AI만 읽는 글에 영어판을 같이 두면 읽을 때마다 토큰이 두 배라서 한국어만 둔다 (사용자 결정 2026-10-21).
- 이 규칙 전에 쓴 파일은 영어다. 작업이 파일을 고칠 때 그 파일을 바꾼다.


## 기술 스택 (정해짐, 바꾸지 않는다)

- 프런트엔드: React + Vite + TypeScript, TanStack Router, 디자인 토큰을 쓰는 plain CSS(`src/styles.css`, 목업에서 옮김), Vitest로 테스트, `frontend/`에.
- 백엔드: Python + FastAPI, `backend/`에.
- DB: SQLAlchemy, Alembic으로 스키마 마이그레이션. compose 스택과 나중의 운영은 PostgreSQL(psycopg), 테스트는 SQLite와 PostgreSQL에서. 코드는 DB에 매이지 않게 (SQLite 전용, Postgres 전용 기능 금지). DB URL은 환경 변수에서.


## 명령

백엔드 (`backend/` 안에서, 의존성은 `uv`, Python 3.13+):

- 설치: `uv sync`. 서류 PDF와 그 테스트를 쓰려면 한 번 `uv run playwright install chromium` (Chromium. 의존성 `playwright`는 사용자가 승인함).
- 의존성 추가: `uv add <package>` (개발용: `uv add --dev <package>`)
- 개발 서버: 저장소 맨 위에서 `make run back`, 또는 `uv run python -m app.devserver` (http://127.0.0.1:8010, 문서는 `/docs`). `DATABASE_URL`(기본값: compose 스택의 `saveme_dev`, `docker compose up -d db`로 띄운다)을 쓰고, 마이그레이션하고, 로컬 로그인(`DEV_LOGIN`)을 켜고, uvicorn을 `--reload`로 돌린다. 8010 포트가 쓰이고 있으면 끝난다: Windows에서는 uvicorn이 남은 서버와 포트를 나눠 쓰게 되기 때문이다. 로컬 개발에서 uvicorn을 직접 띄우지 않는다. 서류 PDF는 Vite 개발 서버(`make run front`)가 같이 떠 있어야 만들어진다 (`PDF_FRONTEND_URL`).
- 마이그레이션(Alembic): `app/db.py`의 모델을 고친 뒤 `uv run alembic revision --autogenerate -m "<바뀐 것>"` (`DATABASE_URL`은 최신 상태의 DB, 예: head까지 올린 임시 SQLite 파일), `migrations/versions/`에 생긴 파일을 읽고 고치고, `uv run python -m app.migrate`로 `saveme_dev`에 적용하고, 모델과 마이그레이션을 함께 커밋한다. DB의 테이블을 손으로 바꾸지 않는다. 제약 이름은 `app/db.py`의 이름 규칙에서 나온다. autogenerate가 만든 기본값은 DB 중립인지 확인한다 (예: Boolean 기본값은 `sa.text('0')`가 아니라 `sa.false()`).
- 테스트: `uv run pytest` (단위만: `uv run pytest tests/unit`, 통합만: `uv run pytest tests/integration`). PostgreSQL에서: `TEST_DATABASE_URL`을 버려도 되는 DB로 (테스트가 테이블을 지우고 다시 만든다. `docs/testing.md`에 임시 컨테이너 예가 있다). `saveme`나 `saveme_dev`를 가리키게 하지 않는다. DB에 닿는 변경은 해당 테스트를 둘 다에서 돌리고, Docker Desktop이 꺼져 있으면 켠다. `uv run pytest tests/compose`는 `docker-compose.yaml`을 자기 프로젝트·포트·볼륨으로 빌드해 띄운다 (Docker 필요, 기본 실행에는 없음). Dockerfile, compose 파일, `docker/`를 고친 뒤 돌린다.
- 로컬 PostgreSQL URL: `localhost`가 아니라 `127.0.0.1`. 이 Windows PC에서 `localhost`는 IPv6를 먼저 시도해서, 127.0.0.1에 연 Docker 포트에서 멈춘다.

프런트엔드 (`frontend/` 안에서, Node.js 20.19+ 또는 22.12+):

- 설치: `npm install`
- 개발 서버: 저장소 맨 위에서 `make run front`, 또는 `npm run dev` (http://localhost:5180). `/api`를 8010의 백엔드 개발 서버로 프록시해서, 앱과 API가 같은 origin이고 세션 쿠키가 된다.
- 테스트: `npm test`
- 타입 검사 + 빌드: `npm run build`
- 린트: `npm run lint`


## 로컬 운영 (진짜 데이터)

배포 전까지는 사용자 PC의 compose 스택이 운영이다: `saveme`에 사용자의 진짜 데이터가 있다. 기획안 5.15와 [`docs/local-operations.md`](docs/local-operations.md) 참고.

- `docker-compose.yaml`: `db` (PostgreSQL 18, `127.0.0.1:5442`, 볼륨 `saveme-pgdata`, DB `saveme`와 `saveme_dev`. 뒤의 것은 볼륨이 새로 생길 때 `docker/initdb/`가 만든다)와 `app` (이미지, `127.0.0.1:8100`, `saveme` 사용, `APP_ENV=local`, `DEV_LOGIN=true`).
- `docker compose down -v`를 돌리거나 `saveme-pgdata` 볼륨을 지우지 않는다. 사용자가 부탁할 때 가져오기 명령과 `scripts/restore.ps1 -IntoRealData`로 하는 것 말고는 테스트, 스크립트, 손으로 `saveme`에 쓰지 않는다.
- 마이그레이션 시험: 먼저 `saveme_dev`에 적용한다 (개발 서버나 `app.migrate`). 진짜 DB는 사용자가 `scripts/update.ps1`로 앱을 업데이트할 때 받는다. 이 스크립트는 다시 빌드하기 전에 `saveme`를 백업하고, 앱 컨테이너가 시작하며 마이그레이션한다.
- 아직 병합하지 않은 브랜치 미리 보기: `scripts/preview.ps1 -Branch <브랜치>` (그 브랜치의 worktree로 이미지 `saveme-preview`를 빌드해 compose 프로젝트 `saveme-preview`로 띄운다: 앱 http://localhost:8200, DB `127.0.0.1:5452`, 볼륨 `saveme-preview-pgdata`. DB에는 `saveme`를 읽기만 해서 복사한다. 끄기: `-Stop`). 개발자 에이전트가 끝나면 병합 전에 사용자가 이것으로 화면을 본다. `APP_PORT`, `DB_PORT`, `PGDATA_VOLUME`을 셸에 남기지 않는다: 진짜 스택의 `docker compose`도 그 값을 읽어 db를 다른 볼륨으로 옮긴다.
- 백업: `scripts/backup.ps1` (`saveme`를 pg_dump해 백업 폴더로, 사용자가 네이버 MYBOX로 동기화), `scripts/register-backup-task.ps1` (매일 예약 작업), `scripts/restore.ps1` (기본은 복원 연습). 이 스크립트들은 ASCII만 쓴다 (Windows PowerShell 5.1이 시스템 코드 페이지로 읽는다).
- 사용자의 기존 데이터 가져오기 (기획안 7, "내 기존 데이터 넣기"): 메뉴마다, 그 만드는 단계의 마지막 작업으로. 가져오기 코드는 `backend/app/importers/`에 있고 JSON 파일을 읽는다 (`applications.py`: 지원 건, `reviews.py`: 면접 후기, `jobs.py`: 공고분석, `experiences.py`: 경험, `resume.py`: 이력, 빈 카드만 채움, `documents.py`: 지원서류 묶음과 서류, 이미 있으면 건너뜀, `--replace`는 "가져옴"인 서류만). 진짜 데이터가 든 JSON은 `private/`(git이 무시)에 쓰고 커밋하지 않는다. 먼저 `saveme_dev`에 넣고, 사용자가 확인하고, 백업한 뒤 `saveme`에 넣는다. 가져오기는 두 번 돌려도 안전해야 한다.
- 새 공고분석 받기: 다른 프로젝트의 Claude가 [`docs/job-inbox.md`](docs/job-inbox.md) 형식으로 `private/inbox/jobs/`에 둔 파일을 `/import-jobs`로 넣는다. 위의 첫 가져오기와 달리 `saveme_dev`를 거치지 않는다: 시험 실행(`--dry-run`), 백업, `saveme`에 넣기. 가져온 분석은 사람 확인이 N이라 사용자가 앱에서 확인한다. 이미 있는 (회사, 직무)는 건너뛴다 (사용자 결정, 2026-10-16). 사용자가 부탁하면 `--replace`(미확인만)나 `--replace-verified`(확인된 것도)로 바꾸고, 지원 건 연결은 그대로 남는다.


## 구조의 원칙

파일 목록은 적지 않는다. 위치는 `Glob`/`Grep`으로 찾는다 (`frontend/src/{services,lib,components}`, `backend/app/{stores,routers,importers}`).

프런트엔드 (`frontend/`):

- 백엔드 호출은 모두 `src/services/`의 서비스 층을 거친다. `types.ts`가 인터페이스(`SaveMeService`), `httpService.ts`가 백엔드 호출(같은 origin, 쿠키 세션, 쓰기에 `X-Requested-With: SaveMe`), `mockService.ts`가 같은 동작(정렬, 계산, 중복·연결 규칙 포함)을 하는 메모리 mock이다. 컴포넌트는 `useService()`만 부르고 데이터를 직접 거르거나 세거나 정렬하지 않는다. 서비스를 바꾸면 mock과 `openapi.yaml`도 맞춘다.
- `src/lib/`: 순수 함수와 단위 테스트. 그리기 계산은 여기 둔다 (기획안 5.11).
- `src/components/`: 화면과 패널. 이동 콜백을 props로 받고 라우터를 import하지 않아서 바로 테스트할 수 있다. 사이드바 메뉴 목록은 `menu.ts` 하나다.
- `src/router.tsx`: 경로 (TanStack Router). 라우트 컴포넌트가 이동과 로그인 확인을 맡는다. 지원 건은 목록 위에 그리는 패널(자식 경로), 나머지는 페이지다. 어디서 왔는지와 고른 것은 search로 넘긴다. 인쇄용 `/print/...`는 셸 밖의 라우트다 (서버가 PDF를 만들 때 연다).
- 모든 입력 칸은 16px 이상 (더 작으면 iPhone Safari가 확대한다). `styles.css`를 테스트가 확인한다.

백엔드 (`backend/`):

- 라우터는 HTTP만, `/api` 아래. 거르기·세기·정렬은 `app/stores/`(영역마다 store 하나)에서 한다. 모든 데이터 엔드포인트는 `current_user`를, 모든 라우터는 `require_csrf_header`(`X-Requested-With: SaveMe` 없는 GET 아닌 요청은 403)를 쓴다.
- 모든 store 메서드는 `user_id`를 받아 그 값으로 거른다. 남의 id는 없는 것처럼 404 (기획안 5.3). 다른 행을 가리키는 값(예: 후기의 `application_id`)도 같은 사용자 것인지 확인한다. 모든 엔드포인트에 "남의 데이터는 404" 테스트가 있다.
- `app/db.py`: 사용자 데이터 테이블은 모두(하위 테이블까지) `ON DELETE CASCADE`인 `user_id`를 갖는다. 시각은 UTC, 사용자가 적는 글은 `Text`. 테이블은 마이그레이션이 만든다. `app/models.py`의 JSON은 `openapi.yaml`에 맞춰 camelCase.
- `openapi.yaml`(저장소 맨 위)이 약속이다. 이것과 백엔드, 프런트엔드 서비스를 맞춰 둔다.
- 설정은 환경 변수(`app/config.py`). `APP_ENV`(`local`/`dev`/`prod`): Secure 쿠키는 `local`에서만 끄고, `/docs`는 `prod`에서 끈다. `DEV_LOGIN`(로컬 가짜 로그인)이 `prod`에서 켜져 있으면 앱이 시작하지 않는다.
- 서류 PDF(`app/pdf.py`)는 헤드리스 Chromium(Playwright)이 요청의 세션 쿠키로 프런트엔드의 인쇄용 경로를 열어 만든다. 컨테이너에서는 `PDF_NO_SANDBOX=1`, 개발 서버에서는 Vite 개발 서버(`PDF_FRONTEND_URL`)가 떠 있어야 한다.
- 테스트는 [`docs/testing.md`](docs/testing.md). Docker 이미지는 시작할 때 마이그레이션하고 실패하면 앱이 시작하지 않는다. CI는 `.github/workflows/ci.yml`(SQLite와 PostgreSQL, 프런트엔드 test/lint/build)과 `compose.yml`(compose 입력이 바뀌면 스모크 테스트, `paths` 목록을 맞춰 둔다).
- 버전: 앱 전체에 `MAJOR.MINOR.PATCH` 하나, git에 `vX.Y.Z` 태그, 바뀐 것은 `CHANGELOG.md`에. [`docs/versioning.md`](docs/versioning.md) 참고. 사용자가 출시를 부탁할 때만 버전을 올린다.


## 규칙

- 프런트엔드의 모든 백엔드 호출은 같은 인터페이스의 mock 구현이 있는 서비스 층을 거친다.
- 모든 store 메서드는 `user_id`를 받고, 모든 데이터 엔드포인트는 `current_user`를 쓴다.
- 새 의존성을 넣기 전에 묻는다.
- 바꿀 때마다 테스트를 쓴다. 전체 테스트를 여러 번 돌리지 않는다 (사용자 결정, 2026-10-22, 개발이 느려서). 언제 무엇을 돌리는지:
  - 개발자 (커밋마다): 건드린 영역의 테스트(유닛+통합 해당 파일), 프런트엔드 빌드(타입 검사), 린트.
  - 개발자 (공유 코드를 건드렸을 때만): 전체 테스트(유닛+통합 전부).
  - 리뷰어: 다시 돌리지 않는다. 읽기로 리뷰하고, 의심스러운 곳만 골라 돌린다.
  - 병합 후 main: 전체 테스트 (한 번).
  - 릴리즈 커밋: `test_versions.py`만.
  - push 후 CI: 전체 테스트 (백엔드 + 프런트엔드 test/lint/build).
  - `tests/compose`는 기본 실행에 없고 Dockerfile, compose 파일, `docker/`를 고쳤을 때만 따로 돌린다.
- 자주, 하나하나가 앱을 동작하는 상태로 두는 작은 커밋으로 커밋한다.
- 개인 데이터는 커밋하지 않는다: 진짜 지원 기록, 덤프, `private/`. 저장소는 공개다.
- push하지 않는다. 사용자가 직접 GitHub에 push한다 (특정 push를 부탁할 때만 예외).
- 작업 중에 내가 바로잡아 주면, 그 내용이 남도록 관련 문서를 고친다.

## 에이전트와 스킬 (Claude Code)

작업 하나는 기획자 → 개발자 → 리뷰어 → 퍼블리셔 순서로 간다. 기획자와 퍼블리셔는 사용자에게 물어야 해서 스킬이고, 개발자와 리뷰어는 에이전트다. 단계 사이의 컨텍스트는 `.claude/tasks/`의 파일(지시서 `<이름>.md`, 개발자 보고 `<이름>.report.md`)로 넘긴다. 컨텍스트를 짧게 두려고 단계마다 새 대화에서 시작한다 (기획자가 개발자를 띄우면 `/clear`).

- `.claude/skills/plan-task/` (기획자): `/plan-task <만들 것>`. 사용자와 기획하고, 다른 태스크를 안 읽은 사람이 봐도 되는 독립적인 지시서를 `.claude/tasks/`에 써서 main에 커밋하고, 개발자 에이전트를 백그라운드로 띄우고 끝난다. 지시서에 개인 데이터를 쓰지 않는다 (저장소는 공개).
- `.claude/agents/developer.md`: 지시서 하나를 git worktree의 자기 브랜치에서 테스트와 작은 커밋으로 만들고 보고서를 남긴다. `main`에 커밋하지 않는다.
- `.claude/agents/reviewer.md`: 브랜치나 커밋 안 한 변경을 이 파일, 명세, 지시서에 비춰 읽기만 하며 리뷰한다.
- `.claude/skills/publish-task/` (퍼블리셔): `/publish-task <이름>`. 새 대화에서 개발자 보고를 받고, 리뷰어를 돌리고, main에 병합하고, 지시서의 버전으로 릴리즈하고, 지시서·보고서를 지운다. push, 태그 push, 릴리즈 노트는 사용자가 요청할 때만.
- `.claude/skills/import-jobs/`: `/import-jobs`. 공고분석 받은편지함(`private/inbox/jobs/`)의 파일을 시험하고, 백업하고, `saveme`에 넣고, `done/`으로 옮긴다.


## 모델 사용 (사용자 결정, 2026-10-21)

- **Opus**: 설계(기획, 작업 지시서), 리뷰, 어려운 디버깅. 판단이 결과를 좌우하는 일.
- **Sonnet**: 정해진 대로 구현하기, 테스트 돌리기, 문서·이력 정리(`CHANGELOG.md`, 기획안 체크 표시 등). 이런 일은 대화를 처음부터 Sonnet으로 시작한다. 대화 도중에 모델을 바꾸면 그때까지의 컨텍스트를 다시 읽는 비용이 든다.
- 일이 섞여 있으면 판단이 필요한 쪽(Opus)에서 시작해 지시서까지 쓰고, 구현은 새 Sonnet 세션이나 개발자 에이전트에 넘긴다.


## 모바일 (사용자 결정, 2026-10-22)

토큰과 속도를 아끼려고 모바일 개발은 당분간 하지 않는다. 사용자가 모바일로 거의 안 쓸 거라 본다.

- 새 화면에 모바일 레이아웃, 모바일 전용 컴포넌트·탭, 모바일 테스트를 만들지 않는다. 작업 지시서, 화면 명세, 리뷰에서도 모바일 확인을 하지 않는다. 좁은 화면에서 깨져도 괜찮다.
- 이미 있는 모바일 코드(하단 탭 바, 서류 상세의 탭 전환, 슬라이드 패널의 전체 화면 등)와 그 테스트는 지우지 않는다. 고치지도 않는다.
- 나중에 모바일을 할 때 드는 비용을 키우지 않는 습관만 지킨다: (1) 레이아웃은 flex/grid와 상대 단위로, 고정 px 폭을 새로 박지 않는다 (A4 미리보기 같은 원래 고정인 곳은 예외). (2) hover에만 있는 기능을 만들지 않는다. (3) 입력 칸 16px 이상 규칙과 그 테스트는 그대로. (4) 메뉴 목록 하나, CSS 변수 같은 기존 구조를 유지한다.
- 옛 문서(기획안, 목업)의 모바일 설명은 나중에 모바일을 할 때를 위한 기록이다. 지금 구현 대상이 아니다.


## 옛 문서 (평소에는 열지 않는다)

MVP가 끝나서 아래 문서는 만들 때의 기록이다. 토큰과 시간을 아끼려고 평소 작업에서는 읽지 않는다 (사용자 결정, 2026-10-22).

- [`docs/archive/mockup/saveme-mvp.html`](docs/archive/mockup/saveme-mvp.html) (300KB, 확정 목업), [`docs/archive/화면명세-1차.md`](docs/archive/화면명세-1차.md): 이미 만든 화면은 코드가 기준이라 열지 않는다. 새 화면을 만들 때만 `Grep -n`으로 그 화면(`const SCREENS`의 id, `/* ───────── <이름>` 영역)을 찾아 그 부분만 읽는다.
- [`tech 기획안.md`](tech%20기획안.md) (75KB): 통째로 읽지 않는다. 제목 줄(`^#`)을 Grep해 필요한 절만 `Read`의 `offset`/`limit`로 읽는다. 아직 남은 일에만 쓴다: 12 배포(5.6 호스팅, 5.9 개인정보, 5.15 로컬 운영), 6절의 정할 것·나중에 할 일, 3.2의 뺀 것(제출 파일, 다크 모드, AI, 내 데이터 내보내기). 만든 화면의 명세(4.2)와 데이터 모델(5.13)은 코드가 더 정확하다. 한 대화에서 이미 읽은 부분은 다시 읽지 않는다.
- 남은 큰 일: **12 배포**(CI → 이미지 → 배포, 카카오 로그인, 초대 코드), 그다음 모바일·AI·제출 파일. 포트폴리오 가져오기는 이슈 #4, 리뷰 붙여넣기 파싱은 이슈 #5.

