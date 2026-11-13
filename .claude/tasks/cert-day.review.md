리뷰한 커밋: d023dd6

## 리뷰 결과: 합쳐도 됨

`task/cert-day`(커밋 2개: 지시서, 구현)는 지시서가 말한 것을 모두 했고, 그 밖의 것은 건드리지 않았습니다. 꼭 고칠 것은 없습니다. 아래 두 가지는 지금 쓰는 데 문제가 없어서 병합 뒤에 고쳐도 됩니다.

### 꼭 고칠 것
- 없음

### 고치면 좋은 것
- [frontend/src/lib/resume.ts:151, 187] `MONTH_FIELDS`에서 `acquiredOn`을 빼면서, 취득일 칸을 비우고 저장하면 화면이 `null`이 아니라 빈 글자 `""`를 보냅니다. 지시서가 빼라고 해서 그대로 한 것이지만, 이 집합이 실제로 하던 일은 "빈 글자를 null로" 바꾸는 것뿐이었습니다. `types.ts`는 `acquiredOn: string | null`이라고 약속하고, `fromRowDrafts`의 주석("빈 달은 null")과도 이제 맞지 않습니다. 백엔드(`_blank_month`)와 mock(`careerDay`)이 `""`를 null로 바꿔서 지금 보이는 버그는 없습니다. 고치는 법: 집합 이름을 예를 들어 `NULLABLE_DATE_FIELDS`로 바꾸고 `acquiredOn`을 다시 넣거나, 자격증 칸만 `|| null`로 처리합니다. 그리고 `lib/resume.test.ts`나 `resume.test.tsx`에 "취득일이 빈 자격증은 `acquiredOn: null`로 저장" 테스트를 하나 더합니다. 개발자 보고는 "빈 값 null은 기존 테스트가 이미 다룸"이라고 했지만, 기존 테스트는 경력 카드만 봅니다.
- [backend/tests/integration/test_resume_api.py:78] 지시서가 바란 "빈 값 null" 테스트가 store 단위(`Certificate(acquired_on="")` → None, 정렬 맨 뒤)에만 있고 API 층에는 없습니다. `PUT /api/resume/certificates`에 `"acquiredOn": ""`를 보내면 `null`이 돌아오는지 보는 한 줄이 있으면 좋습니다. 꼭 필요하지는 않습니다.
- [frontend/src/services/mockService.ts:543] 새 함수 이름 `careerDay`가 경력용처럼 읽힙니다. `certificateDate` 같은 이름이 더 맞습니다. 동작에는 문제가 없습니다.

### 테스트
- 직접 돌린 테스트: 없음. 개발자 보고를 믿었습니다. 보고에 따르면 PostgreSQL에서 백엔드 112개, 프런트엔드 126개가 통과했고 build와 lint도 통과했습니다. 읽어 봤을 때 결과를 의심할 곳이 없었습니다.

### 확인한 것
- 백엔드 검증: `models.py`의 `FullDate` 형식은 `^\d{4}-(0[1-9]|1[0-2])-\d{2}$`이고, 경력과 같은 `_check_career_date`로 있는 날짜인지 봅니다. `YYYY-MM`과 `2021-02-30`은 422이고, 빈 글자는 `_blank_month`가 null로 바꿉니다.
- 가져오기: `ImportCertificate`가 `Certificate`를 상속해서 같은 검증을 받습니다. 테스트(`2020-09`, `2020-9`는 오류, 일까지 그대로 읽힘)가 있습니다.
- store(`stores/resume.py`): 자격증만 `date.fromisoformat`과 `isoformat`으로 바꿨습니다. 학력은 그대로 `to_month`/`from_month`를 써서 경력·학력 날짜에는 영향이 없습니다. 정렬은 그대로 `newest_first`이고, 같은 달 다른 일과 빈 값 맨 뒤를 테스트합니다.
- 마이그레이션은 없습니다. `acquired_on`은 이미 Date라서 기존 행(1일로 저장된 값)은 `YYYY-MM-01`로 그대로 읽힙니다.
- 약속: `models.py`, `types.ts` 주석, mock(`careerDay`가 10글자이고 있는 날짜인지 검사, `.` 구분은 거절), 정렬이 서로 맞습니다. HTTP 서비스는 바꿀 것이 없습니다.
- 화면: `type="date"` 입력에 `mono` 클래스, 보기 모드는 `dotMonth`로 `2020.01.15`이고 비면 아무것도 안 보입니다. 테스트가 입력 type과 보기 글을 확인합니다. 컴포넌트가 데이터를 직접 거르거나 정렬하지 않습니다.
- `agent_read profile`은 이미 `acquired_on`을 그대로 써서 `YYYY-MM-DD`로 나옵니다. `ResumeSheet`가 자격증 날짜를 따로 다루지 않는다는 보고 내용도 확인했습니다.
- 사용자 분리: store 메서드의 시그니처와 `user_id` 거르기는 바뀌지 않았고, 기존 404 테스트가 그대로 있습니다.
- 언어: 주석과 커밋 메시지는 한국어, 식별자는 영어입니다.
- 규칙: 새 의존성, 버전 올리기, `Closes #N`, 개인 데이터가 없습니다. 예시 값은 가짜입니다. 테스트 파일이 새로 생기지 않아 `docs/testing.md` 표는 고칠 것이 없습니다.
- 문서: `importers/resume.py` docstring과 `docs/local-operations.md`의 예시를 일까지로 고쳤습니다.
