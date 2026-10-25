## 결과: 완료
브랜치: worktree-agent-a66b297dfcf8bb4ff   worktree: C:\dev\save-me\.claude\worktrees\agent-a66b297dfcf8bb4ff

### 바꾼 것
- 이력서(type `resume`) 상세: PDF 미리보기·글 편집 칸·[서식 안내]·"미리보기" 탭을 없애고 A4 서류 한 장(`ResumeSheet`, 목업 resume-form)을 둠. 이름·전화·이메일·소개·경력(회사/업무 묶음/줄 또는 번호 프로젝트)·개인 프로젝트·학력·스킬을 칸마다 눌러 입력(contenteditable). 붙여넣기는 글자만, 이름·회사 이름·묶음 제목은 Enter 무시, 줄 Enter/빈 줄 Backspace, 다 지우면 빈 줄 하나, 추가·지우기 버튼 늘 보임(옅게), 프로젝트 번호 다시 세기, 새 항목에 커서. 경력기술서·포트폴리오·묶음 화면·리뷰 칸은 그대로.
- [이력에서 불러오기]: 이력 메뉴를 복사해 빈 칸만 채움(토스트 4종). 증명사진·로고는 화면에만(저장 안 함), 끌어다 놓기 지원.
- 새 이력서(묶음에서 [이력서 만들기])는 빈 칸으로 시작(`data` 빈 구조, `body` 빈 글).
- 저장된 옛 이력서(`data` null)는 열 때 글을 칸으로 자동 변환(`lib/resumeSheet.ts`의 `bodyToResumeData`)해 보여 주고, 열기만으로는 저장하지 않음. 처음 고칠 때 `data`를 저장하고 `body`는 그대로 남음.
- 인쇄: 읽기 전용 사본(`ResumeSheetPrint`, body 아래 `.print-only`)이 편집 도구·자리 표시 글·빈 사진 칸·빈 구역 없이 나옴. 이름 붙은 쪽 `@page resume { size: A4; margin: 14mm 0 }`, `break-inside: avoid`. `window.print()`와 파일 이름 규칙은 그대로.
- 리뷰의 `find`: 서류의 칸 중 첫 일치 칸을 스크롤하고 칸 전체 선택, 못 찾으면 "서류에서 그 부분을 찾지 못했어요".
- 백엔드: `documents.data`(JSON, null 가능) 칸 + 마이그레이션 `b3b3c7c40600`. `ResumeData` Pydantic(camelCase, `from`/`to` 별칭, 100KB 넘으면 422). `Document`에 `data`. `PUT .../documents/{type}`는 `{body}` 또는 `{data}`(둘 다/둘 다 없음/이력서 아닌 종류 → 422), `POST .../documents`는 이력서에 `data` 가능. 가져온 서류를 `data`로 저장하면 `imported_edited`. 가져오기 명령·서버 PDF 코드는 안 건드림.
- 프런트 서비스: `types.ts`(`ResumeData` 등, `DocumentContent = string | { data }`, `SavedDocument.data`), `httpService.ts`, `mockService.ts` 맞춤.
- 문서: `docs/testing.md`(표), `docs/pdf.md`("이력서 인쇄"), `AGENTS.md`(서류 상세 설명), `tech 기획안.md`(상태), `DocumentScreen.tsx` 위쪽 주석.

주요 파일: backend `app/db.py`, `app/models.py`, `app/stores/documents.py`, `app/routers/documents.py`, `migrations/versions/2026_10_25_1718-b3b3c7c40600_documents_resume_data.py`; frontend `src/components/ResumeSheet.tsx`, `DocumentScreen.tsx`, `DocumentGroupScreen.tsx`, `src/lib/resumeSheet.ts`, `src/styles.css`, `src/services/*`.

### 커밋
- 2c0e898 이력서 칸 구조(documents.data) 저장·읽기와 마이그레이션
- c9f26b9 이력서 서류 한 장 칸 입력(ResumeSheet), 글을 칸으로 바꾸는 변환, 서비스의 data 저장
- (마지막) 테스트 보강과 문서, 이 보고서

