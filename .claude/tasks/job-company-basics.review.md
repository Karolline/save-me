리뷰한 커밋: 48d4e05

## 리뷰 결과: 합쳐도 됨

`task/job-company-basics`를 읽기만 해서 리뷰했습니다. 커밋은 4개(지시서, 백엔드, 프런트엔드, 개발자 보고)이고 main보다 뒤처진 커밋은 없습니다. 지시서의 동작·저장 규칙·하지 않을 것과 어긋나는 곳은 찾지 못했습니다.

### 꼭 고칠 것
- 없음

### 고치면 좋은 것
- [frontend/src/components/JobCompanyBasicsTab.tsx:83-88, 103-120] 편집 폼이 `<form onSubmit>`이라, 질문 한 줄 칸에서 Enter를 누르면 바로 저장되고 보기 상태로 돌아갑니다. 질문을 적고 Enter로 다음 칸에 가려던 사용자는 뜻밖일 수 있습니다. 데이터를 잃지는 않습니다(저장 규칙은 그대로 걸립니다). 질문 칸에서 Enter를 막을지 정도만 생각해 볼 만합니다.
- [frontend/src/components/JobViewScreen.tsx 머리 + JobCompanyBasicsTab.tsx:180-184] 회사 기본 탭에서는 `편집` 버튼이 둘 보입니다. 하나는 머리의 분석 편집 화면으로 가고, 하나는 탭 안 편집입니다. 지시서가 정한 그대로이고 테스트도 `getAllByRole("button", { name: "편집" })[1]`로 구분합니다. 다만 화면에서 헷갈릴 수 있어서 미리 보기 때 사용자가 확인하면 좋겠습니다.

### 테스트
- 직접 돌린 테스트 없음, 개발자 보고를 믿었습니다. 보고에는 백엔드 관련 5개 파일 125개 통과(PostgreSQL, `test_migrations` 포함, `saveme_dev` 적용), 프런트엔드 관련 테스트·build·lint 통과로 적혀 있습니다. 읽어 본 테스트가 지시서의 "끝났다고 보는 조건"을 모두 덮고 있어서 따로 돌리지 않았습니다.
- 개발자 보고에 따르면 `scripts/measure.ps1`로 감싸는 것이 PATH 문제로 한 번 실패해서, 이후는 측정 없이 돌렸습니다. 릴리즈 노트의 시간·메모리 기록이 빠질 수 있습니다.

### 확인한 것 (요청한 세 가지)
- **분석 편집 저장이 회사 기본을 지우지 않음.** `JobStore._fill`은 `JobInput`의 `TEXT_FIELDS`/`JSON_FIELDS`만 씁니다. `company_note`와 `company_qna`는 `JobFields`·`JobInput`에 없어서 `update`가 건드리지 않습니다. 이것을 보는 테스트가 백엔드(`test_company_basics_keeps_verified_and_survives_edit`)와 mock(`keeps 회사 기본 when the analysis is edited and saved`)에 다 있습니다. mock의 `updateJob`도 기존 값을 `fillJob`에 넘깁니다.
- **가져오기 `--replace`가 회사 기본을 지우지 않음.** `save_imported`도 같은 `_fill`을 거쳐 두 칸을 그대로 둡니다. 새로 만드는 분석은 기본값 `""`/`[]`입니다. `test_replace_keeps_the_company_basics_written_in_the_app`(`replace_verified=True`)가 이를 확인합니다. `docs/job-inbox.md`와 가져오기 JSON은 바뀌지 않았습니다.
- **`agent_read --reader`에 새지 않음.** `render_job`은 reader이면 공고 원문과 회사 동향만 내고 일찍 끝나므로 `## 회사 기본`에 닿지 않습니다. 기본 출력에서는 회사 동향 앞에 `## 회사 기본`, `### 궁금한 점`, `Q.`/`A.`를 내고, 답이 없으면 `A. (아직 답 없음)`, 둘 다 비면 절을 뺍니다. 테스트가 reader 출력에 조사 글과 절 제목이 없음을 확인합니다.

### 확인한 것 (점검표)
- **옳음.** 저장 규칙 세 가지(빈 줄 버리기, 답만 있으면 막고 그 질문 칸에 포커스와 `질문을 적어 주세요`, 질문만 다듬기와 공백뿐인 글은 빈 글)가 컴포넌트·mock·서버에 같게 들어 있습니다. 저장 중에는 [저장]·[취소]가 막힙니다. 실패하면 폼과 적은 값이 남고 `useSessionErrors` 뒤에 토스트가 뜹니다. 성공하면 상세에 두 칸만 반영되고 `verified`는 그대로입니다. 탭 순서, `tab=basics` 주소, 다시 열어도 그 탭인 것도 맞습니다.
- **API 약속.** `Job`에 `companyNote`·`companyQna`가 있고 `JobInput`에는 없습니다. `PUT /api/jobs/{id}/company-basics`가 `Job`을 돌려줍니다. `types.ts`, `httpService.ts`, `mockService.ts`(같은 422, 없는 id는 404, 분석일·`updatedAt`·사람 확인 유지)가 서로 맞습니다. 컴포넌트가 하는 계산은 `답 n / 전체 m`을 세는 것 하나이고, 받은 목록의 표시용 수라 문제로 보지 않았습니다.
- **DB.** 모델과 마이그레이션 `7c1e5a9d2b40`을 같은 커밋에 넣었습니다. 부모 `306ce6188f26`이 유일한 head입니다. 새 칸은 NOT NULL이지만 `server_default`가 `''`, `'[]'`라서 기존 행이 안전하고 DB에 중립적입니다. downgrade는 두 칸만 지웁니다. SQLite 코드는 없습니다.
- **사용자 분리.** `set_company_basics(user_id, job_id, data)`가 `_row`로 `user_id`를 거릅니다. 라우터는 `current_user`를 쓰고, 라우터 전체가 `require_csrf_header`를 씁니다. 남의 분석 404, 없는 id 404, 로그인 없으면 401, CSRF 헤더 없으면 403 테스트가 다 있습니다.
- **16px 입력 칸.** 입력 칸은 `.input`/`.textarea`(16px)라 규칙을 지킵니다. 새 CSS(`.cb-*`)에는 고정 px 폭이 없고 `.cb-note`의 `min-height`만 있습니다. 모바일 코드도 없습니다.
- **언어.** UI 글, 주석, 커밋 메시지는 한국어이고 식별자는 영어입니다. `docs/testing.md`는 한국어입니다.
- **규칙.** `sampleJobs.ts`의 회사 기본은 지어낸 회사 내용입니다. `private/`나 덤프는 없습니다. 새 의존성, 버전 올리기, `Closes #N`도 없습니다.
- **테스트·문서.** `docs/testing.md` 표에서 바뀐 테스트 파일 7개의 설명을 고쳤습니다. 테스트는 저장 결과와 화면 글을 확인하는 동작 테스트입니다.
