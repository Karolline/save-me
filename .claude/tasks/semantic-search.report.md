## 결과: 완료
브랜치: task/semantic-search   worktree: C:\dev\save-me\.claude\worktrees\semantic-search

### 바꾼 것
- `uv run python -m app.agent_read search "<질문>" [--k N]` 추가: 경험을 섹션 조각(요약·상황·과제·행동·결과)으로 나눠 Voyage AI로 임베딩하고, 코사인 유사도 경험별 최고 점수로 위 N개(기본 5)를 보인다. 점수, 가장 가까운 섹션, 300자 자른 조각 글, `experience <ID>` 안내.
- `app.search_eval`: 질문 파일과 (선택) 고르기 파일로 recall@k·hit@k 계산, 숫자 요약 표만 화면에, 상세는 `private/search-eval/result-*.md`.
- 파일: `backend/app/semantic_search.py`(조각 나누기, urllib 임베딩, 캐시, 코사인), `backend/app/search_eval.py`, `backend/app/agent_read.py`(search 하위명령, `experience_line` 도우미로 index와 머리말 공유), `backend/.env.example`, `docs/semantic-search.md`, `AGENTS.md`, `docs/testing.md`, `backend/tests/unit/test_semantic_search.py`, `test_agent_read.py`(허용 옵션에 `--k`).
- DB 변경, 새 의존성, 프런트엔드 변경 없음.

### 커밋
- (커밋 해시는 아래 최종 커밋; 한 커밋으로 묶음)

### 테스트
- backend pytest (test_semantic_search, test_agent_read, test_agent_files): 77 통과 (PostgreSQL 테스트 DB). 전체 테스트는 돌리지 않았다, CI가 돈다.
- frontend: 건드리지 않음.

### 내가 정한 것
- 임베딩 함수는 `semantic_search.embed(texts, input_type)`, 테스트는 모듈 속성을 monkeypatch. 배치는 64개씩.
- 캐시 파일 모양: `{"entries": {"<user_id>:<경험ID>:<섹션>": {"hash", "vector"}}}`. 캐시 경로 `CACHE_DIR`, 키 파일 경로 `ENV_FILE`은 모듈 변수라 테스트에서 바꾼다. 캐시를 쓸 때 현재 사용자의 현재 조각만 남긴다.
- 해시는 `모델\n조각글`의 sha256. 조각 글은 `[이름] 섹션: 본문`(본문은 요약 조각에 이름+프로젝트+요약이 들어감).
- 경험 머리말은 `experience-index` 항목과 같은 `[id N] 이름 (기간 · 소속 · 프로젝트) - 확인됨/미확인`. 확인됨도 함께 표시.
- 빈 질문과 `--k 0`은 기존 사용법 오류(종료 2). 서버 오류는 `임베딩 API 오류: 401 Unauthorized` 형식.
- 평가: 고르기 파일에 없는 질문은 빈 고르기(0점)로 센다. 쓸 수 있는 정답이 없는 질문은 경고하고 건너뛴다. 결과 상세에는 정답/각 방식 위 k개에 O/X 표시.
- `backend/.env.example`은 없어서 새로 만들었다 (`.gitignore`의 `!.env.example`로 추적됨).
- 실제 Voyage API는 부르지 않았다 (키 없음). 응답 형식은 문서 기준(`data[].embedding`, `index`).
