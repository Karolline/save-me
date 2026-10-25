리뷰한 커밋: 0c078ddee7130d5be474a6c2b301ae1626dd9e71

# 리뷰: cover-letter — 합쳐도 됨

꼭 고칠 것: 없음.

## 고치면 좋은 것
- backend/app/models.py `CoverLetterItem.char_limit`: 위쪽 끝이 없어 2,147,483,647보다 큰 수를 넣으면 PostgreSQL INTEGER 범위를 넘어 422가 아니라 500이 난다(그 저장의 다른 문항 글도 저장 안 됨). `le=`로 끝을 두고 mock과 프런트엔드 `parseLimit`에도 같은 끝을 둔다.
- backend/app/stores/documents.py `save_cover_letter`: 모두 지우고 다시 넣기인데 행 잠금이 없어, 같은 자소서에 PUT 두 개가 동시에 오면 (document_id, position) 유니크 위반으로 500이 날 수 있다. `_document` 조회에 `.with_for_update()`.
- frontend/src/services/mockService.ts `saveCoverLetter`: 검사 순서가 백엔드와 다르다(mock은 404 먼저, 백엔드는 422 먼저). 화면 동작에는 영향 없음.
- 사소한 것: types.ts `TextDocumentType` 줄 끝에 주석이 같은 줄로 붙음. routers/documents.py `HTTPException(422,"...")` 띄어쓰기.

## 확인한 것 (요약)
남의 데이터 404와 user_id 거르기, 마이그레이션(DB 중립, 이름 규칙, CASCADE, down_revision), 서버·프런트 글자 수 규칙 일치, 5개 제한 세 곳, 빈 문항 처리, 자동 저장 경합, 서비스 3곳 일치, 입력 칸 16px, 리뷰·가져오기·PDF에서 자소서 제외, 목업 일치, 규칙 준수. 테스트는 다시 돌리지 않음(개발자 보고 기준).
