리뷰한 커밋: 14a067b3b56ea4990dd9b4be6313933cba706d6e

# 리뷰: cover-letter — 합쳐도 됨

꼭 고칠 것: 없음.

## 고치면 좋은 것
- backend/app/models.py `CoverLetterItem.char_limit`: 위쪽 끝이 없어 2,147,483,647보다 큰 수를 넣으면 PostgreSQL INTEGER 범위를 넘어 422가 아니라 500이 난다(그 저장의 다른 문항 글도 저장 안 됨). `le=`로 끝을 두고 mock과 프런트엔드 `parseLimit`에도 같은 끝을 둔다.
- backend/app/stores/documents.py `save_cover_letter`: 모두 지우고 다시 넣기인데 행 잠금이 없어, 같은 자소서에 PUT 두 개가 동시에 오면 (document_id, position) 유니크 위반으로 500이 날 수 있다. `_document` 조회에 `.with_for_update()`.
- frontend/src/services/mockService.ts `saveCoverLetter`: 검사 순서가 백엔드와 다르다(mock은 404 먼저, 백엔드는 422 먼저). 화면 동작에는 영향 없음.
- 사소한 것: types.ts `TextDocumentType` 줄 끝에 주석이 같은 줄로 붙음. routers/documents.py `HTTPException(422,"...")` 띄어쓰기.

## 확인한 것 (요약)
남의 데이터 404와 user_id 거르기, 마이그레이션(DB 중립, 이름 규칙, CASCADE, down_revision), 서버·프런트 글자 수 규칙 일치, 5개 제한 세 곳, 빈 문항 처리, 자동 저장 경합, 서비스 3곳 일치, 입력 칸 16px, 리뷰·가져오기·PDF에서 자소서 제외, 목업 일치, 규칙 준수. 테스트는 다시 돌리지 않음(개발자 보고 기준).

---

# 재리뷰 (범위: 24ca7f6..705b976·14a067b) — 합쳐도 됨

1차 지적 네 가지(char_limit 위쪽 끝, 저장 행 잠금, mock 검사 순서, 사소한 정리)는 모두 고쳐졌고 새로 생긴 꼭 고칠 것은 없다. 위쪽 끝 100000이 백엔드·프런트엔드·mock에서 같고, 잠금은 save_cover_letter에서만 걸려 데드락 고리가 없다.

## 고치면 좋은 것 (병합 뒤에 해도 됨)
- backend/tests/unit/test_cover_letter_store.py 91-93: 쓰이지 않는 `doc_id = ...get_cover_letter(...).id if hasattr(...) else None`이 남음. 지워도 된다.
- 같은 파일 잠금 테스트 1단계: 잠금 없이도 FK 검사·UPDATE가 기다려 통과하므로 잠금을 가려내지 못한다. 실제 검증은 2단계(6스레드 x 5회). 1단계 docstring이 실제보다 강하게 말한다.
- CoverLetterScreen.tsx 295: 제한 칸에 100000 뒤로 숫자를 더 치면 칸이 통째로 비어 "제한 없음"이 된다("0"을 칠 때와 같은 기존 동작). 넘어가도 됨.

리뷰한 커밋(재리뷰): HEAD at 재리뷰 시작 시점.
