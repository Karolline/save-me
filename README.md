# SaveMe

취업 준비를 한곳에서 정리하는 웹앱입니다. 지원 현황을 타임라인으로 보고, 공고 분석, 지원 서류, 면접 후기, 경험, 이력을 함께 관리합니다.

지금은 개발 중이며, 첫 사용자가 자기 PC에서 docker compose로 띄워 쓰고 있습니다. 카카오 로그인과 서버 배포는 나중에 붙입니다.

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

테스트: `backend/`에서 `uv run pytest`, `frontend/`에서 `npm test`. 자세한 내용은 [`docs/testing.md`](docs/testing.md)에 있습니다.

## 데이터와 백업

- 실제 데이터는 `saveme`, 실험용은 `saveme_dev` 데이터베이스에 있습니다. 둘 다 Docker 볼륨 `saveme-pgdata` 안에 있으니 `docker compose down -v`는 쓰지 않습니다.
- 매일 21시에 `pg_dump` 백업이 네이버 MYBOX 드라이브 폴더에 저장되고, MYBOX 앱이 자동으로 올립니다.
- 백업, 복구 연습, 업데이트 방법은 [`docs/local-operations.md`](docs/local-operations.md)에 있습니다.

## 더 보기

- [`tech 기획안.md`](tech%20기획안.md): 기술 기획안 (진행 순서는 7장)
- [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html): 확정한 MVP 화면 목업
- [`AGENTS.md`](AGENTS.md): 코드 구조와 규칙 (영어, 코딩 에이전트용)
