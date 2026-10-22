---
name: publish-task
description: 퍼블리셔. 개발자 에이전트가 끝낸 작업을 리뷰하고, main에 병합하고, 지시서의 버전으로 릴리즈한다. 사용자가 요청할 때만 push, 태그 push, 릴리즈 노트 발행까지 한다. 사용자가 /publish-task <이름>, 병합해줘, 릴리즈해줘, 개발자가 끝났어라고 할 때 쓴다.
argument-hint: <지시서 이름>
---

# 병합과 릴리즈 (퍼블리셔)

`/plan-task`가 `.claude/tasks/<이름>.md`(지시서)를 쓰고 개발자를 띄웠다. 이 스킬은 그 뒤를 맡는다. 새 대화에서 시작하는 것을 전제로, 기획 대화의 내용은 모른다: 지시서와 개발자 보고가 전부다. 사용자에게 (한국어로, 쉽게) 짧게 전한다.

## 1. 찾기

- 인자가 없으면 `.claude/tasks/`의 `*.md`(보고서 아닌 것)를 보여주고 고르게 한다.
- 개발자 브랜치와 worktree: `git worktree list`에서 지시서 이름과 맞는 것을 찾는다. 보고서는 그 worktree의 `.claude/tasks/<이름>.report.md`다. 개발자가 아직 도는 중이면(보고서가 없다) 그렇다고 알리고 끝낸다.
- 보고서를 읽고 짧게 전한다: 한 일, 스스로 정한 것, 멈췄다면 질문. 멈춘 경우 질문은 사용자와 답을 정하고, 답을 지시서의 "사용자와 정한 것"에 더해(main에 커밋) 개발자를 같은 브랜치에서 다시 띄운다 (`subagent_type: "developer"`, 백그라운드, 프롬프트: 지시서 경로와 브랜치·worktree 경로, 답). 그리고 끝낸다: 다시 끝나면 `/publish-task`를 다시 부르게 한다.

## 2. 리뷰

브랜치에 리뷰어 에이전트(`subagent_type: "reviewer"`)를 돌린다. 브랜치 이름, worktree 경로, 지시서 경로를 준다. 이미 이 브랜치를 리뷰했고 그 뒤 커밋이 없으면 건너뛴다.

꼭 고칠 지적이 있으면 개발자를 다시 띄워(위와 같이, 지적을 프롬프트에 담아) 고치게 하고 끝낸다. 고쳐지면 `/publish-task`를 다시 불러 리뷰부터 이어 간다. 직접 고치지 않는다.

## 3. 병합

`main`에 병합하면 사용자의 main이 바뀌므로 먼저 묻는다. OK면:

1. 저장소 맨 위에서 `main`에 `git merge --ff-only <브랜치>`. `main`이 움직였으면 먼저 worktree에서 rebase하고 개발자가 건드린 영역의 테스트를 다시 돌린다.
2. `main`에서 모든 테스트: 백엔드 `uv run pytest`, 프런트엔드 `npm test`, `npm run lint`, `npm run build`. 전체는 여기서 한 번이다.
3. 지시서와 보고서(`.claude/tasks/<이름>.md`, `.report.md`)를 지우는 커밋을 만든다 (기록은 git 히스토리에 남는다).
4. worktree와 브랜치를 지운다.

push는 하지 않는다.

## 4. 릴리즈

지시서의 "릴리즈" 절 버전으로 `docs/versioning.md`의 "Releasing a version"을 따른다. 전체 테스트는 다시 돌리지 않는다 (버전 숫자만 바뀌므로 `uv run pytest tests/unit/test_versions.py`만). 사용자에게 버전과 이유를 한국어 한 줄로 알린다 (사용자가 semver를 자주 잊는다). 지시서가 닫을 이슈를 적었으면 릴리즈 때 닫는다.

## 5. 반영과 마무리

- 돌고 있는 앱에 반영하는 법을 알려준다: `scripts/update.ps1` (백업하고, 다시 빌드하고, 마이그레이션한다). 단계에 데이터 가져오기가 있으면 `docs/local-operations.md`대로 먼저 `saveme_dev`에 돌리고, 사용자가 화면을 확인하고, (백업 후) `saveme`에 돌린다.
- 기획안(`tech 기획안.md`) 맨 위 "남은 일 한눈에" 표에서 끝낸 일의 줄을 지운다. 만든 단계였다면 [`docs/archive/tech 기획안-완료분.md`](docs/archive/tech%20기획안-완료분.md) 7절에 한 줄(완료일, 버전, 한 일) 옮긴다 (그 줄만 `Grep -n`으로 찾아 고친다).
- 사용자가 요청한 것만 한다: 커밋 push, 태그 push, GitHub 릴리즈 노트 발행(`gh release create`, 노트는 `CHANGELOG.md`의 그 버전에서). `AGENTS.md`의 "push하지 않는다" 규칙이 기본이다. 요청이 없으면 무엇을 push하면 되는지(`git push`, `git push origin vX.Y.Z`)만 알려준다.
