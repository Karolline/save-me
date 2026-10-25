# 작업: mockup-pages

## 목표
확정 목업(`docs/archive/mockup/saveme-mvp.html`)을 GitHub Pages로 제공해서, 저장소를 열지 않고 주소 하나로 목업을 볼 수 있게 한다 (이슈 #25).

## 동작
- `main`에 push될 때(그리고 수동 실행) GitHub Actions가 목업만 Pages로 배포한다: `.github/workflows/pages.yml`.
  - 배포 폴더(예: 빌드 중 임시 `_site/`)에 `saveme-mvp.html`을 `index.html`로 복사해 올린다. `docs/` 나머지(기획 문서)는 올리지 않는다.
  - 공식 액션 `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`를 쓰고, 권한은 `pages: write`, `id-token: write`, `contents: read`. 기존 파일의 액션 버전 표기 방식을 따른다.
  - `paths`는 `docs/archive/mockup/**`와 이 워크플로 파일로 한정한다 (목업이 바뀔 때만 배포).
  - `concurrency` 그룹을 두고 배포끼리는 취소하지 않는다.
- 배포 주소는 `https://<사용자>.github.io/save-me/`. 저장소 이름과 사용자는 `git remote`/`gh`로 확인해 README에 적는다.
- `README.md`의 목업 줄(68행 근처)에 배포 주소를 함께 적는다.
- `docs/`에 한국어로 짧은 안내(예: `docs/mockup-pages.md`)를 둔다: 어떻게 배포되는지, 사용자가 한 번 해야 하는 설정(저장소 Settings → Pages → Source를 "GitHub Actions"로), 목업을 고치면 자동으로 다시 배포됨.

## 데이터와 API
- 없음.

## 끝났다고 보는 조건
- 워크플로 YAML이 문법 오류 없이 읽힌다 (예: `python -c "import yaml..."`로 파싱).
- 배포 폴더를 로컬에서 만들어 `index.html`이 목업과 같은 내용인지 확인한다.
- 앱 코드는 바뀌지 않으므로 앱 테스트는 돌리지 않는다. CI는 push 후 사용자가 확인한다.
- 올리기 전에 목업을 이메일·전화번호·실명 패턴으로 훑어 개인정보가 없는지 확인하고, 있으면 멈추고 보고서에 적는다.

## 화면
- 해당 없음 (목업 파일 자체를 그대로 올린다. 수정하지 않는다).

## 하지 않을 것
- 목업 내용 수정, 앱 코드 변경, 새 의존성.
- `docs/` 전체 공개.
- 저장소 Settings 변경 (사용자가 직접 한다), push.

## 사용자와 정한 것
- 배포는 GitHub Actions 방식 (`/docs` 폴더 방식 아님).
- 목업은 가짜 데이터라 공개해도 된다 (그래도 개발자는 패턴 점검).
- 버전은 올리지 않는다 (앱 코드 변경 없음). 퍼블리셔는 태그 없이 병합한다.

## 릴리즈
- 릴리즈 없음 (버전을 올리지 않는다. 앱 코드가 바뀌지 않고 배포 설정과 문서만 바뀐다).
