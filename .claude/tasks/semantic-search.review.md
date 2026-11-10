리뷰한 커밋: 93665bc

## 리뷰 결과: 합쳐도 됨

브랜치 `task/semantic-search`(끝 커밋 93665bc)를 지시서에 비춰 읽었다. 꼭 고칠 문제는 없다. 실제 API 호출 없음, user_id와 캐시 분리, 키·개인 데이터 미커밋, 새 의존성 없음, agent_read의 DB 읽기 전용을 모두 확인했다.

### 꼭 고칠 것
- 없음

### 고치면 좋은 것
- [`.claude/settings.json`:7,10] `uv run python -m app.agent_read*`가 자동 허용이다. 그래서 에이전트가 사람 확인 없이 `search`를 돌릴 수 있고, 기본 조회 DB가 진짜 DB `saveme`라 진짜 경험 원문이 Voyage AI로 나간다. 지시서 범위 밖이라 결함은 아니고 사용자가 정할 일이다 (예: `agent_read search*`만 확인 받기). 에이전트 파일에 search 사용 지시를 넣을 때 함께 정하면 된다.
- [`AGENTS.md`의 "에이전트의 조회" 줄] "이 변수(`AGENT_READ_DATABASE_URL`)는 `agent_read`만 읽는다"인데, 이제 `app.search_eval`도 `read_database_url()`로 이 변수를 읽는다. 동작은 지시서대로 맞고 문장만 고치면 된다.
- [`backend/tests/unit/test_semantic_search.py`:282] 평가 테스트가 "없는 ID"(99999) 경고만 본다. 지시서는 "남의/없는 ID 경고"다. 코드는 두 경우를 같은 길(`valid` 집합)로 다루니 동작은 맞지만, 다른 사용자의 경험 ID 경우를 하나 더하면 좋다.
- [`backend/app/search_eval.py`:147] 고르기 파일의 맨 위가 객체가 아니면(예: 배열) `.get`에서 traceback이 난다. 질문 파일은 이 경우를 막는다. 사람이 손으로 만드는 파일이라 작은 일이다.

### 테스트
- 직접 돌린 테스트는 없다. 개발자 보고(test_semantic_search, test_agent_read, test_agent_files를 PostgreSQL에서 돌려 77개 통과)를 믿었고, 테스트 코드를 읽어 의심스러운 곳이 없었다.

### 확인한 것
- **실제 API 호출 없음.**
  - `calls` fixture가 `semantic_search.embed`를 가짜로 바꿔 끼운다.
  - 키 없음 테스트는 네트워크에 가기 전에 끝난다.
  - API 오류·배치 테스트는 `urlopen`을 가짜로 바꾼다.
  - 캐시와 결과는 `tmp_path`에 쓴다.
- **user_id와 캐시.**
  - 경험은 `stores.experiences.list/get(user_id, …)`로만 읽는다.
  - 캐시 키는 `"<user_id>:<경험ID>:<섹션>"`이고, 저장할 때 지금 사용자의 지금 조각만 남긴다.
  - 캐시에는 해시와 벡터만 있고 글은 없다.
  - 남의 경험이 결과·캐시·임베딩 입력 어디에도 없다는 테스트가 있다.
- **키와 개인 데이터.**
  - `.env`, `private/`, 덤프가 커밋되지 않았다. `.env.example`은 빈 키만 담는다.
  - `search_eval`은 화면에 숫자와 ID만 찍는다.
- **새 의존성 없음.** `pyproject.toml`과 `uv.lock`이 바뀌지 않았다.
- **DB에 쓰지 않음.**
  - 검색은 rollback 구조 안에서 읽기만 한다.
  - 파일 쓰기는 `private/embeddings/<DB>.json` 하나이고, 임시 파일에 쓴 뒤 `os.replace`로 바꾼다.
- **지시서와 맞음.**
  - 조각 나누기: 섹션 다섯 개, 빈 섹션과 참고용 칸 제외, `[이름]` 접두.
  - 출력: 경험 단위 정렬, 기본 k는 5, 점수는 소수 셋째 자리, 조각 글은 300자에서 자름.
  - 머리말은 `experience-index`와 같은 도우미를 쓴다.
  - 종료 코드와 메시지: 지시서와 같다.
  - 해시에 모델 이름이 들어 있고, 깨진 캐시는 새로 만든다. 배치는 64개씩이다.
- **평가 스크립트.** recall@k와 hit@k, 함께 내는 k 1·3·5, 경고, 결과 파일, 요약 표가 지시서대로다.
- **언어·문서·규칙.**
  - 글은 한국어, 식별자는 영어다.
  - `docs/semantic-search.md`, `AGENTS.md`, `agent_read` 도움말, `docs/testing.md`를 갱신했다.
  - 버전을 올리지 않았고 push하지 않았다.
