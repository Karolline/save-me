# 작업: questions

## 목표
사용자가 면접에서 자주 나오는 질문의 유형과 "어떻게 답하면 좋은지"를 손으로 적어 한곳에 모아 두는 `/questions` 화면을 만든다. 기록한 내용은 AI 에이전트(자소서 작성 등)가 읽어 서류에 반영한다. (이슈 #15)

## 동작
- 사이드바 "빈출질문"(`menu.ts`)의 `on`을 켠다. 경로 `/questions`(목록), `/questions/new`(새로 쓰기), `/questions/$id`(보기), `/questions/$id/edit`(고치기).
- 목록: 빈출질문 카드들을 사용자가 정한 순서로 보인다. 카드에는 유형(제목)과 질문 예시 한 줄, 답하는 방법 앞부분을 보인다. 위에 [+ 새 빈출질문] 단추. 목록에서 카드를 위/아래로 옮겨 순서를 바꿀 수 있다 (hover가 아닌 단추).
- 빈 목록 글: "아직 적어 둔 빈출질문이 없습니다. 자주 나오는 질문 유형과 답하는 방법을 적어 두세요."
- 보기 화면: 칸 이름과 내용을 읽기 좋게 보이고, [고치기] [지우기] 단추. 지우기는 확인 창("이 빈출질문을 지울까요?") 뒤에 지운다.
- 쓰기·고치기 화면 칸: 
  1. 질문 유형 (한 줄, 필수. 예: 지원동기). 비어 있으면 저장 못 하고 "질문 유형을 적어 주세요."
  2. 질문 예시 (여러 줄, 선택. 예: 우리 회사에 왜 지원했나요?)
  3. 답하는 방법 (여러 줄, 선택)
  4. 좋은 답 예시 (여러 줄, 선택)
  5. 피할 것 (여러 줄, 선택)
  - [저장] [취소]. 저장하면 보기 화면으로. 면접후기의 쓰기·보기·목록 화면(`ReviewsScreen`, `ReviewViewScreen`, `ReviewEditScreen`)과 같은 구성·스타일 패턴을 따른다.
- 아주 긴 글도 저장된다 (Text).

## 데이터와 API
- 새 테이블 `frequent_questions` (user_id ON DELETE CASCADE, `position`, `kind`(유형), `example`, `how_to`, `good_example`, `avoid`, created_at, updated_at). Alembic 마이그레이션 + `tests/unit/test_migrations.py`.
- 엔드포인트 `/api/questions`: GET 목록, POST 만들기, GET/PUT/DELETE `/{id}`, 순서 바꾸기(`PUT /api/questions/order` 또는 이동 엔드포인트, 기존 패턴을 따른다). 모두 `current_user`와 `require_csrf_header`. 남의 id는 404. store는 `app/stores/questions.py`, Pydantic은 `app/models.py`(camelCase).
- 프런트엔드: `types.ts`, `httpService.ts`, `mockService.ts`(같은 동작)에 추가.
- 에이전트 조회: `uv run python -m app.agent_read questions` (조회 전용, 마크다운, 순서대로 유형·예시·답하는 방법·좋은 답 예시·피할 것). `docs`의 에이전트 안내(`AGENTS.md`의 agent_read 목록, `app/agent_read.py` 도움말, 필요하면 `doc-writer` 에이전트 파일)에 `questions`를 더한다. `.claude/settings.json`의 조회 자동 허용에 같은 형태로 넣는다.
- 가져오기 코드는 만들지 않는다.

## 끝났다고 보는 조건
- 목록·보기·쓰기·고치기·지우기·순서 바꾸기가 동작하고 새로고침 뒤에도 남는다.
- 유형이 비면 저장되지 않는다 (프런트엔드와 백엔드 둘 다).
- 테스트: 백엔드 store·라우터(남의 데이터 404 포함), 마이그레이션, agent_read questions, 프런트엔드 mock·http 서비스, 화면 테스트. 건드린 영역의 테스트, 빌드, 린트를 돌린다.
- 메뉴 "빈출질문"이 더는 흐리지 않고 눌린다. 입력 칸은 16px 이상.

## 화면
- 확정 목업에 이 화면이 없다. 면접후기(`SCREENS "reviews"`, `ReviewsScreen` 등)와 같은 목록 → 보기 → 고치기 구성·클래스·색을 재사용해 만든다.

## 하지 않을 것
- 면접후기·경험·공고분석의 질문을 자동으로 모으거나 빈도를 세지 않는다. 같은 질문 묶기 없음.
- 모바일 레이아웃, AI가 질문을 만들어 주는 기능, 가져오기, 서버 PDF.

## 사용자와 정한 것
- 화면은 기존 데이터 기반이 아니라 사용자가 손으로 질문 유형과 답하는 방법을 기록하는 곳이다.
- 칸: 질문 유형 + 질문 예시 + 답하는 방법 + 좋은 답 예시 + 피할 것.
- 목록 + 상세 화면 (면접후기처럼).
- AI 에이전트가 읽게 한다 (`agent_read questions`). 사용자는 이를 근거로 AI에게 자소서를 쓰게 할 것이다.
- 즐겨찾기·검색·같은 질문 묶기는 필요 없다.

## 릴리즈
- 버전 v0.10.0 (MINOR: 새 메뉴 화면이 켜진다). 버전을 올리지 않는다: 병합할 때 퍼블리셔가 한다.
