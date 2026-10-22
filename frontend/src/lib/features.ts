/**
 * 지원서류 PDF (서류 상세의 미리보기 · [PDF로 내려받기] · 인쇄용 화면). 지금은 쓰지 않는다:
 * 코드는 남겨 두고 이 상수로만 끈다. 다시 켜는 법은 docs/pdf.md.
 * 켜려면 빌드·테스트 때 `VITE_PDF=1` (백엔드는 `PDF_ENABLED=1`).
 */
export const PDF_ENABLED = import.meta.env.VITE_PDF === "1";
