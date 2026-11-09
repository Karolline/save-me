## 결과: 완료
브랜치: task/job-company-basics   worktree: C:\dev\save-me\.claude\worktrees\job-company-basics

### 바꾼 것
- 공고분석 상세에 [회사 기본] 탭 (탭 순서: 공고 분석, 회사 기본, 회사 동향. 주소 `tab=basics`). 빈 상태 카드와 [적기], 보기(조사한 내용 카드, 궁금한 점 카드 `답 n / 전체 m`, Q 번호, 답 없으면 "아직 답을 못 찾았어요"), 탭 안 편집 폼(질문 한 줄, 답 여러 줄, 삭제, + 질문 추가, 취소, 저장, 질문 없이 답만 있으면 "질문을 적어 주세요").
  `frontend/src/components/JobCompanyBasicsTab.tsx`, `JobViewScreen.tsx`, `router.tsx`, `styles.css`(.cb-*)
- 백엔드: `job_analyses.company_note`, `company_qna` + 마이그레이션 `7c1e5a9d2b40`, `PUT /api/jobs/{id}/company-basics`, `stores.jobs.set_company_basics`, `Job`에 `companyNote`·`companyQna`(`JobInput`에는 없음). 분석 편집·가져오기(`--replace`)는 두 칸을 건드리지 않음.
- `app.agent_read job ID`에 `## 회사 기본` 절 (`--reader`에는 없음).
- 프런트 서비스: `types.ts`, `httpService.ts`, `mockService.ts`(같은 규칙), `sampleJobs.ts`(지어낸 회사 기본).
- `docs/testing.md` 표 갱신.

### 커밋
- f3ed717 공고분석 회사 기본: 칸과 마이그레이션, PUT company-basics, agent_read 출력
- 43db204 공고분석 상세에 [회사 기본] 탭 추가 (프런트엔드, 테스트, 문서)

### 테스트
- backend pytest (PostgreSQL, test_job_store, test_jobs_api, test_import_jobs, test_agent_read, test_migrations): 125 통과. 마이그레이션은 `saveme_dev`에 적용함.
- frontend test (jobs.test.tsx, router.test.tsx, services, lib, screens, experiences, applications, documents 관련): 통과. build 통과, lint 오류 없음(기존 경고만).
- 전체 테스트는 돌리지 않았다, CI가 돈다. `scripts/measure.ps1` 감싸기는 PATH 문제로 한 번 실패해 이후 직접 돌렸다.

### 내가 정한 것
- 서버는 질문 앞뒤 공백을 다듬고, 조사 글이 전체 공백이면 빈 글로 저장 (답과 글은 그대로).
- 마이그레이션은 autogenerate 대신 `skip_reason` 것을 따라 직접 작성.
- `agent_read`의 회사 기본 절은 회사 동향 앞에 두고, 비면 절을 뺌.
- 편집 폼의 삭제는 글자 버튼, 섹션 aria-label은 "조사 글 입력"/"질문 입력".
- 저장 뒤 상세는 응답의 두 칸만 상태에 반영 (확인됨 등은 그대로).

### 질문 (멈춘 경우)
- 없음