### 테스트
- backend pytest (PostgreSQL 임시 컨테이너, `test_document_store`, `test_migrations`, `test_import_documents`, `test_documents_api`, `test_resume_data_api`, `test_cover_letter_api`): 76 통과. 새 `test_resume_data_api.py`(남의 데이터 404 포함), 마이그레이션 테스트 추가.
- frontend test (resumeSheet, ResumeSheet, documents, CoverLetterScreen, services, screens): 203 통과, 4 건너뜀(기존). lint 오류 없음. build(타입 검사) 통과.
- 전체 테스트는 돌리지 않았다, CI가 돈다.

### 내가 정한 것
- 서비스 인자: `createDocument`/`saveDocument`의 세 번째 인자를 `string | { data: ResumeData }`로(문자열은 기존 `body`라 기존 호출·테스트가 그대로).
- 서비스 타입 이름: 이력 메뉴의 `Career`와 겹치지 않게 서류 쪽은 `ResumeSheetCareer`/`ResumeSheetEducation`, 프로젝트·묶음·`ResumeData`는 지시서 이름.
- 저장 JSON은 `model_dump(by_alias=True)`(camelCase, `from`/`to`). `data` 칸은 `JSON(none_as_null=True)`로 NULL을 진짜 NULL로. 같은 `data`를 다시 저장하면 `updatedAt`이 안 바뀜(`body`와 같은 규칙).
- `POST`에 `data`와 비어 있지 않은 `body`를 같이 보내면 422.
- 묶음의 종류: `projects`가 있거나 `items`가 비어 있으면 프로젝트형, 아니면 줄형(프로젝트를 다 지워도 [+ 프로젝트 추가]가 남게).
- 스킬 쉼표 나누기는 괄호 안 쉼표를 지킴("AWS (S3, EMR)" 하나). 이력 메뉴 불러오기와 글 변환 모두 같은 규칙.
- 변환: 회사 제목 "회사 · 팀"의 팀은 직무 칸으로(날짜 줄에 직무가 있으면 그것이 먼저). 연락처 줄에서 전화·이메일이 아닌 조각, 학교 줄의 자격증 같은 나머지는 소개 글 아래로. `##`가 구역 이름이 아니면 제목과 글 전체를 소개 글 아래로.
- 인쇄 사본은 회사·학교에 글이 하나도 없으면(로고만 있어도) 그 항목을 뺌.
- 도구 줄 힌트 글, "증명사진 3×4cm"(한 줄) 표기, 로고 버튼 접근성 이름("회사 로고 넣기"/"학교 로고 넣기")은 내가 정함.
- 16px 테스트는 막지 않아서(선택자에 input/textarea 없음) 예외 처리하지 않음. 좁은 화면(모바일)은 확인·수정하지 않음.
- `sampleDocuments.ts`의 `RESUME`를 export(테스트용). 임시 PostgreSQL 컨테이너(`saveme-testpg`)는 끝에 멈춤.
- 사진·로고 저장은 기획안 "남은 일" 표에 이미 있어 그대로 둠(상태만 "구현함, 리뷰 전"으로).

### 질문 (멈춘 경우)
- 없음. 참고: 실제 브라우저에서 줄바꿈 입력(소개 글 Enter)과 인쇄 미리보기는 jsdom으로 못 봐서 사람이 확인하면 좋다(`scripts/preview.ps1`).


## 리뷰 수정 (2차)

- ResumeSheet.tsx: 모든 글 칸의 onKeyDown 맨 앞에 `if (e.nativeEvent.isComposing) return;` (한글 조합 중 Enter/Backspace 무시, 한 줄 칸의 Enter 무시도 조합 중에는 건너뜀). 테스트 추가(조합 중에는 줄이 안 생기고 Enter가 막히지 않음).
- `find("")`는 false.
- styles.css 리뷰 칸 폭 340px -> 320px.
- test_resume_data_api.py: 본문과 data를 같이 보내면 `== 422`만 확인 (PostgreSQL에서 8개 통과).
- 안 고친 것: 프로젝트형 묶음의 프로젝트를 다 지우고 다시 열면 줄형이 된다. 데이터에 묶음의 형태 표시가 없어 `withBlanks`만으로는 구분할 수 없고, 형태 칸을 더하면 저장 구조가 바뀌므로 그대로 둠.
- 테스트: frontend `ResumeSheet` 테스트 2개 파일 41개 통과, lint(경고만)와 build 통과, backend 해당 파일 PostgreSQL 통과. 전체 테스트는 돌리지 않았다, CI가 돈다.
