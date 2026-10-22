# 작업: 지원서류 PDF를 브라우저 인쇄로 되살리기

## 목표
서류 상세에 A4 미리보기가 다시 보이고, [PDF로 내려받기]를 누르면 서버 없이 브라우저 인쇄 창으로 PDF를 저장할 수 있다. 서버에 Chromium이 필요 없어 이미지와 환경이 가벼운 채로 간다.

## 배경
- 2026-10-22에 서버가 Chromium(Playwright)으로 PDF를 만드는 방식이 무거워 꺼 뒀다 (`docs/pdf.md`, v0.7.3). 꺼 둔 것은 미리보기 칸, 미리보기 탭, [PDF로 내려받기]와 그 확인 창이다.
- 미리보기(`DocumentPages`)는 원래 브라우저에서 그리므로 서버 부담이 없다. 무거운 것은 서버가 PDF 파일을 만드는 부분뿐이었다.
- 오늘의집 서류로 Chromium 인쇄 엔진 PDF를 뽑아 보고 품질이 괜찮다고 사용자가 확인했다.

## 동작
- 서류 상세(`DocumentScreen`)에 미리보기가 항상 보인다: 넓은 화면은 왼쪽 "PDF 미리보기" 칸(몇 쪽인지 `n쪽` 표시)이 있는 3분할, 좁은 화면의 "미리보기" 탭. 모양과 글자는 `PDF_ENABLED`가 켜졌을 때의 기존 화면과 같다. 이 칸·탭·`no-preview` 분기는 `PDF_ENABLED`와 상관없이 기본으로 켠다.
- 위쪽 막대의 [PDF로 내려받기]를 누르면 확인 창 없이 바로 브라우저 인쇄 창(`window.print()`)이 열린다. 사용자는 대상을 "PDF로 저장"으로 고른다.
  - 인쇄 결과는 미리보기와 같은 쪽 모양의 서류 본문만이다. 사이드바, 위쪽 막대, 편집기, 리뷰, 토스트 등은 인쇄에 나오지 않는다 (`@media print`).
  - 인쇄 창의 기본 파일 이름은 `<회사>_<서류>_<작성일>`(`pdfFileName`의 이름에서 `.pdf`를 뺀 것, 브라우저가 `.pdf`를 붙인다)이다. 인쇄 창이 열려 있는 동안 `document.title`을 그 이름으로 바꾸고, 인쇄가 끝나면(`afterprint`) 원래 제목으로 되돌린다.
  - 눌렀을 때 아직 저장 전인 글이 있어도 인쇄는 화면의 현재 글(`body` 상태)로 한다. 저장 실패 토스트는 필요 없다.
- 인쇄용 CSS (`frontend/src/styles.css`): `@page { size: A4; margin: 0 }`, 쪽에 `print-color-adjust: exact`(`-webkit-print-color-adjust`도), 쪽마다 새 쪽(`break-after: page`, 마지막 쪽 제외), 쪽의 그림자·확대 축소(`fit`)는 인쇄에서 없앤다. 머리글·바닥글(날짜, 주소)이 찍히지 않게 여백은 0으로 두고 쪽 안쪽 여백으로 처리한다 (지금 쪽이 이미 안쪽 여백을 갖는지 확인하고 아니면 맞춘다).
- 인쇄용 쪽은 미리보기와 같은 `DocumentPages`를 `fit` 없이 실제 크기(595×842 CSS 픽셀)로 한 번 더 그린다 (화면에서는 숨기고 `@media print`에서만 보인다). 쪽 나눔이 미리보기와 같아야 한다.
- 서류 본문이 비어 있어도 버튼은 누를 수 있다 (빈 한 쪽이 나온다).
- 확인 창(`pdfDialog`)과 `downloadPdf()`의 서버 호출은 없앤다. 버튼은 `window.print()` 호출뿐이다. 하는 중 표시(`pdfBusy`)도 필요 없다.

## 데이터와 API
- 없음. 백엔드는 바꾸지 않는다.

## 서버 PDF 코드 (꺼 둔 채로 남김)
- 사용자 결정: 서버 PDF 코드를 지우지 않고 꺼 둔 채로 둔다. `backend/app/pdf.py`, `routers/documents_pdf.py`, `playwright` 선택 의존성, Docker `WITH_PDF`, `PDF_ENABLED`(백엔드)·`VITE_PDF`(프런트엔드) 스위치, `DocumentPrintScreen`과 `/print/documents/...` 경로, 서비스의 `downloadDocumentPdf`, 그리고 그 PDF 테스트는 그대로 둔다.
- `frontend/src/lib/features.ts`의 `PDF_ENABLED`는 이제 "서버가 만드는 PDF"만 뜻한다. 주석을 그렇게 고친다. 미리보기와 [PDF로 내려받기]는 이 스위치와 상관없다. `PDF_ENABLED`가 켜져 있어도 [PDF로 내려받기]는 인쇄 방식이다 (서버 PDF를 부르는 화면 코드는 남기지 않는다. `downloadDocumentPdf`는 서비스 층에만 남는다).
- `pdfFileName`은 인쇄 파일 이름에도 쓰므로 그대로 쓰고, 그 테스트(`documents.test.ts`)는 `skipIf(!PDF_ENABLED)`를 빼서 항상 돌게 한다.

