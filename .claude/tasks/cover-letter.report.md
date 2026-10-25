## 결과: 완료
브랜치: worktree-agent-a43845bb4b3abae77   worktree: C:\dev\save-me\.claude\worktrees\agent-a43845bb4b3abae77

### 바꾼 것
- 묶음에 네 번째 서류 "자소서"(`coverletter`): 묶음 화면 4칸 (문항 N개 · 합계 N자, 제한 넘은 문항이 있으면 빨간 "글자 수 초과 N문항", 리뷰 칸은 "검토 전"만), 서류 전환 탭에 "자소서", 없으면 "아직 없어요" + [만들기].
- 자소서 편집 화면 `CoverLetterScreen` (목업대로): 위쪽 바, 왼쪽 문항 사이드바(sticky 220px, 클릭하면 그 카드로), 문항 카드(문항·글자 수 제한·답변·글자 수 줄·진행 막대, 90% 노랑, 초과 빨강), [+ 문항 추가](5개에서 비활성+안내), 문항 지우기·자소서 지우기 확인, 자동 저장(통째, 차례 보내기, 떠날 때 저장). 글자 수 순수 함수는 `frontend/src/lib/coverLetter.ts`.
- 백엔드: 테이블 `cover_letter_items` + 마이그레이션 `ca7d4f9d8e51`, `GET/PUT /api/document-groups/{id}/cover-letter`, 묶음 응답 서류 칸에 `itemCount/totalChars/overLimitCount`, 본문 저장·리뷰 덩어리·찾을 서류에 자소서면 422, 문항 6개/제한 1 미만 422.
- 서비스 층(`types.ts`, `httpService.ts`, `mockService.ts`)에 `getCoverLetter`, `saveCoverLetter` 추가, mock도 같은 규칙.
- 주요 파일: backend `app/db.py`, `app/models.py`, `app/stores/documents.py`, `app/routers/documents.py`, `migrations/versions/2026_10_25_1605-ca7d4f9d8e51_cover_letter_items.py`; frontend `components/CoverLetterScreen.tsx`, `components/DocumentGroupScreen.tsx`, `lib/coverLetter.ts`, `lib/documents.ts`, `router.tsx`, `styles.css`; `docs/testing.md`.

### 커밋
- 24b7948 자소서: 문항 테이블, 저장·조회 API, 묶음 칸 요약
- e222887 자소서: 편집 화면, 글자 수 계산, 묶음 4번째 칸, 서비스 층
- (마지막) 자소서: 테스트 문서와 개발자 보고

### 테스트
- backend pytest (PostgreSQL 임시 컨테이너): `test_cover_letter_store`, `test_document_store`, `test_cover_letter_api`, `test_documents_api`, `test_import_documents`, `test_migrations` 71 통과.
- frontend test: `coverLetter.test.ts`, `coverLetterService.test.ts`, `CoverLetterScreen.test.tsx`, `documents.test.tsx`, `documents.test.ts`, `screens.test.tsx`(입력 칸 16px), `router.test.tsx`, `services/` 모두 통과. build 통과, lint 오류 없음 (기존 경고만).
- 전체 테스트는 돌리지 않았다, CI가 돈다.
- 개발 서버 확인: 8010 포트를 다른 서버가 쓰고 있어서 `make run`을 쓰지 못하고, 내 백엔드(uvicorn 8011, `saveme_dev`)와 임시 vite 설정(5181, 커밋 안 함, 지움)으로 열어 봤다. 자소서 편집 화면(글자 수·초과 표시·사이드바)과 묶음 4번째 칸이 목업대로 보였다. 확인용 묶음은 지웠다. `saveme_dev`에는 마이그레이션이 적용돼 있다. 진짜 DB `saveme`는 건드리지 않았다.

### 내가 정한 것
- 서류 종류가 늘어서 `TextDocumentType`(자소서 제외)을 더하고 리뷰·인쇄·가져오기 타입에 썼다. 가져오기 JSON에 `coverletter`가 있으면 검증 오류. 서버 PDF 라벨 표에 "자소서"만 더했다 (KeyError 방지).
- 자소서 만들기의 body는 서버가 무시하고 빈 문자열로 저장. 묶음 칸의 "고친 날"은 기존 칸과 같은 형식(YYYY-MM-DD)으로 두었다 (목업의 MM-DD가 아님).
- 빈 카드 처리: 문항이 없으면 빈 카드 1개를 보여 주고, 저장할 때 모든 문항이 완전히 비어 있으면 빈 목록을 저장한다 (빈 문항이 DB에 남지 않음). 그 밖에는 빈 문항도 사용자가 더한 것이므로 그대로 저장. 마지막 하나를 지우면 빈 카드 하나가 남는다.
- 글자 수 제한 입력: 1 이상 정수가 아니면(0, 음수, 소수) 제한 없음으로 처리해 칸이 비워진다. 서버는 0·음수·소수에 422.
- 사이드바 클릭은 해시 링크 대신 버튼으로 `scrollIntoView` + 문항 글 칸 포커스. 새 문항을 더하면 그 문항 글 칸에 포커스.
- 묶음 칸의 "새로" pill(목업)은 넣지 않았다. 샘플 mock 데이터에 자소서는 더하지 않았다.
- 서류 전환 탭의 `types`에 자소서가 보이고, 서류 상세(글 편집기)에서 자소서 탭을 누르면 `/documents/:groupId/coverletter` 편집 화면으로 간다 (`/print/...`는 자소서면 "서류를 열지 못했어요").
- `DocumentSlot`의 새 칸은 JSON `itemCount/totalChars/overLimitCount`. 서버 글자 수 `count_chars`는 `app/models.py`에 둠.
- 병합 시 지시서·목업은 worktree에 없어서(브랜치가 main의 지시서 커밋 전에 만들어짐) main 쪽 파일을 읽어 구현했다.
