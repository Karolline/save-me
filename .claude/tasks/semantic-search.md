# 작업: semantic-search (이슈 #30 의미 검색)

## 목표
에이전트가 경험 카드를 태그가 아니라 의미로 찾을 수 있게 `agent_read search "<질문>"`을 더하고, 지금 방식(목록 보고 고르기)과 정답률을 비교할 평가 스크립트를 만든다. 실제 비교(질문·정답 정하기, 숫자 채우기)는 병합 뒤 메인 세션에서 사용자와 한다.

## 동작
- `uv run python -m app.agent_read search "<질문>" [--k N]` (`backend/`에서). 기존 하위 명령처럼 마크다운 출력, 맨 위 `조회 DB:` 줄 유지, 조회 대상 DB 고르는 규칙(`AGENT_READ_DATABASE_URL` → `DATABASE_URL` → `saveme_dev`)도 같다. 로컬 사용자만, `user_id`로 거른다.
- 결과는 **경험 단위**: 조각(아래 섹션)마다 질문과의 코사인 유사도를 구하고, 경험별 가장 높은 조각 점수로 경험을 정렬해 위에서 N개 (기본 5). 경험마다 다음을 보인다:
  - 제목 줄: `experience-index`와 같은 경험 머리말 (ID, 이름 등)과 사람 확인 '미확인' 표시 (index와 같은 표시 방식).
  - `점수: 0.812` (소수 셋째 자리), `가장 가까운 섹션: 행동`, 그 조각 글 (길면 300자에서 자르고 `…`).
  - 끝에 안내 한 줄: `본문은 \`experience <ID>\`로 읽는다.`
- 조각(섹션) 나누기. 빈 섹션은 만들지 않는다. 근거가 아닌 것(예상 질문·답, 프레이밍 등 `--include-reference`에서만 보이는 것)은 넣지 않는다:
  - 요약: 이름 + 프로젝트 + `summary`
  - 상황: `situation` + `scope`
  - 과제: `task`
  - 행동: `actions_intro` + 행동 항목들의 제목과 세부 내용
  - 결과: `numbers` + `result_mine` + `result_team`
  각 조각 글 앞에 경험 이름을 붙여 임베딩한다 (예: `[<이름>] 행동: ...`).
- 임베딩: Voyage AI REST API(`https://api.voyageai.com/v1/embeddings`)를 **표준 라이브러리 `urllib`로** 부른다 (새 의존성 없음). 조각은 `input_type: "document"`, 질문은 `"query"`. 모델은 환경 변수 `VOYAGE_MODEL`, 없으면 `voyage-3.5`. 한 번에 보내는 입력 수는 API 제한 안으로 나눠 보낸다.
- API 키: 환경 변수 `VOYAGE_API_KEY`, 없으면 `backend/.env` 파일의 `VOYAGE_API_KEY=` 줄을 읽는다 (search와 평가 스크립트만 이 파일을 읽는다, 간단한 줄 파서로. 새 의존성 없음). 둘 다 없으면 종료 코드 2와 함께:
  `VOYAGE_API_KEY가 없습니다. backend/.env에 VOYAGE_API_KEY=<키>를 적거나 환경 변수로 두세요. (docs/semantic-search.md)`
- API 오류(네트워크, 401, 429 등)는 traceback 없이 한 줄 메시지(`임베딩 API 오류: <상태/이유>`)와 종료 코드 1.
- 빈 질문은 기존 사용법 오류처럼 처리. 경험이 하나도 없으면 `경험이 없습니다.`
- 캐시 (DB에 쓰지 않는다. agent_read는 계속 읽기 전용): 저장소 맨 위 `private/embeddings/<DB 이름>.json` (DB 이름은 `조회 DB:`에 보이는 그 이름). 항목 키는 (user_id, 경험 ID, 섹션), 값은 내용 해시(sha256, 조각 글 + 모델 이름)와 벡터. search가 돌 때 해시가 다르거나 없는 조각만 임베딩하고, 지금 DB에 없는 경험·섹션의 항목은 지운 뒤 파일을 다시 쓴다 (임시 파일에 쓰고 바꾸기). 폴더가 없으면 만든다. 파일이 깨졌으면 무시하고 새로 만든다.
- 코사인 유사도는 Python에서 계산한다 (pgvector, numpy 쓰지 않음).
- 평가 스크립트 `uv run python -m app.search_eval <질문 파일> [--k N] [--picks <고르기 파일>]`:
  - 질문 파일(JSON, `private/search-eval/`에 둔다): `{"questions": [{"id": "q1", "question": "...", "answers": [12, 34]}]}`.
  - 고르기 파일(선택, 지금 방식의 결과): `{"picks": {"q1": [12, 7, 3]}}` — 에이전트가 `experience-index`만 보고 고른 경험 ID를 순서대로.
  - 질문마다 search 결과 위 k개(기본 5)와 고르기 위 k개로 recall@k(정답 중 맞힌 비율)와 hit@k(하나라도 맞혔나)를 구하고, 전체 평균을 낸다. k=1,3,5도 함께 (k보다 작을 때만).
  - 질문별 상세(질문 글, 정답, 두 방식의 결과)는 `private/search-eval/result-<YYYYMMDD-HHMM>.md`에 쓰고, 화면에는 개인 글 없이 숫자 요약 표만 찍는다 (방식 × k의 recall·hit 평균, 질문 수). 이 표는 그대로 docs에 붙일 수 있는 마크다운.
  - 정답이나 고르기에 있는 ID가 그 사용자의 경험이 아니면 경고 한 줄을 찍고 그 ID는 계산에서 뺀다.
  - DB는 agent_read와 같은 규칙으로 고르고, 쓰지 않는다.

