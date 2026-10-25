리뷰한 커밋: 4558f38a913cf51de7d793f22779f6061b9000e4

## 리뷰 결과: 고친 뒤 합치기

`resume-form` 브랜치(커밋 3개: 2c0e898, c9f26b9, 96306f2)를 지시서와 AGENTS.md에 비춰 읽었다. 지시서가 말한 것은 백엔드부터 서비스, 화면, 문서까지 거의 다 들어 있다. 다만 한글을 입력할 때 깨질 수 있는 곳이 하나 있어서, 그것만 고치고 합치기를 권한다.

### 꼭 고칠 것
- `frontend/src/components/ResumeSheet.tsx`:94-97, 282-291: 줄 칸의 Enter/Backspace 처리와 한 줄 칸의 Enter 무시가 한글 조합 중인지(`e.nativeEvent.isComposing`)를 보지 않는다. 저장소 어디에도 `isComposing` 처리가 없다.
  - 무엇이 깨지나: Chrome/Edge에서 한글 글자를 조합하는 중에 Enter를 누르면 keydown이 `key: "Enter"`, `isComposing: true`로 먼저 온다. 그런데 이 코드는 그 자리에서 `preventDefault`를 하고, 새 줄을 만들고, 커서를 새 줄로 옮긴다.
  - 조합이 끝나기 전에 커서가 옮겨지면 마지막 글자가 새 줄에 한 번 더 들어가거나 잘릴 수 있다. 사용자는 거의 늘 한글로 적고 "글을 적고 Enter"가 줄 칸의 주된 흐름이라 자주 겪게 된다.
  - 고치는 법: `onKeyDown`의 맨 앞에서 `if (e.nativeEvent.isComposing) return;` 한 줄.
  - 아직 실제로 보지는 못했다. jsdom 테스트로는 잡히지 않으니, 고친 뒤 `scripts/preview.ps1`로 한글을 치고 바로 Enter를 눌러 보는 확인이 필요하다.

### 고치면 좋은 것
- `ResumeSheet.tsx`:194-196: `find("")`이면 `"".includes("")`가 참이라 첫 칸(이름)이 선택된다. 다른 서류가 쓰는 `findLine`은 빈 글이면 null을 돌려준다. `if (!text) return false`를 넣는다.
- `frontend/src/styles.css`:534: 리뷰 칸 폭이 `340px`인데 목업은 `320px`이다. 숫자는 목업에 맞추는 편이 좋다.
- `frontend/src/lib/resumeSheet.ts`:50: 프로젝트형 묶음에서 프로젝트를 모두 지우면 `{items: [], projects: []}`로 저장되고, 다시 열면 `withBlanks`가 빈 줄 하나짜리 줄형 묶음으로 바꾼다. 화면에서는 [+ 프로젝트 추가]가 보였는데 다시 열면 [+ 줄 추가]로 바뀐다. 작은 문제라 그대로 두어도 된다.
- `backend/tests/integration/test_resume_data_api.py`:442-443: `both.status_code in (409, 422)` 검사는 이미 이력서가 있는 묶음에 보내서 409도 통과로 친다. 빈 묶음에 보내 422만 확인하는 편이 분명하다. mock은 100KB 제한을 흉내 내지 않지만 지시서가 mock에 꼭 요구한 규칙은 아니다.

### 테스트
- 리뷰어는 직접 돌리지 않았다. 개발자 보고: 백엔드 76개 통과(PostgreSQL), 프런트엔드 203개 통과에 기존 4개 건너뜀, 린트와 빌드 통과.

### 확인한 것
- 옳음: 미리보기·글 편집 칸·[서식 안내]·"미리보기" 탭이 빠지고 서류 한 장이 들어갔다. 경력기술서·포트폴리오는 그대로. 목업과 같은 칸 순서·자리 표시 글, 늘 보이는 추가·지우기 버튼, 번호 다시 세기, 새 항목 커서, 붙여넣기 글자만. [이력에서 불러오기] 빈 칸만 채움과 토스트 문구. 사진·로고는 저장 안 함. 인쇄 사본에 편집 도구·자리 표시 글·빈 사진 칸 없음, `@page resume`, `break-inside: avoid`. `find` 실패 문구. 옛 이력서는 열 때 칸으로 변환하고 열기만으로는 저장하지 않으며, 알아보지 못한 글은 소개 글 아래에 남는다.
- 테스트: 지시서의 "끝났다고 보는 조건"을 하나씩 확인하는 테스트가 있다 (`ResumeSheet.test.tsx`, `resumeSheet.test.ts`, `test_resume_data_api.py`, store·마이그레이션·서비스 테스트). `docs/testing.md` 표도 고쳤다.
- 약속: 백엔드 `ResumeData`와 `types.ts`, HTTP 서비스, mock 서비스가 서로 맞다. 가져온 서류를 `data`로 저장하면 `imported_edited`.
- DB: 모델과 마이그레이션이 함께 바뀌었고 새 칸은 null 허용이라 기존 줄을 지킨다. 마이그레이션 테스트가 있다. SQLite 코드 없음.
- 사용자 분리: 새 테이블 없음, store는 `user_id`로 거르고, 남의 묶음 서류 저장·조회·만들기는 404 테스트가 있다.
- 언어·규칙: 한국어/영어 규칙 준수, 새 의존성·버전 올리기·개인 데이터 없음, 커밋 3개로 작음, 가져오기 명령과 서버 PDF 코드는 건드리지 않음.
- 문서: `AGENTS.md`, `docs/pdf.md`, `docs/testing.md`, `tech 기획안.md`, `DocumentScreen.tsx` 주석을 고쳤다.

---

## 재리뷰 (커밋 4558f38까지): 합쳐도 됨

`git diff 96306f2 4558f38`를 읽었다. 꼭 고칠 것(한글 조합 중 `isComposing` 처리)은 글 칸 `Field` 하나의 `onKeyDown` 맨 앞에서 한 번에 덮인다(한 줄 칸 Enter 무시, 줄 칸 Enter·Backspace). `find("")` false, 리뷰 칸 폭 320px, API 테스트 422 확인이 반영됐다. 새 문제 없음.

- 남은 것: 프로젝트형 묶음의 프로젝트를 다 지우고 다시 열면 줄형으로 바뀐다 (저장 데이터에 묶음 형태 표시가 없어 구조 변경이 필요해 보류, 나중 일). Safari 일부 버전은 조합을 끝내는 Enter를 `isComposing: false`로 보낸다 (PC Chrome/Edge가 주 대상이라 참고만).
- 직접 돌린 테스트 없음 (개발자 보고를 믿음). 실제 브라우저에서 한글을 치고 바로 Enter를 누르는 확인과 인쇄 미리보기는 사람이 `scripts/preview.ps1`로 한 번 봐야 한다.
