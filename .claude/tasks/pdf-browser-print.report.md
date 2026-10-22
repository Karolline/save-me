## 결과: 완료
브랜치: worktree-agent-a91debb58a8e46f42   worktree: C:\dev\save-me\.claude\worktrees\agent-a91debb58a8e46f42

### 바꾼 것
- 서류 상세에 왼쪽 "PDF 미리보기" 칸(n쪽), 좁은 화면 "미리보기" 탭, 3분할이 `PDF_ENABLED`와 상관없이 항상 보인다.
- [PDF로 내려받기]는 확인 창과 서버 호출 없이 `window.print()`를 바로 부른다. 인쇄 중 `document.title`이 `<회사>_<서류>_<작성일>`이고 `afterprint`에서 원래대로 돌아온다. 저장 전 글도 화면의 현재 글로 인쇄한다.
- 인쇄용 쪽: `DocumentScreen`이 `createPortal`로 `document.body` 아래 `.print-only`에 `DocumentPages`(fit 없음)를 한 번 더 그린다. `styles.css`: `@page { size: A4; margin: 0 }`, `print-color-adjust: exact`, 쪽마다 `break-after: page`(마지막 제외), 그림자 없음, 인쇄 때 `body > *:not(.print-only)` 숨김. 쪽은 이미 안쪽 여백(padding)을 갖고 있어 그대로 썼다.
- `pdfDialog`, `pdfBusy`, `downloadPdf()` 제거. `features.ts` 주석을 "서버가 만드는 PDF"로 고침. 서버 PDF 코드는 그대로 둠.
- 테스트: `documents.test.tsx`(미리보기 테스트 `skipIf` 제거, "PDF 없음" 테스트와 옛 서버 PDF 다운로드·토스트·닫기 테스트 제거, `window.print` 호출/제목/인쇄용 영역/빈 서류 테스트 추가, `DocumentPages` describe의 `skipIf` 제거), `documents.test.ts`(`pdfFileName` 항상 실행), `screens.test.tsx`(인쇄 CSS 규칙 테스트 추가).
- 문서: `docs/pdf.md`, `AGENTS.md`, `README.md`, `docs/testing.md`.
- 실제 확인: `saveme_dev`에서 `make run` 대신 `app.devserver`와 `npm run dev`로 띄워 새 서류(14섹션)를 열었다. 미리보기 6쪽, 인쇄용 6쪽, print 미디어에서 앱 `display:none`, 쪽 폭 792.8px, Chromium `page.pdf`로 뽑으면 정확히 6쪽(빈 쪽 없음). 실제 인쇄 대화창 클릭은 못 봤다(브라우저 자동화로 대신). 시험 서류는 지웠고 `saveme`는 건드리지 않았다.

### 커밋
- 0171abe 서류 상세의 미리보기를 되살리고 [PDF로 내려받기]를 브라우저 인쇄로 바꿈 ...

### 테스트
- backend pytest: 안 돌림 (백엔드 안 바꿈)
- frontend test: documents/screens/lib documents 90 통과 + 2 건너뜀(서버 PDF 인쇄용 화면), jobs/documentsService 43 통과 + 2 건너뜀. lint 통과(기존 경고만), build 통과. 전체 테스트는 돌리지 않았다, CI가 돈다.

### 내가 정한 것
- worktree가 지시서 커밋 앞에서 만들어져 있어 `main`으로 fast-forward했다 (지시서만 늘어남).
- 인쇄용 쪽을 화면에서 숨길 때 `display:none`이면 높이를 못 재서 쪽 나눔이 틀어지므로, `position:fixed; left:-10000px; visibility:hidden`으로 치우고 `@media print`에서만 보이게 했다.
- A4(793.7x1122.5 CSS px)에 595x842 쪽을 맞추려 인쇄에서 `zoom: 1.3325`(4/3보다 약간 작게, 1쪽이 넘쳐 빈 쪽이 생기지 않게).
- `.print-only`는 `aria-hidden`이라 접근성 쿼리에 잡히지 않는다.
- `DocumentScreen`의 옛 서버 PDF 다운로드 테스트들은 화면 코드가 없어졌으므로 지웠다 (서비스 층의 `downloadDocumentPdf` 테스트는 그대로).

### 질문 (멈춘 경우)
- 없음

## 리뷰 지적 수정
- 인쇄 숨김 규칙을 `body:has(> .print-only) > *:not(.print-only)`로 좁혔다: `.print-only`가 있는 서류 상세에서만 앱을 숨기고, 서버 PDF의 `/print/...` 화면과 다른 화면의 Ctrl+P는 그대로 나온다. `screens.test.tsx`의 정규식을 맞추고, 좁히지 않은 `body > *:not(.print-only)` 규칙이 없다는 확인을 더했다. `docs/pdf.md`의 문장도 고쳤다. (jsdom은 print 미디어를 못 그려서 CSS 문자열 확인으로 보였다.)
- `documents.test.tsx`의 빈 서류 인쇄 테스트가 `.print-only .pg`가 1개인지 확인한다.
- `DocumentScreen.printPdf`: 원래 제목을 ref에 두고, afterprint, 다음 인쇄 직전, 화면이 닫힐 때(cleanup) 되돌린다.
- 테스트: screens/documents 68 통과 + 2 건너뜀, build와 lint 통과(기존 경고만). 전체 테스트는 돌리지 않았다, CI가 돈다.
