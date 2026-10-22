리뷰한 커밋: 9b7d0f0

## 리뷰 결과: 고친 뒤 합치기

### 꼭 고칠 것
- [frontend/src/styles.css:747 `body > *:not(.print-only) { display: none !important; }`] 이 인쇄 규칙이 모든 화면에 걸려서, 꺼 둔 서버 PDF 경로가 망가진다. `DocumentPrintScreen`(`/print/documents/...`)의 `.print-root`는 `body > #root` 안에 있고 portal을 쓰지 않는다. `backend/app/pdf.py:79`는 `page.emulate_media(media="print")` 뒤 `page.pdf()`를 부르므로 `#root`가 숨겨져 서버 PDF가 빈 쪽이 된다. 다시 켜면(`VITE_PDF=1`, `PDF_ENABLED=1`) 바로 깨지고, `test_documents_pdf.py`는 `-m pdf`로만 돌아 CI도 못 잡는다. 다른 화면에서 Ctrl+P를 눌러도 빈 종이만 나온다. 고치는 법: 숨김을 `.print-only`가 있을 때로 좁힌다 (예: `body:has(> .print-only) > *:not(.print-only) { display: none !important; }`). `screens.test.tsx`의 정규식과 `docs/pdf.md`의 해당 문장도 맞춘다.

### 고치면 좋은 것
- [documents.test.tsx "can print an empty document (one blank page)"] `window.print` 호출만 본다. `.print-only .pg`가 1개인지도 확인한다.
- [DocumentScreen.tsx `printPdf`] `afterprint`가 안 오는 브라우저에서는 제목이 바뀐 채 남는다. Chrome/Edge 기준이라 참고만.

### 확인한 것
지시서와 동작, 파일 이름·제목 복원, portal과 높이 재기, 인쇄 CSS(A4, zoom 1.3325), 테스트 정리, 문서, 백엔드 무변경, 새 의존성 없음, 한국어 모두 맞음.
