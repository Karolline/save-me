## 결과: 완료
브랜치: task/career-dates   worktree: C:\dev\save-me\.claude\worktrees\career-dates

### 바꾼 것
- 이력 경력 카드의 입사·퇴사·휴직 시작·휴직 끝이 글 칸(mono, placeholder `2023-03-15`)이 되어 `2023-03-15`, `2023-03`, 점 형식(`2023.03.15`)을 받는다. 점은 저장할 때 하이픈으로 바뀐다. 없는 날짜·형식 오류는 기존 `invalid` 표시와 hint로 막고 저장되지 않는다. 휴직 끝 help는 `복직 예정일`.
- 표시: `dotMonth`(lib/resume.ts, lib/resumeSheet.ts)가 모든 `-`를 점으로 바꿔 `2023.03.15`/`2023.03`, 경력 머리 기간, 휴직 줄, 이력서 한 장 위 기간 칸이 새 형식을 따른다.
- 개월 수·복직 예정 판단은 앞 7글자(달)만 쓴다. 순서 검사는 둘 다 일이 있을 때만 날짜로, 아니면 달로 비교(백엔드·프런트·mock 같음).
- 경험 캘린더(`careersByStart`)는 경력 날짜를 앞 7글자로 잘라 써서 `YYYY-MM-DD`가 와도 안 깨진다.
- 백엔드: `careers`에 `started_on_has_day`, `ended_on_has_day`, `leave_started_on_has_day`, `leave_ended_on_has_day`(NOT NULL, 기본 false) 마이그레이션 `306ce6188f26`. `Career` 모델은 `YYYY-MM`/`YYYY-MM-DD`(실제 있는 날짜)를 받고 응답은 has_day대로. 변환은 `stores/resume.py`. 가져오기·`agent_read`는 Career 모델/문자열을 그대로 쓰므로 코드 변경 없이 동작(테스트로 확인).
- 학력·자격증·경험은 그대로 월.
- 문서: `docs/testing.md`, `docs/local-operations.md`(가져오기 JSON 날짜 형식).

### 커밋
- 백엔드 커밋 (careers 일 유무 칸, Career 검사, 마이그레이션, 테스트)
- 프런트엔드 커밋 (글 칸, 표시, mock, 테스트, 문서)
- 보고서 커밋

### 테스트
- backend pytest (test_resume_store, test_resume_api, test_import_resume, test_agent_read, test_migrations; PostgreSQL 임시 컨테이너): 110 통과
- frontend test (resume, resumeSheet, experienceCalendar lib/components, services): 168 통과, 2 건너뜀 / lint 경고만(기존 router.tsx) / build 통과
- 전체 테스트는 돌리지 않았다, CI가 돈다. 마이그레이션은 `saveme_dev`에만 적용했다(`saveme` 건드리지 않음).

### 내가 정한 것
- 경력 날짜 타입 `CareerDate`, 검사 도우미 `_check_career_date`/`_not_before`(models.py), 프런트 `parseCareerDate`/`careerDateNotBefore`(lib/resume.ts). mock은 점이나 공백이 든 값을 422로 거절(점 변환은 화면에서).
- 틀린 날짜 hint 글: `날짜를 2023-03-15나 2023-03 모양으로 적어 주세요.`
- 순서 hint는 두 칸이 모두 올바른 날짜일 때만 보인다.
- 컨테이너 `saveme-test-pg`(포트 55442)를 테스트용으로 띄워 두었다(--rm, 필요 없으면 `docker stop saveme-test-pg`).
