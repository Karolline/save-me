## 결과: 완료
브랜치: task/search-rate-limit   worktree: C:\dev\save-me\.claude\worktrees\search-rate-limit

### 바꾼 것
- agent_read search / search_eval 임베딩: 조각을 글자 수 합 8000, 64개 이하 묶음으로 보냄, 429면 Retry-After(없으면 21초) 기다려 최대 6번 다시 시도(stderr 안내), 묶음마다 캐시 저장, stderr 진행 표시.
- backend/app/semantic_search.py, backend/tests/unit/test_semantic_search.py, docs/semantic-search.md(무료 계정 절), docs/testing.md

### 커밋
- 94a2b10 의미 검색: 무료 계정 속도 제한 대응

### 테스트
- backend pytest (tests/unit/test_semantic_search.py): 24 통과 (PostgreSQL). 전체 테스트는 돌리지 않았다, CI가 돈다.
- frontend 변경 없음. ruff는 설치돼 있지 않아 못 돌렸다.

### 내가 정한 것
- 구조: post_batch(HTTP 한 번, 429는 RateLimited) -> post_with_retry -> embed(묶음 나눔). chunk_vectors가 묶음을 직접 나눠 묶음마다 embed를 불러 저장(기존 embed 가짜 방식 유지).
- 묶음 나누기는 make_batches, 상수 BATCH_TOKENS/RETRY_LIMIT/DEFAULT_WAIT, 모듈 수준 sleep.
- Retry-After가 숫자가 아니면 21초. 임베딩할 것이 없어도 캐시 파일은 다시 씀(지운 항목 제거 규칙 유지).
- 진행 표시 시험을 위해 기존 API 오류 테스트의 stderr 검사를 마지막 줄 기준으로 바꿈.
