# SaveMe

취업 준비생이 지원 현황, 공고 분석, 지원 서류, 면접 후기, 경험, 이력을
한곳에 모아 두는 웹앱입니다. 흩어진 폴더·메모·스프레드시트에 있던 데이터를
하나의 DB로 모으는 것이 출발점이었습니다.

지금은 개발 중이며, 본인 PC에서 docker compose로 띄워 쓰고 있습니다. 카카오 로그인과 서버 배포는 나중에 붙입니다.

## 만든 것
- 지원 건 타임라인과 전형 결과 관리
- 공고 분석(핏, 부각할 경험), 지원 서류, 면접 후기 기록
- 기존 데이터를 JSON에서 가져오는 importer (여러 번 실행해도 안전하게 설계)
- 매일 자동 백업(pg_dump)과 복원 연습 스크립트

## 데이터를 다루는 방식
- PostgreSQL + SQLAlchemy, 스키마 변경은 Alembic 마이그레이션으로만
- 사용자별 데이터 격리 (모든 쿼리가 user_id로 필터, 남의 데이터는 404)
- 마이그레이션 테스트와 PostgreSQL 기반 통합 테스트, CI에서 전체 실행
- Docker Compose로 DB와 앱을 한 번에 실행

## 스택
Python · FastAPI · SQLAlchemy · Alembic · PostgreSQL ·
React · TypeScript · Vite · Docker · GitHub Actions


## 실행하기

Docker가 필요합니다.

```
docker compose up -d --build
```

http://localhost:8100 을 열고 "이 PC에서 바로 시작"을 누릅니다.

코드를 고친 뒤 앱에 반영할 때는 백업부터 하고 다시 띄우는 스크립트를 씁니다.

```
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

## 개발하기

백엔드(Python, FastAPI, [uv](https://docs.astral.sh/uv/))와 프런트엔드(React, Vite, Node.js 22 이상):

```
docker compose up -d db      # 개발 서버가 쓸 PostgreSQL
make run back                # http://127.0.0.1:8010
make run front               # http://localhost:5180
```

개발 서버는 실험용 데이터베이스(`saveme_dev`)를 쓰므로 실제 데이터(`saveme`)에는 영향이 없습니다.

지원서류의 미리보기와 [PDF로 내려받기]는 서버 없이 브라우저 인쇄 창으로 합니다. 서버가 Chromium으로 PDF를 만드는 방식은 꺼 두었습니다 (코드는 남아 있고, Chromium도 설치하지 않습니다). 다시 켜는 법은 [`docs/pdf.md`](docs/pdf.md)에 있습니다.

테스트: `backend/`에서 `uv run pytest`, `frontend/`에서 `npm test`. 자세한 내용은 [`docs/testing.md`](docs/testing.md)에 있습니다.

## 데이터와 백업

- 실제 데이터는 `saveme`, 실험용은 `saveme_dev` 데이터베이스에 있습니다. 둘 다 Docker 볼륨 `saveme-pgdata` 안에 있으니 `docker compose down -v`는 쓰지 않습니다.
- 매일 21시에 `pg_dump` 백업이 네이버 MYBOX 드라이브 폴더에 저장되고, MYBOX 앱이 자동으로 올립니다.
- 백업, 복구 연습, 업데이트 방법은 [`docs/local-operations.md`](docs/local-operations.md)에 있습니다.

## 더 보기

- [`tech 기획안.md`](tech%20기획안.md): 기술 기획안 (맨 위 "남은 일 한눈에" 표가 할 일 목록)
- [`docs/archive/tech 기획안-완료분.md`](docs/archive/tech%20기획안-완료분.md): 기획안에서 끝난 부분만 옮긴 기록
- [`docs/archive/mockup/saveme-mvp.html`](docs/archive/mockup/saveme-mvp.html): 확정한 MVP 화면 목업
- [`AGENTS.md`](AGENTS.md): 코드 구조와 규칙 (코딩 에이전트용)
