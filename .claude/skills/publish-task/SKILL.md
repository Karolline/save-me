---
name: publish-task
description: 퍼블리셔. 개발자와 리뷰어가 끝낸 작업(개발자 보고와 리뷰 보고가 있는 것)을 작업 브랜치의 CI가 초록인지 확인한 뒤 main에 병합하고, 지시서의 버전으로 릴리즈한다. 리뷰는 하지 않는다(run-task가 리뷰어를 띄워 리뷰 보고를 남긴다). 사용자가 요청할 때만 push, 태그 push, 릴리즈 노트 발행까지 한다. 사용자가 /publish-task <이름>, 병합해줘, 릴리즈해줘라고 할 때 쓴다.
argument-hint: <지시서 이름>
---

# 병합과 릴리즈 (퍼블리셔)

`/run-task`가 `.claude/tasks/<이름>.md`(지시서)로 개발자와 리뷰어를 거쳤다. 이 스킬은 그 뒤를 맡는다. 새 대화에서 시작할 수 있어서 앞 단계의 대화 내용은 모른다: 지시서, 개발자 보고, 리뷰 보고가 전부다. 리뷰어를 부르거나 개발자를 다시 띄우지 않는다: 그건 `/run-task <이름>`이 한다. 사용자에게 (한국어로, 쉽게) 짧게 전한다.

## 1. 찾기

- 인자가 없으면 `.claude/tasks/`의 `*.md`(보고서 아닌 것)를 보여주고 고르게 한다.
- 개발자 브랜치와 worktree: `git worktree list`에서 지시서 이름과 맞는 것을 찾는다. 보고서는 그 worktree의 `.claude/tasks/<이름>.report.md`다. 개발자 보고(`.report.md`)가 없으면 아직 도는 중이다. 그렇다고 알리고 끝낸다.
- 보고서를 읽고 짧게 전한다: 한 일, 스스로 정한 것. 보고서가 질문을 담은 채 멈춘 것이면 그렇다고 알리고, `/run-task <이름>`으로 이어 가라고 하고 끝낸다.

## 2. 리뷰 보고 확인

worktree의 `.claude/tasks/<이름>.review.md`(리뷰 보고)를 읽는다.

- 없거나, 거기 적힌 "리뷰한 커밋" 뒤에 `.review.md` 말고 다른 파일을 바꾼 커밋이 있으면(`git diff --name-only <리뷰한 커밋> <브랜치>`) 리뷰가 안 됐거나 낡았다. 그렇다고 알리고 `/run-task <이름>`으로 리뷰부터 이어 가라고 하고 끝낸다. 여기서 리뷰어를 띄우지 않는다.
- 결과가 "합쳐도 됨"이고 "꼭 고칠 것"이 없으면 3단계로.
- 그렇지 않으면 남은 지적을 한국어로 짧게 전하고, 그래도 병합할지 사용자에게 묻는다. 병합하지 않겠다면 `/run-task <이름>`으로 고치게 하고 끝낸다. 직접 고치지 않는다.

## 3. CI 확인 (병합 전)

전체 테스트는 이 PC에서 돌리지 않고 CI가 돈다 (`AGENTS.md`의 테스트 규칙). 병합 전에 개발자 worktree의 브랜치가 끝 커밋에서 CI 초록인지 본다:

```
gh run list --branch <브랜치> --limit 1 --json databaseId,status,conclusion,headSha
git rev-parse <브랜치>
```

- 실행이 없거나 `headSha`가 브랜치 끝 커밋과 다르면(리뷰 보고서 커밋 뒤에 push하지 않았다) CI가 이 커밋을 아직 안 봤다. 사용자에게 `git push origin <브랜치>`를 부탁하고 (push는 사용자만 한다), 했다고 하면 이 단계를 다시 한다.
- `status`가 `in_progress`/`queued`면 `gh run watch <databaseId>`로 끝날 때까지 기다린다 (보통 몇 분).
- `conclusion`이 `success`면 4단계로.
- 실패면 `gh run view <databaseId> --log-failed`로 실패한 테스트 이름을 찾아 사용자에게 한국어로 짧게 전하고 멈춘다. 직접 고치지 않는다: `/run-task <이름>`으로 개발자가 고치게 한다. 고친 뒤 다시 push하면 이 단계를 다시 한다.
- `gh`가 로그인돼 있지 않으면(`gh auth status`) 사용자에게 CI가 초록인지 묻는다.

## 4. 병합

`main`에 병합하면 사용자의 main이 바뀌므로 먼저 묻는다. OK면 (사용자의 답을 기다린 시간은 재지 않도록, 묻고 OK를 받은 뒤에 시작한다):

