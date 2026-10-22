# 지원서류 PDF (지금은 꺼 둠)

사용자 결정 (2026-10-22): Chromium과 한글 글꼴, 메모리 때문에 무거워서 쓰지 않는다. 코드는 지우지 않고 꺼 두었다. 서류 상세에는 **편집**과 **리뷰**만 보인다 (왼쪽 PDF 미리보기, [PDF로 내려받기], 좁은 화면의 미리보기 탭이 없다).

## 무엇이 꺼져 있나

| 영역 | 꺼진 모습 | 켜는 스위치 |
|---|---|---|
| 백엔드 엔드포인트 `GET /api/document-groups/{id}/documents/{type}/pdf` (`app/routers/documents_pdf.py`) | 라우터를 붙이지 않는다 (404) | 환경 변수 `PDF_ENABLED=1` |
| 의존성 `playwright` | 기본 `uv sync`에 없다 (`pyproject.toml`의 선택 의존성 `pdf`) | `uv sync --extra pdf` |
| Docker 이미지 | Chromium, `fonts-noto-cjk`, playwright가 없다 | 빌드 인자 `WITH_PDF=1` (프런트엔드 `VITE_PDF`와 백엔드 `PDF_ENABLED`도 같이 켠다) |
| 프런트엔드 화면 (`DocumentScreen`) | 미리보기 칸·탭, PDF 버튼과 대화상자가 없다. 인쇄용 `/print/documents/...`는 "서류를 열지 못했어요" | 빌드·테스트 때 `VITE_PDF=1` (`src/lib/features.ts`의 `PDF_ENABLED`) |
| 테스트 | `pdf` 표시가 붙은 백엔드 테스트는 기본 실행에서 빠진다. 프런트엔드 PDF 테스트는 건너뛴다. compose의 PDF 테스트는 `skip` | 아래 "테스트" |

남아 있는 코드 (지우지 않음): `backend/app/pdf.py`, `backend/app/routers/documents_pdf.py`, `frontend/src/components/{DocumentPrintScreen,documentPages}.tsx`, `lib/documents.ts`의 쪽 나눔(`paginate`)과 `pdfFileName`, 서비스 계층의 `downloadDocumentPdf`(types, HTTP, mock), `config.py`의 `pdf_enabled`·`pdf_frontend_url`, `devserver.py`의 `PDF_FRONTEND_URL`. 서비스 계층(`types.ts`)을 바꿀 때는 `downloadDocumentPdf`도 계속 맞춘다.

## 다시 켜기

1. `cd backend`, `uv sync --extra pdf`, `uv run playwright install chromium`.
2. 백엔드에 `PDF_ENABLED=1` (개발 서버라면 셸에 설정), 프런트엔드 개발 서버는 `VITE_PDF=1 npm run dev`.
3. Docker 이미지: `docker build --build-arg WITH_PDF=1 ...` (compose라면 `app.build.args`에 `WITH_PDF: "1"`).
4. 테스트: 백엔드 `uv run pytest -m pdf` (`frontend/`에서 `npm run build`가 먼저 필요), 프런트엔드 `VITE_PDF=1 npm test`, 이미지는 `tests/compose`의 `skip`을 지우고 돌린다. CI에서 돌리려면 `ci.yml`에 `--extra pdf`와 `-m pdf` 단계를 더한다.
5. 켜기로 정했으면 이 방식(스위치)을 걷어내고 기본값을 켠다.

## 만드는 방식 (참고)

[PDF로 내려받기]는 서버가 헤드리스 Chromium(Playwright)으로 프런트엔드의 인쇄용 화면(`/print/documents/:묶음/:종류`)을 열어 만든다. 요청의 세션 쿠키를 Chromium에 그대로 준다. Docker 이미지에는 Chromium과 한글 글꼴(Noto Sans CJK)이 들어 있고, 같은 앱의 자기 주소(`http://127.0.0.1:$PORT`, `PDF_FRONTEND_URL`로 바꿈)로 화면을 연다. 개발 PC에서는 개발 서버(`make run back`)가 Vite 개발 서버(`make run front`, 5180)를 쓴다 (둘 다 떠 있어야 PDF가 된다). 개발 서버가 Vite를 여는 주소는 `http://localhost:5180`이다 (Windows에서 Vite는 IPv6 `::1`에만 떠서 `127.0.0.1`로는 안 닿는다).

쪽 글꼴은 IBM Plex Sans KR(구글 폰트)이 먼저이고, 못 받으면 Noto Sans CJK KR로 돌아간다: 미리보기와 PDF의 쪽 나눔이 같으려면 같은 글꼴이어야 하므로 컨테이너가 인터넷에 닿는 것이 좋다. 인터넷이 안 되어도 PDF는 멈추지 않는다 (글꼴 요청은 4초, 화면의 글꼴 대기는 6초까지만 기다리고 Noto로 계속하며, 그때는 쪽 나눔이 미리보기와 조금 다를 수 있다). 쪽은 595×842 CSS 픽셀이고 1.3333배로 내면 A4(595×842pt)다.
