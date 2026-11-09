## 결과: 완료
브랜치: task/questions   worktree: C:\dev\save-me\.claude\worktrees\questions

### 바꾼 것
- 사이드바 "빈출질문"이 켜져 눌린다. `/questions`(목록), `/questions/new`, `/questions/$id`(보기), `/questions/$id/edit`.
  - 목록: 사용자가 정한 순서의 카드(유형, 질문 예시 한 줄, 답하는 방법 앞부분), [+ 새 빈출질문], 카드마다 ▲▼ 단추로 순서 바꾸기(맨 위·아래는 꺼짐). 빈 목록 글은 지시서 그대로.
  - 보기: 다섯 칸을 읽기 좋게(빈 칸은 "적지 않았어요"), [고치기] [지우기](확인 창 "이 빈출질문을 지울까요?").
  - 쓰기·고치기: 질문 유형(필수, 비면 "질문 유형을 적어 주세요."), 질문 예시, 답하는 방법, 좋은 답 예시, 피할 것. [저장] [취소], 저장하면 보기로.
- 백엔드: 새 테이블 `frequent_questions`(user_id CASCADE, position, kind, example, how_to, good_example, avoid, created_at, updated_at, 마이그레이션 b3e8a1c4d5f2), `app/stores/questions.py`, `app/routers/questions.py`(`/api/questions` GET/POST, GET/PUT/DELETE `/{id}`, `PUT /order`), Pydantic `FrequentQuestion*`(camelCase). 유형이 비면 422. 남의 id는 404.
- `agent_read questions`: 유형·질문 예시·답하는 방법·좋은 답 예시·피할 것을 순서대로 마크다운으로. 도움말, 모듈 설명, `AGENTS.md` 목록, `doc-writer` 에이전트(조회 명령과 빈출문항 단계)에 더함.
- 프런트엔드: `types.ts`, `httpService.ts`, `mockService.ts`에 같은 동작으로 추가. 화면은 `QuestionsScreen`, `QuestionViewScreen`, `QuestionEditScreen`(면접후기와 같은 `ph`, `card`, `rp`, `rp-foot`, `ConfirmDialog`), `lib/questions.ts`, `styles.css`에 `.fq*` 몇 줄.
- 문서: `docs/testing.md` 표, `tech 기획안.md`의 빈출질문 줄.

### 커밋
- cd9a8da 빈출질문: 테이블, store, /api/questions, agent_read questions
- e32399c 빈출질문 화면: 목록·보기·쓰기·고치기·순서 바꾸기, 서비스(HTTP, mock), 메뉴 켬, 문서

### 테스트
- backend pytest (PostgreSQL, 임시 컨테이너): test_question_store, test_questions_api, test_agent_read, test_migrations, test_agent_files 81개 통과.
- frontend test: questions, mockService, httpService, screens, router 106개 통과. `npm run build` 통과, `npm run lint` 오류 없음(기존 경고만).
- 전체 테스트는 돌리지 않았다, CI가 돈다.

### 내가 정한 것
- 순서 바꾸기 엔드포인트는 `PUT /api/questions/order` 본문 `{ids:[...]}`. 내 빈출질문 전부를 겹침 없이 줘야 하고, 아니면(남의 id 포함) 404. `/{id}`보다 먼저 선언.
- 새 빈출질문은 맨 뒤(position 최댓값+1), 지우면 남은 것의 position을 0부터 다시 매김.
- 유형은 앞뒤 공백을 떼어 저장. 나머지 칸은 그대로.
- 마이그레이션은 autogenerate 대신 손으로 썼다(`test_migrations`의 head가 모델과 같음 확인으로 대신 검증). 날짜 칸은 다른 마이그레이션처럼 `sa.DateTime()`.
- `.claude/settings.json`은 이미 `agent_read*`를 통째로 허용하고 있어서 고치지 않았다.
- 순서 단추는 ▲▼ 글자 단추(aria-label "<유형> 위로/아래로 옮기기"), 목록 카드 전체를 누르면 보기로 간다.
- 보기에서 지우기 단추는 [고치기] 옆에 바로 두었다(후기의 "…" 메뉴 없이, 지시서의 [고치기] [지우기]).
- `tech 기획안.md` 남은 일 표의 빈출질문 줄을 "만듦"으로 고쳤다.
- 가져오기·모바일·PDF는 만들지 않았다. 버전은 올리지 않았다.