0. 시작 기록: `powershell -NoProfile -File scripts/measure.ps1 -Name <이름> -Stage merge -Mark start`
1. 저장소 맨 위에서 `main`에 `git merge --ff-only <브랜치>`. `main`이 움직여서 fast-forward가 안 되면 worktree에서 rebase한다. 그러면 커밋이 바뀌어 CI가 본 커밋과 달라지므로, 사용자에게 `git push --force-with-lease origin <브랜치>`를 부탁하고 3단계(CI 확인)부터 다시 한다.
2. 병합이 fast-forward면 `main`은 CI가 초록으로 본 그 커밋이다. 테스트, 린트, 빌드를 다시 돌리지 않는다.
3. 지시서와 보고서(`.claude/tasks/<이름>.md`, `.report.md`, `.review.md`)를 지우는 커밋을 만든다 (기록은 git 히스토리에 남는다).
4. worktree와 로컬 브랜치를 지우고, 원격에 올라가 있던 브랜치도 지운다: `git branch -d <브랜치>`(main에 병합돼 있어야 지워진다), `git ls-remote --heads origin <브랜치>`로 원격에 있는지 보고 있으면 `git push origin --delete <브랜치>`. 병합한 작업 브랜치의 원격 삭제는 `AGENTS.md`의 "브랜치 정리" 규칙으로 묻지 않고 한다. 병합하지 않은 브랜치는 지우지 않는다.
5. 끝 기록: `powershell -NoProfile -File scripts/measure.ps1 -Name <이름> -Stage merge -Mark end`

main push는 하지 않는다 (작업 브랜치 push는 3단계에서 사용자가 한다). 원격 브랜치 삭제만 위 4번의 예외다.

## 5. 릴리즈

지시서의 "릴리즈" 절 버전으로 `docs/versioning.md`의 "버전 출시하기"를 따른다. 거기 적힌 대로 단계별 소요 시간·메모리 표(`docs/metrics/vX.Y.Z.md`)를 만들어 릴리즈 커밋에 넣는다. 전체 테스트는 CI가 이미 돌렸으므로 다시 돌리지 않는다 (버전 숫자만 바뀌므로 `uv run pytest tests/unit/test_versions.py`만). 사용자에게 버전과 이유를 한국어 한 줄로 알린다 (사용자가 semver를 자주 잊는다). 지시서가 닫을 이슈를 적었으면 릴리즈 때 닫는다.

## 6. 반영과 마무리

- 병합과 릴리즈가 끝나면 묻지 않고 돌고 있는 앱에 반영한다 (사용자 결정, 2026-10-22: 병합 후 Docker Desktop 앱에 기능이 안 보여 헷갈렸다). 저장소 맨 위에서 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update.ps1` (`saveme`를 백업하고, 이미지를 다시 빌드하고, 앱 컨테이너가 시작하며 마이그레이션한다). Docker Desktop이 꺼져 있으면 켠다. 백업이 실패하면 update.ps1이 알아서 멈춘다: 그대로 사용자에게 알리고 다시 시도하지 않는다. 끝나면 http://localhost:8100 에서 볼 수 있다고 알린다. 앱을 새로 빌드한 사실과, 이 일이 DB 마이그레이션을 포함한다는 것을 한 줄로 알린다.
- 단계에 데이터 가져오기가 있으면 이 자동 반영과 별개다: `docs/local-operations.md`대로 먼저 `saveme_dev`에 돌리고, 사용자가 화면을 확인하고, (백업 후) `saveme`에 돌린다.
- 기획안(`tech 기획안.md`) 맨 위 "남은 일 한눈에" 표에서 끝낸 일의 줄을 지운다. 만든 단계였다면 [`docs/archive/tech 기획안-완료분.md`](docs/archive/tech%20기획안-완료분.md) 7절에 한 줄(완료일, 버전, 한 일) 옮긴다 (그 줄만 `Grep -n`으로 찾아 고친다).
- 사용자가 요청한 것만 한다: 커밋 push, 태그 push, GitHub 릴리즈 노트 발행(`gh release create vX.Y.Z --generate-notes --notes-file docs/metrics/vX.Y.Z.md`: 소요 시간·메모리 표가 앞에 오고, 이어서 이전 태그 이후 커밋에서 만든 노트가 붙는다. 올린 뒤 `gh release view vX.Y.Z`로 둘 다 들어갔는지 본다). `AGENTS.md`의 "push하지 않는다" 규칙이 기본이다. 요청이 없으면 무엇을 push하면 되는지(`git push`, `git push origin vX.Y.Z`)만 알려준다.
