## 결과: 완료
브랜치: worktree-agent-a01bfc5a52f606c5a   worktree: C:\dev\save-me\.claude\worktrees\agent-a01bfc5a52f606c5a

### 바꾼 것
- 공고분석 수정 화면: 상태가 "지원 안 함"일 때만 한 줄 결론 바로 아래에 "미지원 사유" 입력칸(textarea, placeholder "지원하지 않기로 한 이유를 적어 두세요")이 보인다. 다른 상태로 바꾸면 칸은 사라지지만 글은 초안에 남아 그대로 저장된다.
- 공고분석 상세 화면: 상태가 "지원 안 함"이면 결론 상자 아래에 "미지원 사유" 상자(줄바꿈 유지)를 보이고, 비어 있으면 "적어 둔 사유가 없습니다".
- 백엔드: `JobAnalysisRow.skip_reason`(Text, 기본 ""), 마이그레이션 `870dbfc8d9f6`, `Job`/`JobInput`에 `skipReason`, `JobStore._fill`/`to_job`이 저장·반환.
- 프런트엔드: `types.ts`(JobFields), `lib/jobs.ts`(JobDraft, toDraft, fromDraft), `mockService.ts`(emptyJobFields), 샘플 분석(늘봄카드)에 사유 하나. `httpService.ts`는 JobInput을 그대로 보내서 코드 변경 없음.
- 주요 파일: backend/app/{db,models}.py, backend/app/stores/jobs.py, backend/migrations/versions/2026_10_22_1310-870dbfc8d9f6_job_analyses_skip_reason.py, frontend/src/components/{JobEditScreen,JobViewScreen}.tsx.

### 커밋
- (아래 커밋 하나, 해시는 git log 참고)

### 테스트
- backend pytest: 전체 391 통과 (PostgreSQL 18 임시 컨테이너, 마이그레이션-모델 일치 테스트 포함). 새 테스트: 왕복·기본값 "", 남의 데이터 404, 가져오기 `--replace-verified` 뒤에도 사유 유지.
- frontend: 건드린 파일(jobs.test.tsx, lib/jobs.test.ts, mockService.test.ts) 83 통과. 전체 `npm test`는 부하로 인한 타임아웃 3건(jobs 회사 동향 저장, reviews 키보드 순서 변경, experiences 후기 고르기)이 났으나 (처음 돌렸을 때는 9건, 다른 파일 포함) 해당 3개 파일을 따로 돌리면 74개 모두 통과: 내 변경과 무관한 느린 테스트의 타임아웃. build 통과, lint 오류 없음(기존 경고만).
- 입력칸 글자 크기는 기존 `.textarea` 클래스를 써서 16px 규칙 테스트(styles) 그대로 적용.

### 내가 정한 것
- 가져오기 보존 방식: `JobInput`에만 `skip_reason`을 두고(`JobFields`에는 두지 않음), `_fill`은 `"skip_reason" in model_fields_set`일 때만 쓴다. 가져오기는 `JobInput`을 사유 없이 만들어 칸이 안 건드려진다. 가져오기 형식(`JobFields`, `docs/job-inbox.md`, `importers/jobs.py`)은 그대로.
- 상세의 사유 상자는 기존 `.conclusion` 스타일을 재사용하고 `white-space: pre-wrap`만 인라인으로 더했다 (라벨 `aria-label="미지원 사유"`).
- 입력칸은 결론 칸과 같은 `row-fields` 안, 한 줄 결론과 기술 핏 사이에 wide 칸으로 두었다.
- 마이그레이션 autogenerate가 `saveme_dev`가 뒤처진 탓에 회사 동향 칸까지 끼워 넣어서, `skip_reason` 하나만 남기도록 손으로 고쳤다. 그 사이 한 번 적용한 탓에 `saveme_dev`에는 회사 동향 칸이 같이 들어가 있다(이미 있어야 할 칸이라 문제 없음). 진짜 DB `saveme`는 건드리지 않았다.
- 서버는 상태와 상관없이 받은 사유를 저장한다 (화면이 "지원 안 함"일 때만 칸을 보인다).