## 끝났다고 보는 조건
- 테스트 (프런트엔드, `PDF_ENABLED`와 상관없이 기본 실행에서 돈다):
  - `documents.test.tsx`: 미리보기 칸("PDF 미리보기")과 "미리보기" 탭이 보인다 / 글을 고치면 미리보기가 따라 바뀐다 / [PDF로 내려받기]가 확인 창 없이 `window.print()`를 부른다 (`vi.spyOn(window, "print")`) / 인쇄 중 `document.title`이 `<회사>_<서류>_<작성일>`이고 `afterprint` 뒤 원래대로 돌아온다 / 인쇄용 쪽 영역이 있다.
  - 지금 `skipIf(PDF_ENABLED)`/`skipIf(!PDF_ENABLED)`로 갈려 있는 미리보기·PDF 관련 테스트를 고친다: "PDF 버튼·미리보기 칸이 없다" 테스트는 지우고, 미리보기 테스트(`shows the pages and the PDF button`, `updates the preview as you type…`, 3분할 테스트 등)는 `skipIf`를 뺀다. 서버 PDF 테스트(`downloadDocumentPdf`, 확인 창, 인쇄용 화면)는 그대로 `PDF_ENABLED` 때만 돈다 (`DocumentPages`는 서버 PDF와 상관없이 항상 쓰므로 그 테스트의 `describe.skipIf`는 뺀다. `DocumentPrintScreen`만 남긴다).
  - `styles.css`를 읽는 테스트가 있으면 인쇄용 규칙(`@page` A4, `print-color-adjust: exact`)을 확인하는 테스트를 더한다. 입력 칸 16px 규칙은 그대로.
- `npm run build`(타입 검사)와 `npm run lint`가 통과한다. 백엔드는 안 바꾸므로 백엔드 테스트는 돌리지 않는다.
- 문서: `docs/pdf.md`를 고친다 (맨 위 요약: 미리보기와 브라우저 인쇄 내려받기가 기본으로 켜져 있고, 서버 PDF 방식만 꺼 둔 것으로 바뀌었음을 쓴다. "무엇이 꺼져 있나" 표에서 프런트엔드 화면 줄은 서버 PDF 관련 부분만 남긴다). `AGENTS.md`의 "서류 PDF는 지금 쓰지 않는다" 항목, `README.md`·`docs/testing.md`에서 PDF를 말한 곳도 맞춘다 (서류 상세에는 미리보기·편집·리뷰가 보이고, [PDF로 내려받기]는 브라우저 인쇄).
- 실제 확인(개발자): `VITE_PDF` 없이 `make run front`/`make run back`으로 서류 상세를 열어 미리보기가 보이고 [PDF로 내려받기]에서 인쇄 창이 열리는지 본다. 진짜 데이터(`saveme`)는 읽지도 쓰지도 않는다 (`saveme_dev`의 서류나 새로 만든 서류로).

## 화면
- 목업: `docs/archive/mockup/saveme-mvp.html`의 서류 상세 화면. 단, 만든 화면은 코드가 기준이다: 미리보기 칸·탭의 모양은 `DocumentScreen.tsx`에서 `PDF_ENABLED`로 감싸 둔 부분이 그대로 되살아나는 것이다. 새 화면은 없다.

## 하지 않을 것
- 백엔드, 마이그레이션, API 변경.
- 서버 PDF 코드 삭제 (사용자 결정으로 남김).
- 새 의존성 (jsPDF 등) 추가.
- 모바일 레이아웃 손보기 (이미 있는 "미리보기" 탭이 되살아나는 것 말고는 하지 않는다).
- 브라우저별(Safari, Firefox) 인쇄 차이 맞추기. Chrome/Edge 기준.

## 사용자와 정한 것
- 서버 PDF 코드는 지우지 않고 꺼 둔 채로 남긴다.
- [PDF로 내려받기]는 확인 창 없이 바로 인쇄 창을 연다. 파일 이름은 `회사_서류_날짜`로 미리 채운다.
- 미리보기(칸·탭)는 기본으로 켠다.
- 이 방식은 사용자가 오늘의집 서류 샘플 PDF를 보고 괜찮다고 정했다.

## 릴리즈
- 버전 v0.7.4 (PATCH: 끈 것(v0.7.3)을 되돌리는 작은 수정으로 본다). 버전을 올리지 않는다: 병합할 때 퍼블리셔가 한다.
