# 버전 관리

앱의 버전은 `MAJOR.MINOR.PATCH` 하나다 ([유의적 버전](https://semver.org/lang/ko/)). 프런트엔드, 백엔드, API 약속이 같은 버전을 쓴다.

## 어느 숫자를 올리나

| 올리는 것 | 언제 | 예 |
|---|---|---|
| MAJOR (`1.0.0`) | 앱을 쓰는 방식이나 저장된 데이터를 깨는 변경, 또는 첫 공개 출시 | 누구나 가입하게 열 때 |
| MINOR (`0.2.0`) | 새 기능이나 새 메뉴 | 면접후기, 공고분석 |
| PATCH (`0.1.1`) | 고친 것, 또는 있는 화면의 동작을 조금 바꾼 것 | 통계 줄의 잘못된 개수 |

하나를 올리면 그 오른쪽 숫자는 0으로 돌아간다 (`1.2.3` → `1.3.0`).

## 버전이 적힌 곳

모두 같아야 한다. 다르면 `backend/tests/unit/test_versions.py`가 실패한다.

- `backend/pyproject.toml`의 `version`. 고친 뒤 `backend/`에서 `uv lock`을 돌려 `uv.lock`을 맞춘다.
- `backend/app/main.py`의 `FastAPI(..., version=...)` (`/docs`에 보인다)
- `frontend/package.json`: `frontend/`에서 `npm version X.Y.Z --no-git-tag-version`을 돌린다 (`package-lock.json`도 같이 바뀐다). `vite.config.ts`가 이 값을 `__APP_VERSION__`으로 읽어 사이드바에 보여 준다.

## 버전 출시하기

1. 위의 모든 파일에서 버전을 고치고, `uv run pytest tests/unit/test_versions.py`만 돌리고 (전체 테스트는 병합 뒤 `main`에서 이미 통과했고, 릴리즈 커밋은 버전 숫자만 바꾼다), 커밋한다 (`Release vX.Y.Z`).
2. 그 커밋에 태그를 단다: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
3. 사용자가 `scripts/update.ps1`(백업, 다시 빌드, 마이그레이션)로 로컬 앱을 업데이트하고, 원할 때 커밋과 태그를 push한다 (`git push && git push --tags`).

배포(이미지 저장소와 호스팅 환경)는 나중에 한다 (기획안 12단계). 그때 이 절이 늘어난다.
