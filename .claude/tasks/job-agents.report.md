## 결과: 완료
브랜치: worktree-agent-a73494a427c39aa8d   worktree: C:\dev\save-me\.claude\worktrees\agent-a73494a427c39aa8d

### 바꾼 것
- 에이전트 4개 (`.claude/agents/`): `job-analyst`, `doc-writer`, `risk-checker`, `doc-reviewer`. frontmatter는 `name`, 한국어 `description`, `model: opus`, 지시서 표의 `tools`, `permissionMode` 없음. 절대 규칙 블록(없는 경험·수치를 만들지 않는다 / 예상 질문과 답변·AI 첨언은 근거 아님 / 프레이밍 주의 / 본인이 하지 않은 일 / 다시 답한다면)을 4개 본문에 각각 넣었고, 저장 명령·`--replace-verified`·DB 직접 접속은 "쓰지 않는다"로 적었다.
- 공통 규칙 `docs/agent-rules/`: `job-matching.md`(절차, 핏·성향 루브릭, 회사 동향, 부각할 경험), `writing-rules.md`(형식 규칙, 메인 세션용 0~8단계, 저장 정리, 경력기술서 앱 저장은 `--dry-run`까지 한 줄), `frequent-questions.md`(지원동기·직무 적합 이유 공식).
- `agent_read`: `job <ID>`(양식 순서 전체), `job <ID> --reader`(공고 원문+회사 동향), `AGENT_READ_DATABASE_URL` > `DATABASE_URL` > `saveme_dev`, 출력 맨 위 `조회 DB: <이름>`. `.claude/settings.json`에 `env.AGENT_READ_DATABASE_URL`(진짜 DB `saveme`).
- 문서: `AGENTS.md`("에이전트의 조회" 항목 수정, 에이전트 절에 4개 안내), `docs/testing.md` 표.
- 파일: `backend/app/agent_read.py`, `backend/tests/unit/test_agent_read.py`, `backend/tests/unit/test_agent_files.py`.

### 커밋
- (커밋 해시는 아래 최종 보고에 추가)

### 테스트
- backend pytest (`test_agent_read.py`, `test_agent_files.py`, `test_import_confirm.py`; PostgreSQL 임시 컨테이너): 147 통과.
- 이 저장소의 백엔드 테스트는 모두 PostgreSQL이라 유닛과 통합이 따로 없다. 남의 공고 분리 테스트(`test_other_users_job_is_not_found`)도 같은 파일에 있다.
- 프런트엔드는 바뀌지 않아 돌리지 않았다. 백엔드 린터(`ruff`)는 저장소에 설정이 없어 돌리지 못했다. 전체 테스트는 돌리지 않았다, CI가 돈다. 마이그레이션은 건드리지 않았다.
- 모든 테스트와 확인을 `scripts/measure.ps1`로 감쌌다.

### 수동 확인 (saveme_dev)
- `saveme_dev`에 가짜 회사 "시험상사" 공고 1건(`private/inbox/jobs/`에 `docs/job-inbox.md` 양식의 .md를 쓰고 SKILL.md 표대로 .json으로 변환)과 경험 1건을 가져왔다. 변환한 JSON은 `app.importers.jobs --dry-run`을 통과했다("추가 1"). 이어서 `saveme_dev`에만 실제로 넣었다.
- `AGENT_READ_DATABASE_URL=...saveme_dev`로 `job 8`: 맨 위 `조회 DB: saveme_dev`, 그 뒤 양식 순서(기본 정보, 한 줄 결론, 지원 조건, 요구사항, 핏 평가, 성향 적합도, 부각할 경험, 약한 부분, 갭, 보완 제안, 역질문, 확인 필요, 회사 동향, 기타 메모, 공고 원문 맨 끝)가 그대로 나왔다. `--reader`는 처음에 어필 포인트(지원자의 기여·근거 경험)까지 냈다가, 아래 결정대로 회사 조사(조사 메모, 동향, 방향)와 공고 원문만 나오게 고쳤고 단위 테스트가 지킨다. `job 999`는 안내 한 줄과 종료 코드 1.
- 시험 데이터(공고 id 8, 경험 id 38)는 `saveme_dev`에서 지웠고 `private/` 임시 파일도 지웠다(커밋 없음). 진짜 `saveme`에는 아무것도 쓰지 않았다.
- 서브에이전트 실제 실행은 병합 뒤 사용자가 `job-analyst`부터 써 보며 확인한다.
- 고유명사 Grep: `.claude/agents/`와 `docs/agent-rules/`에 원본의 회사명, `N:\`, 서류 파일명, 분석 HTML 흔적은 없다 (남은 "분석 HTML·대시보드는 하지 않는다"는 금지 문장). 지시서가 요구한 `타인참조자료-` 접두사는 `doc-writer.md`에 있다.

### 내가 정한 것
- worktree가 옛 main(v0.7.4)에서 만들어져 `agent_read`가 없어서, `main`을 fast-forward로 가져온 뒤 시작했다(기록 없는 새 커밋 없음).
- `--reader`에서 `어필 포인트`와 `어필 포인트로 쓰지 않은 것`은 뺐다: 지원자의 기여와 근거 경험이라 면접관이 모르는 것이고, 지시서도 "근거 경험은 나오지 않는다"고 했다. 지시서의 "회사 동향"을 회사에 대한 조사(메모, 동향 줄, 방향)로 읽은 것이다. 반대로 읽어야 하면 `job_trend_lines`의 `reader` 분기만 지우면 된다.
- `job <ID>` 맨 위에 양식의 `---` 블록 대신 `- 회사:` 같은 목록(`agent_read`의 다른 출력과 같은 모양)을 썼고, 거기 `사람 확인: Y(확인됨)/N(미확인)`과 연결된 지원 건을 더했다. 그 밖의 섹션 제목·순서·값(`[충족]` 등)은 `docs/job-inbox.md` 그대로. 값이 빈 섹션은 제목째 뺀다.
- 조회 DB 이름은 성공한 출력 stdout 맨 위에만 붙인다(실패 메시지는 stderr 그대로). `AGENT_READ_DATABASE_URL`이 빈 문자열이면 없는 것으로 본다.
- 원본의 `기본정보`(입사 시기, 선호 업무 환경), `개발 프로세스`, `근거 없는 영역`은 앱에 없는 칸이라, `profile`(현재 상태, 희망 직무, 커리어 방향, 기술 스택)에서 읽을 수 있는 만큼만 쓰게 하고, 비어 있으면 "확인 필요"로 남기게 했다. 성향 루브릭은 원본 그대로이고 기준 출처만 `profile`로 바꿨다.
- 원본의 "유형별 작성 기준(사용하며 쌓는 중)"은 작성자가 읽는 `doc-writer.md`에 두고, 메인 세션이 거기에 더하게 했다(`writing-rules.md`에 한 줄). 원본 샘플 속 사용자의 기술 예시(소제목 예시 등)는 일반 예시로 바꿨다.
- 원본의 회사 동향 4개 관점·어필 포인트 규칙은 `job-matching.md`에, 출력 형식은 `docs/job-inbox.md`(양식 기준)로 대신했다. 원본의 `조사 실패` 표기는 `자료 없음` + 조사 메모에 실패 사실로 바꿨다(양식에 없는 값 방지).
- `doc-reviewer`의 Bash는 `agent_read job <ID> --reader` 한 가지로 제한했다(본문에 규칙, 테스트로 확인). 권한 규칙으로 강제하지는 않는다.
- 에이전트 정의 테스트(`test_agent_files.py`)는 PyYAML 의존 없이 frontmatter를 직접 읽는다.

### 질문
- 없음.
