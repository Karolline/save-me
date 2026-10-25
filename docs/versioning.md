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

1. 위의 모든 파일에서 버전을 고치고, `uv run pytest tests/unit/test_versions.py`만 돌리고 (전체 테스트는 병합 전에 작업 브랜치의 CI에서 이미 통과했고, 릴리즈 커밋은 버전 숫자만 바꾼다), 소요 시간·메모리 표를 만들어 (아래 절) 함께 커밋한다 (`Release vX.Y.Z`).
2. 그 커밋에 태그를 단다: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
3. 사용자가 `scripts/update.ps1`(백업, 다시 빌드, 마이그레이션)로 로컬 앱을 업데이트하고, 원할 때 커밋과 태그를 push한다 (`git push && git push --tags`).
4. 사용자가 부탁하면 GitHub 릴리즈 노트를 올린다. 노트는 위에서부터 **바뀐 것 → 소요 시간·메모리 표 → 이전 태그 이후 자동 변경 목록** 순서다 (v0.8.0 모양). 지시서·개발자 보고·커밋 로그를 보고 사용자가 알아볼 말로 `## 바뀐 것` 절(한 줄 소개와 `###` 소절들, 화면·API·데이터가 바뀌었으면 그 말까지)을 쓰고, 이어서 `---`와 `docs/metrics/vX.Y.Z.md`의 표(제목은 `## 소요 시간과 메모리`)를 붙여 스크래치패드의 파일 하나로 만든다. `gh release create vX.Y.Z --verify-tag --title vX.Y.Z --generate-notes --notes-file <그 파일>`: `--generate-notes`가 파일 뒤에 자동 변경 목록(`Full Changelog`)을 붙인다. 이미 올린 노트를 고칠 때는 `gh release edit`로는 자동 목록이 다시 안 만들어지므로 `gh release delete vX.Y.Z --yes`(태그는 남는다) 뒤 다시 만든다.

배포(이미지 저장소와 호스팅 환경)는 나중에 한다 (기획안 12단계). 그때 이 절이 늘어난다.

## 소요 시간과 메모리

버전(작업) 하나마다 네 단계의 걸린 시간과 최대 메모리를 재서 릴리즈 노트에 싣는다. 개발 중 PC가 느려지는 까닭(어느 단계, 어느 테스트가 무거운지)을 찾으려는 기록이다 (사용자 결정, 2026-10-22).

| 단계 | 재는 시점 | 누가 |
|---|---|---|
| 기획 (`plan`) | `/plan-task` 시작 ~ 지시서 OK를 받을 때 (사용자가 답한 시간 포함) | plan-task |
| 개발·테스트 (`dev`) | 개발자가 일을 시작 ~ 마지막 커밋과 보고 | 개발자 |
| 리뷰 (`review`) | 리뷰어를 부르기 ~ 끝 (고쳐서 다시 리뷰하면 더한다) | run-task |
| main 병합 (`merge`) | 병합 OK를 받은 뒤 ~ 병합과 정리가 끝날 때까지 (CI를 기다린 시간은 넣지 않는다. 전체 테스트는 CI가 돌려서 잴 명령이 거의 없다) | publish-task |

- 재는 도구는 [`scripts/measure.ps1`](../scripts/measure.ps1) 하나다. `-Mark start|end`로 단계의 시작·끝 시각을, `-Label ... -Cmd ...`로 명령(테스트, 린트, 빌드) 하나의 시간과 최대 메모리를 기록한다. 끝나는 코드는 그대로 나온다.
- 기록은 `private/metrics/<지시서 이름>.jsonl`에 쌓인다 (git이 무시한다. worktree에서 돌려도 메인 저장소의 같은 파일로 간다. 단계가 서로 다른 대화·에이전트에 걸쳐 있어서 파일에 쌓는다).
- 메모리는 둘이다. **프로세스 합**: 명령과 자식 프로세스의 작업 집합(working set)을 더한 값으로, 공유 메모리가 겹쳐 세어지는 대략의 위쪽 값. **PC 전체 증가**: 실행 중 PC의 사용 중인 물리 메모리가 시작 때보다 가장 많이 늘어난 양으로, Docker(WSL)의 PostgreSQL 컨테이너도 들어간다. 개발 중 PC가 느려지는 것은 보통 뒤의 값이 크고 오래 가기 때문이다.
- 릴리즈 때 표를 만든다: 저장소 맨 위에서 `python scripts/metrics_report.py <이름> --version vX.Y.Z --out docs/metrics/vX.Y.Z.md` (`python`이 없는 셸에서는 `backend/`에서 `uv run python ../scripts/metrics_report.py ...`). 이 파일을 릴리즈 커밋에 넣는다. 표를 만들고 나면 `private/metrics/<이름>.jsonl`은 지워도 된다.
- 한계: 이 기록은 **테스트·린트·빌드**의 메모리만 잰다 (개발자 에이전트가 감싸서 돌린 것만). 에이전트(Claude) 자신이 쓰는 시간·토큰은 단계 시간에는 들어 있지만 메모리에는 없다.
