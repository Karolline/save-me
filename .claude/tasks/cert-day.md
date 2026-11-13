# 작업: cert-day

## 목표
이력의 자격증 취득일을 월(YYYY-MM)이 아니라 일(YYYY-MM-DD)까지 적고, 저장하고, 보이게 한다.

## 동작
- 이력 화면의 자격증 편집 카드에서 "취득" 칸은 날짜 입력(`type="date"`, 연·월·일)이다. 다른 날짜 칸처럼 `mono` 클래스, 글자 16px 이상 규칙은 그대로.
- 자격증 목록(보기 모드)의 취득일은 `2021.07.16`처럼 점으로 이어 연·월·일을 보인다. 취득일이 비어 있으면 지금처럼 아무것도 안 보인다.
- 기존 값: DB에 월만 적혀 1일로 저장된 값(예: 2021-07-01)은 마이그레이션 없이 그대로 일 단위 값으로 읽혀 `2021.07.01`로 보인다. 사용자가 화면에서 고쳐 넣는다 (사용자 결정).
- 정렬은 지금처럼 취득이 최근인 것부터, 비어 있으면 맨 뒤. 이제 같은 달이어도 일로 갈린다.
- 서류 상세의 이력서 칸(`ResumeSheet`)의 "메뉴에서 채우기"가 자격증을 가져올 때 취득일도 `2021.07.16`처럼 일까지 들어간다 (`resumeSheet.ts`의 `dotMonth`가 이미 일을 다룸, 확인만).
- `agent_read profile`의 자격증 줄은 `YYYY-MM-DD`로 보인다.
- 경력·학력 날짜는 바꾸지 않는다.

## 데이터와 API
- DB: 없음. `certificates.acquired_on`은 이미 `Date`. 마이그레이션을 만들지 않는다.
- API (`app/models.py`의 `Certificate.acquired_on`): `YYYY-MM-DD` 문자열이나 null(빈 글자는 null). `YYYY-MM`이나 없는 날짜(2021-02-30)는 422. store(`stores/resume.py`)는 `to_month`/`from_month` 대신 날짜 그대로 저장·반환한다.
- 가져오기(`importers/resume.py`): 자격증 `acquiredOn`도 `YYYY-MM-DD`만. 모듈 docstring 예시와 `docs/local-operations.md`의 예시를 일까지로 고친다.
- 프런트엔드: `types.ts` 주석, `mockService.ts`(검증·정렬을 백엔드와 같게: 일 단위), `sampleResume.ts`의 예시 값을 일까지로, `lib/resume.ts`의 `MONTH_FIELDS`에서 `acquiredOn` 빼기 등 날짜 칸 처리.

## 끝났다고 보는 조건
- 백엔드: `test_resume_store.py`, `test_import_resume.py`, `test_resume_api.py`에서 일까지 저장·반환, `YYYY-MM`·없는 날짜 거절(422), 정렬(같은 달 다른 일), 빈 값 null 테스트. 남의 데이터 404 테스트는 기존 것이 그대로 통과.
- 프런트엔드: `resume.test.tsx`(날짜 입력 칸, 보기 모드 `2021.07.16`), `mockService.test.ts`(검증·정렬), 관련 lib 테스트. `npm run build`, `npm run lint` 통과.
- 건드린 테스트는 PostgreSQL에서 돌린다.

## 화면
- 새 목업 없음. 지금 이력 화면(`ResumeScreen.tsx`)의 자격증 카드에서 취득 칸만 날짜 입력으로, 보기 글만 일까지로.

## 하지 않을 것
- 마이그레이션, 새 DB 칸.
- 경력·학력 날짜 변경.
- 진짜 DB(`saveme`)의 값 고치기 (사용자가 병합 뒤 화면에서 고친다).
- 모바일 관련 작업.

## 사용자와 정한 것
- 자격증 취득일은 항상 일까지 받는다 (월만 받는 방식은 두지 않음). 경력처럼 "월 또는 일"을 고르는 칸은 만들지 않는다.
- 기존의 월만 있던 값은 `YYYY.MM.01`로 보여도 괜찮다. 사용자가 고친다.

## 릴리즈
- 버전 v0.11.2 (PATCH: 기존 칸을 일까지 받게 한 작은 개선). 버전을 올리지 않는다: 병합할 때 퍼블리셔가 한다.
