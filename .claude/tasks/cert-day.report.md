## 결과: 완료
브랜치: task/cert-day   worktree: C:\dev\save-me\.claude\worktrees\cert-day

### 바꾼 것
- 이력 화면 자격증 "취득" 칸이 날짜 입력(`type="date"`, mono)이 되고, 보기 모드는 `2021.07.16`처럼 일까지 보인다. 비어 있으면 안 보인다.
- API: `Certificate.acquired_on`은 `YYYY-MM-DD`나 null(빈 글자는 null). `YYYY-MM`, 없는 날짜는 422 (`models.py`의 `FullDate`). store(`stores/resume.py`)는 날짜 그대로 저장·반환, 정렬은 일 단위(취득 최근 순, 비면 맨 뒤). 마이그레이션 없음, 기존 월 값(1일)은 그대로 `…01`로 보임.
- 가져오기 docstring, `docs/local-operations.md` 예시를 일까지로. `agent_read profile`은 이미 ISO 문자열을 그대로 써서 `YYYY-MM-DD`로 나옴.
- 프런트엔드: `ResumeScreen.tsx`(`day` 칸 종류), `mockService.ts`(`careerDay` 검증), `sampleResume.ts`, `types.ts` 주석, `lib/resume.ts`의 `MONTH_FIELDS`에서 `acquiredOn` 제거.
- `ResumeSheet`의 메뉴에서 채우기: `resumeSheet.ts`는 자격증 날짜를 따로 다루지 않아(소개 글에 이름만) 바꿀 것이 없었고, 보기는 `dotMonth`로 일까지 나온다.

### 커밋
- (아래 git log 참고, 한 커밋)

### 테스트
- backend pytest (PostgreSQL 컨테이너): test_resume_store, test_import_resume, test_resume_api, test_agent_read 112 통과
- frontend test (resume.test.tsx, mockService.test.ts, lib/resume, resumeSheet) 126 통과, build 통과, lint 통과(경고만, 기존)
- 전체 테스트는 돌리지 않았다, CI가 돈다. 남의 데이터 404 테스트는 기존 것이 그대로 통과.

### 내가 정한 것
- 일 검증은 경력용 `_check_career_date`를 재사용. `has_day` 칸 없음.
- 새 Column 플래그 `day`(경력의 `date`는 글 칸이라 따로 둠).
- 샘플 값: SQLD 2020-01-15, 정보처리기사 2019-08-23.
- `lib/resume.test.ts`는 바꾸지 않음(`fromRowDrafts`의 빈 값 null은 기존 테스트가 이미 다룸).

## 리뷰 후 수정 (고치면 좋은 것 3개)
- `frontend/src/lib/resume.ts` (c23d007): `MONTH_FIELDS`를 `NULLABLE_DATE_FIELDS`로 바꾸고 `acquiredOn`을 넣어, 취득일을 비우면 `""` 대신 `null`을 저장한다. `fromRowDrafts` 주석도 맞춤.
- 테스트는 c23d007에 빠져 있어 df730d2에서 실제로 더했다: `frontend/src/lib/resume.test.ts`("saves an empty certificate date as null", `NULLABLE_DATE_FIELDS`에서 `acquiredOn`을 빼면 실패함을 확인), `backend/tests/integration/test_resume_api.py`(`acquiredOn: ""`는 `null`로 돌아옴, PostgreSQL에서 이 파일 27개 통과).
- `frontend/src/services/mockService.ts`: `careerDay`를 `certificateDate`로 이름 변경.
- 테스트: `vitest run src/lib/resume.test.ts` 22개 통과. 앞서 `src/services` 포함 통과, build·lint 통과. 전체 테스트는 돌리지 않았다, CI가 돈다.
