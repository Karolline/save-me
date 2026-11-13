리뷰한 커밋: c23d007

## 리뷰 결과: 고친 뒤 합치기

`task/cert-day` 전체(커밋 4개: 지시서 3d43148, 구현 d023dd6, 리뷰 보고 12d0e0d, 리뷰 후 수정 c23d007)를 리뷰했습니다. 코드는 맞습니다. 그런데 c23d007은 코드만 바꾸었고, 개발자 보고가 "추가했다"고 적은 테스트 두 개는 브랜치 어디에도 없습니다. 나머지는 이전 리뷰(d023dd6)대로 지시서를 모두, 그 이상은 하지 않고 지킵니다.

### 꼭 고칠 것
- [frontend/src/lib/resume.test.ts], [backend/tests/integration/test_resume_api.py]: 개발자 보고 "리뷰 후 수정" 절에는 이렇게 적혀 있습니다. (1) `lib/resume.test.ts`에 "취득일이 빈 자격증은 `acquiredOn: null`" 테스트를 더했다. (2) `test_resume_api.py`에 `"acquiredOn": ""`가 `null`로 돌아오는 테스트를 더했다(PostgreSQL에서 26개 통과). 하지만 c23d007이 바꾼 파일은 `.claude/tasks/cert-day.report.md`, `frontend/src/lib/resume.ts`, `frontend/src/services/mockService.ts` 셋뿐입니다. worktree도 깨끗합니다(`nothing to commit`). `git log --all -S/-G`로 찾아봐도 그런 테스트는 어떤 ref에도 없습니다. 두 파일을 grep해도 빈 취득일을 다루는 테스트가 없습니다. 테스트를 커밋하지 않았거나 쓰지 않은 것입니다.
  - 왜 문제인가: 이 수정의 핵심인 "취득일을 비우면 `""` 대신 `null`을 보낸다"를 지키는 테스트가 없습니다. 그래서 `NULLABLE_DATE_FIELDS`에서 `acquiredOn`이 다시 빠져도 아무 테스트도 실패하지 않습니다. 지시서의 "빈 값 null 테스트"도 API 층에는 여전히 없습니다. 보고서가 실제 브랜치와 다르다는 점도 퍼블리셔와 사용자를 잘못 이끕니다.
  - 고치는 법: 보고에 적은 두 테스트를 실제로 쓰고 커밋합니다. 보고서의 "26개 통과"도 실제로 다시 돌린 결과로 바꿉니다.

### 고치면 좋은 것
- 없음

### 테스트
- 직접 돌린 테스트: 프런트엔드 `src/lib/resume.test.ts`, `src/components/resume.test.tsx`, `src/services/mockService.test.ts`, 3파일 83개 모두 통과했습니다(`scripts/measure.ps1`로 감싸 돌림, 9초, tree peak 559MB). 이름을 바꾸고 `acquiredOn`을 null 집합에 넣은 변경이 기존 테스트를 깨지 않는다는 것을 확인했습니다. 백엔드는 c23d007에서 바뀐 것이 없어서 돌리지 않았습니다(d023dd6의 결과는 개발자 보고를 믿음).

### 확인한 것
- 이름 바꾸기: `MONTH_FIELDS`는 `lib/resume.ts` 안의 export하지 않은 상수였습니다. 쓰는 곳은 151줄 정의와 187줄 `fromRowDrafts` 하나뿐이었고, 둘 다 `NULLABLE_DATE_FIELDS`로 바꿨습니다. 저장소에 옛 이름이 남은 곳은 없습니다. `careerDay`도 정의(543)와 `cleanCertificate`(605) 두 곳 모두 `certificateDate`로 바뀌었고, 옛 이름이 남은 곳은 없습니다.
- 동작: `acquiredOn`은 자격증 카드에만 있는 칸이라, 집합에 더해도 다른 카드에는 영향이 없습니다. 경력 날짜는 앞의 `card === "careers"` 분기가 먼저 처리해서 그대로이고, 학력 `startedOn`/`endedOn`도 전과 같습니다. 이제 빈 취득일은 `null`로 나가서 `types.ts`의 `acquiredOn: string | null` 약속, 백엔드(`_blank_month`), mock(`certificateDate`)과 맞습니다. 주석도 고쳤습니다.
- 백엔드 검증과 저장(이전 리뷰 그대로): `FullDate` 형식에 `_check_career_date`를 더해 `YYYY-MM`과 `2021-02-30`은 422, 빈 글자는 null입니다. store는 자격증만 `date.fromisoformat`/`isoformat`을 쓰고 학력은 그대로이며, 정렬은 최근 순에 빈 값이 맨 뒤입니다(store 테스트 있음).
- DB: 마이그레이션이 없습니다(지시서대로). `acquired_on`은 이미 Date라서 기존 행이 `YYYY-MM-01`로 읽힙니다.
- 약속: `models.py`, `types.ts`, HTTP 서비스(바뀐 것 없음), mock이 서로 맞습니다. 컴포넌트가 데이터를 직접 거르거나 정렬하지 않습니다.
- 사용자 분리: store 시그니처와 `user_id` 거르기는 바뀌지 않았고, 기존 404 테스트가 그대로 있습니다.
- 화면: `type="date"`에 `mono` 클래스가 붙고, 보기 모드는 `2020.01.15`처럼 나오며 비면 아무것도 안 보입니다(테스트 있음).
- 언어: 주석과 커밋 메시지(c23d007 포함)는 한국어, 식별자는 영어입니다.
- 규칙: 새 의존성, 버전 올리기, `Closes #N`, 개인 데이터, push가 없습니다. `.claude/tasks/cert-day.report.md`와 `.review.md`는 정상입니다.
- 문서: `importers/resume.py` docstring과 `docs/local-operations.md`의 예시를 일까지로 고쳤습니다. 테스트 파일은 새로 생기지 않아 `docs/testing.md` 표는 고칠 것이 없습니다.
