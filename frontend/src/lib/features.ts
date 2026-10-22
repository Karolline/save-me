/**
 * 서버가 만드는 지원서류 PDF (Chromium으로 PDF 파일을 만드는 방식, 인쇄용 화면 /print/documents/...).
 * 지금은 쓰지 않는다: 코드는 남겨 두고 이 상수로만 끈다. 다시 켜는 법은 docs/pdf.md.
 * 서류 상세의 미리보기와 [PDF로 내려받기](브라우저 인쇄)는 이 스위치와 상관없이 늘 켜져 있다.
 * 켜려면 빌드·테스트 때 `VITE_PDF=1` (백엔드는 `PDF_ENABLED=1`).
 */
export const PDF_ENABLED = import.meta.env.VITE_PDF === "1";
