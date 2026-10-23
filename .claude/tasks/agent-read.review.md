리뷰한 커밋: 9f6ec4e

## 리뷰 결과: 합쳐도 됨

브랜치 `worktree-agent-a7ffcae5dd57923ac` (커밋 99f782c 하나), main 257dd58 대비. 브랜치가 지시서 커밋 a538f73 전에서 갈라져서, 병합할 때 퍼블리셔가 rebase하거나 fast-forward가 되는지 확인해야 한다. 지시서 파일 하나만 다르니 충돌은 없다.

### 꼭 고칠 것
- 없음.

### 고치면 좋은 것
- [.claude/settings.json] `*--dry-run*` 허용 규칙은 글자만 맞춘다. 파일 경로에 `--dry-run`이 들어 있으면(예: `x--dry-run.json`) 진짜 플래그가 없어도 실제 저장이 자동 허용된다. 막으려면 `* --dry-run*`처럼 앞에 공백을 넣고 인자 순서 시험을 다시 한다. 에이전트가 이런 이름을 쓸 가능성은 낮다.
- [.claude/settings.json deny] 거부 규칙은 앞부분만 맞춘다. `docker container exec ...`, `docker compose -f x exec ...`, `uv run python -c "import psycopg..."`는 거부에 안 걸리지만 허용에도 없어 기본 모드에서는 확인 창이 뜬다. `docker container exec*`, `docker compose * exec*`를 더하면 된다.
- [backend/app/agent_read.py:469] 기본 DB가 `DATABASE_URL`이고 값이 없으면 `saveme_dev`다. 이번 작업에서는 맞다. 2단계 에이전트가 진짜 `saveme`를 읽으려면 `DATABASE_URL=...`을 명령 앞에 붙여야 해서 허용 규칙에 안 걸리고 매번 확인 창이 뜬다. 2단계 지시서에서 정할 일(예: settings.json의 `env`, 또는 허용 규칙 넓히기).
- 실제 저장에 `ask` 대신 규칙 없음(기본 확인 창)으로 둔 개발자 판단은 타당하다(우선순위 deny > ask > allow, 와일드카드로 "dry-run 없는 것"을 쓸 수 없음). 다만 세션 권한 모드가 default일 때만 확인 창이 된다. 2단계 에이전트 frontmatter에 `bypassPermissions` 같은 넓은 `permissionMode`를 주지 않는다고 2단계 지시서에 적을 것.
- [backend/tests/unit/test_agent_read.py:295] `("experience", "1")`이 id 1이 있다고 가정한다. `data["first"].id`를 쓰면 덜 깨진다.
- [backend/tests/unit/test_agent_read.py] 후기 시드에 `follow`(꼬리질문)가 없다. 문구를 하나 심어 "기본에 없음"을 직접 확인하면 좋다. 163줄 `"1건" not in QAS_HINT`는 상수만 확인해서 의미가 없다.
- `UserStore.find_dev_user()`를 직접 시험하는 테스트는 없다(agent_read 테스트가 간접으로 덮음).

### 개발자 질문에 대한 의견 (후기의 면접관 말·꼬리질문·개요)
지금처럼 기본 출력에서 빼는 쪽이 맞다. 면접관 말·꼬리질문은 사용자가 한 일이 아니라 회사가 물은 것의 기록이라 근거가 될 수 없고, 개요는 가져온 AI 정리본일 수 있어 출처가 불분명하다. 2단계에서 "어느 회사가 무엇을 물었나"가 필요해지면 꼬리질문만 "근거 아님, 맥락"으로 따로 표시해 넣을지 그때 정한다.

### 확인한 것
- 읽기 전용: `agent_read.py`에 insert/update/delete/commit 없음. 바깥 트랜잭션을 열고 finally에서 rollback. 사용자를 만들지 않고 마이그레이션도 하지 않으며 `is_at_head`만 확인.
- 사용자 분리: 대상은 `find_dev_user()`의 id 하나, 사용자·DB를 고르는 인자 없음. 모든 읽기는 `user_id`로 거르는 기존 store 메서드. 직접 SQL 없음.
- 근거 구분: 경험 `qas`는 기본에서 개수 없이 안내 한 줄만. 후기는 kind가 `mine/retry/memo`인 것만 기본. 나머지와 개요는 `--include-reference`에서만 `⚠ 근거 아님(면접 대비 참고용)` 뒤에. `profile/personality/jobs`는 `--include-reference`를 받지 않음.
- 권한: 허용(조회, `--dry-run`)과 거부(`psql`, `docker exec`, `docker compose exec`, `--replace-verified`)가 Bash와 PowerShell 둘 다에 있음.
- 모델·마이그레이션·라우터·프런트엔드 변경 없음, 새 의존성 없음, 개인 데이터 없음, 버전 올리기 없음, 한국어 규칙 지킴.
- 테스트는 직접 돌리지 않았고 개발자 보고(25개 통과)를 믿었다. 읽어 보니 핵심(심어 둔 문구가 기본 출력에 없음, 표시 위치, 사용자 분리, 전후 스냅샷 동일)은 실제로 확인된다.
