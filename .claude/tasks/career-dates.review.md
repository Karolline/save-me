리뷰한 커밋: dd4b823b00c7a402ed8b1dfeb7622f623e4d134b

## 리뷰 결과: 고친 뒤 합치기

기능은 지시서대로 되어 있고 버그는 찾지 못했다. 남은 것은 문서 표 몇 줄과 테스트 보강.

### 꼭 고칠 것
- docs/testing.md 표에 바뀐 테스트 파일 4개가 반영되지 않았다 (리뷰 점검표 2번). 고친 줄은 `lib/resume.test.ts` 하나뿐. 빠진 줄:
  - `lib/experienceCalendar.test.ts`: 일이 있는 경력 날짜를 달로 읽음
  - `lib/resumeSheet.test.ts`: `dotMonth`가 일까지 점으로 바꿈
  - `components/resume.test.tsx`: 경력 날짜 글 칸(placeholder, `type="month"` 아님, 없는 날짜 표시와 저장 막힘, 점 입력 후 저장 결과)
  - `services/mockService.test.ts`: 경력 날짜의 일 유지, 없는 날짜·`2023-3-1`·점 422, 일 순서

### 고치면 좋은 것
- backend/tests/unit/test_migrations.py `test_careers_has_day_migration_reads_existing_rows_as_month_only`: 이미 head인 DB에 새 행을 넣어 server_default만 확인한다. "마이그레이션 후 기존 행이 YYYY-MM으로 읽힘"을 시험하지 않는다. `test_documents_data_migration_keeps_rows_with_null_data`처럼 `b3b3c7c40600`까지 올리기 → careers 행 넣기 → head로 올리기 → 칸 4개 false, store로 읽으면 "2023-03" → downgrade 뒤에도 행 남음을 확인하면 좋다. (동작 자체는 맞다.)
- frontend/src/services/mockService.ts `newestFirst`: mock은 글자로, 백엔드는 날짜로 정렬해 `"2023-03"`과 `"2023-03-01"`이 함께 있을 때만 순서가 다를 수 있다. 거의 없는 경우라 안 고쳐도 된다.

### 테스트
직접 돌린 테스트 없음 (개발자 보고를 믿음: 백엔드 110 통과, 프런트엔드 168 통과·2 건너뜀, 린트·빌드 통과).

### 확인한 것
- 백엔드 `CareerDate` 검사, 순서 검사, 프런트엔드 규칙, 달 단위 개월 수, `dotMonth`, 경험 캘린더, agent_read·가져오기, 모델·마이그레이션·사용자 분리, 화면, 언어, 규칙 모두 옳음.
- 참고: 테스트용 컨테이너 `saveme-test-pg`(포트 55442)가 남아 있으면 `docker stop saveme-test-pg`로 끈다.
