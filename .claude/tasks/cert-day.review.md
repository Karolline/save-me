리뷰한 커밋: 38923ae

## 리뷰 결과: 합쳐도 됨

`task/cert-day` 브랜치 전체를 리뷰했습니다. 커밋은 7개입니다: 지시서 3d43148, 구현 d023dd6, 리뷰 보고 12d0e0d, 리뷰 후 수정 c23d007, 리뷰 보고 갱신 d69449d, 테스트 추가 df730d2, 보고서 수정 38923ae. 직전 리뷰(c23d007 기준)에서 "꼭 고칠 것"이었던 빠진 테스트 두 개가 이제 브랜치에 실제로 들어 있습니다. 보고서도 브랜치와 맞습니다. 다만 앞쪽 절에 지금과 맞지 않는 줄이 남아 있습니다(아래 "고치면 좋은 것").

### 꼭 고칠 것
- 없음

### 고치면 좋은 것
- [.claude/tasks/cert-day.report.md] 보고서 앞쪽 절에 이제 사실이 아닌 줄이 세 개 남아 있습니다. 뒤쪽 "리뷰 후 수정" 절이 바로잡고 있고 퍼블리셔가 병합할 때 지우는 파일이라, 병합을 막을 일은 아닙니다.
  - "### 커밋 — (아래 git log 참고, 한 커밋)": 구현 관련 커밋은 지금 여러 개입니다.
  - "`lib/resume.ts`의 `MONTH_FIELDS`에서 `acquiredOn` 제거": 이 상수는 이후 `NULLABLE_DATE_FIELDS`로 바뀌었고 `acquiredOn`도 다시 들어갔습니다.
  - "`lib/resume.test.ts`는 바꾸지 않음": df730d2에서 이 파일에 테스트를 더했습니다.

### 테스트
- 직접 돌린 테스트: 프런트엔드 `src/lib/resume.test.ts` 22개 모두 통과했습니다(worktree에서 `scripts/measure.ps1`로 감싸 돌림, 5초, tree peak 338MB). 새 테스트 "saves an empty certificate date as null"도 여기에 들어 있습니다. 첫 시도는 `-Cmd` 안의 `cd frontend`가 경로 오류를 내 exit 1로 기록되었습니다. 이것은 실행 명령의 문제이고 테스트 실패가 아닙니다.
- 백엔드 `test_resume_api.py`는 돌리지 않았고, 개발자 보고(PostgreSQL에서 이 파일 27개 통과)를 믿었습니다. 새 테스트는 `PUT /api/resume/certificates`에 `acquiredOn: ""`를 보내고 `null`이 돌아오는지 봅니다. `models.py`의 `acquired_on` 필드에는 `mode="before"` 검증기가 붙어 있고, 이것이 `_blank_month`를 불러 빈 글자를 None으로 바꿉니다(models.py:902-905). 읽어 봐도 결과를 의심할 곳이 없습니다.

### 확인한 것
- 직전 지적 해소: df730d2의 두 테스트는 동작을 시험합니다. 프런트엔드 테스트는 `fromRowDrafts("certificates", …)`가 빈 취득일을 `null`로 바꾸는지 봅니다. `NULLABLE_DATE_FIELDS`에서 `acquiredOn`이 빠지면 `""`가 나와 실패합니다. 백엔드 테스트는 API 층에서 빈 값이 null이 되는지 봅니다. 지시서의 "빈 값 null 테스트"가 이제 store, API, 프런트엔드 lib 세 층에 모두 있습니다.
- 보고서와 브랜치: "리뷰 후 수정" 절의 내용이 실제 커밋과 맞습니다. c23d007은 `resume.ts`와 `mockService.ts`를, df730d2는 두 테스트 파일을 바꿨습니다. `careerDay`는 `certificateDate`로 바뀌었습니다. worktree에 커밋 안 한 변경은 없습니다.
- 옳음: `fromRowDrafts`에서 경력 날짜는 `card === "careers"` 분기가 먼저 처리합니다. 학력 날짜와 취득일은 `NULLABLE_DATE_FIELDS`의 `|| null`로 처리됩니다. 백엔드의 `FullDate`는 `_check_career_date`로 검증해서 `YYYY-MM`과 없는 날짜는 422로 거절하고, 빈 글자는 null로 바꿉니다. store는 자격증만 일 단위로 저장하고 정렬하며, 빈 값은 맨 뒤로 갑니다.
- 약속: `models.py`, `types.ts`(`acquiredOn: string | null`), HTTP 서비스(바뀐 것 없음), mock(`certificateDate`)이 서로 맞습니다. 컴포넌트는 데이터를 직접 거르거나 정렬하지 않습니다.
- DB: 마이그레이션이 없습니다(지시서대로). `acquired_on`은 이미 Date 칸이라 기존 행은 `YYYY-MM-01`로 그대로 읽힙니다.
- 사용자 분리: store 시그니처와 `user_id` 거르기는 바뀌지 않았습니다. 기존의 "남의 데이터는 404" 테스트도 그대로 있습니다.
- 테스트 위치: 새 테스트는 기존 파일(`frontend/src/lib/`, `backend/tests/integration/`)에 들어갔습니다. 새 파일이 없어서 `docs/testing.md` 표는 고칠 것이 없습니다.
- 언어: 주석과 커밋 메시지는 한국어, 식별자는 영어입니다. 테스트 이름이 영어인 것은 이 파일의 기존 관례와 같습니다.
- 규칙: 새 의존성, 버전 올리기, `Closes #N`, 개인 데이터, push가 없습니다. 예시 값은 가짜입니다. `.report.md`와 `.review.md`는 정상입니다.
- 문서: `backend/app/importers/resume.py` docstring과 `docs/local-operations.md`의 예시가 일 단위로 고쳐져 있습니다.