## 데이터와 API
- DB 테이블·칸·마이그레이션·HTTP 엔드포인트: 없음. 프런트엔드 변경 없음.
- 새 의존성 없음 (`urllib`, `hashlib`, `json`, `math`만).
- 임베딩 부르는 부분은 함수 하나로 분리해 테스트에서 가짜로 바꿀 수 있게 한다 (예: `embed(texts, input_type) -> list[list[float]]`를 인자로 넘기거나 모듈 수준에서 바꿔 끼우기).

## 끝났다고 보는 조건
- 테스트는 실제 API를 부르지 않는다 (가짜 임베딩: 단어 겹침 기반의 결정적 벡터 등). 테스트가 다음을 확인한다:
  - 섹션 나누기 (빈 섹션 없음, 참고용 칸 제외, 이름 접두).
  - 코사인과 경험 단위 정렬, `--k`, 점수 표시, 300자 자르기, 미확인 표시.
  - 캐시: 두 번째 실행은 임베딩을 다시 부르지 않음, 카드 하나를 바꾸면 그 조각만 다시 부름, 지운 경험은 캐시에서 빠짐, 깨진 캐시 파일에서 복구. 캐시 경로는 테스트에서 임시 폴더.
  - 다른 사용자의 경험은 결과와 캐시에 나오지 않는다.
  - 키 없음 메시지와 종료 코드, API 오류 메시지 (urllib 호출을 가짜로).
  - 평가 스크립트: recall@k·hit@k 계산, 남의/없는 ID 경고, 결과 파일과 요약 표.
  - DB에 닿는 테스트는 PostgreSQL 테스트 DB에서 (`docs/testing.md`).
- `docs/semantic-search.md` (한국어): 무엇을 하는지, 키 넣는 법(`backend/.env`), **경험 원문(조각 글)과 질문이 Voyage AI로 나간다는 점**, 캐시 위치와 다시 임베딩 규칙, 평가 방법(질문 파일·고르기 파일 형식, 지금 방식의 고르기는 에이전트가 `experience-index`만 보고 질문마다 경험 ID를 위에서부터 고르게 한다, 개인 글은 `private/`에만), 비어 있는 "결과" 절 (병합 뒤 숫자 요약을 채운다).
- `AGENTS.md`의 "에이전트의 조회" 목록에 `search "<질문>" [--k N]`를 더하고 한 줄 설명과 `docs/semantic-search.md` 링크. `agent_read.py` 맨 위 도움말·사용법도 맞춘다.
- `.env.example`이 있으면 `VOYAGE_API_KEY=` 줄을 더하고, 없으면 `backend/.env.example`을 그 한 줄(과 주석)로 만든다.
- 백엔드 해당 테스트 통과 (전체는 CI).

## 화면
- 없음 (명령줄 출력만).

## 하지 않을 것
- DB 테이블·마이그레이션, pgvector, numpy, `voyageai` 패키지 등 새 의존성.
- 면접 후기 등 경험 아닌 것의 검색 (나중에).
- 에이전트 파일(`.claude/agents/*`)과 `docs/agent-rules/`에 search 사용 지시 넣기 (비교 결과를 보고 따로 정한다).
- 질문·정답 목록 만들기와 실제 비교 실행 (병합 뒤 사용자와).
- 테스트에서 실제 API 호출, API 키나 개인 데이터 커밋.
- 버전 올리기.

## 사용자와 정한 것
- 벡터 저장: DB가 아니라 `private/embeddings/<DB 이름>.json` 파일 캐시 (이슈의 "PostgreSQL 컬럼"에서 바꿈: agent_read를 읽기 전용으로 두고 진짜 DB 쓰기·마이그레이션을 피하려고).
- Voyage 호출: 표준 라이브러리 `urllib` (새 의존성 없음).
- 이 작업 범위: 검색 도구 + 평가 스크립트 + 문서의 방법 절까지. 질문·정답 작성과 비교 실행은 병합 뒤 메인 세션에서.
- API 키: `backend/.env` (또는 환경 변수 `VOYAGE_API_KEY`).
- 에이전트 파일에 search 사용법은 비교 뒤에 결정.
- 기본 k: 경험 5개 (조각을 경험별로 묶음). recall도 경험 단위.

## 릴리즈
- 버전 v0.11.0 (MINOR: 에이전트 조회에 새 명령 `search`가 생기는 새 기능). 버전을 올리지 않는다: 병합할 때 퍼블리셔가 한다.
