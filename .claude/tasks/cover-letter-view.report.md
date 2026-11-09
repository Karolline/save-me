## 결과: 완료
브랜치: task/cover-letter-view   worktree: C:\dev\save-me\.claude\worktrees\cover-letter-view

### 바꾼 것
- 자소서를 열면 조회 화면이 먼저 보인다 (입력 칸 없음, 문항 글 · 어필포인트(있을 때만) · 답변 · 글자 수 줄/막대, 읽기용 글은 줄바꿈 유지). 위에 [편집]과 [자소서 지우기], 저장 표시는 없음. [편집] → 편집 화면(경로 `?mode=edit`, 새로고침해도 유지), [완료] → 저장 후 조회 (저장 실패면 이동 안 하고 토스트). 문항이 없는 빈 자소서는 편집으로 열리고, 모두 비운 채 [완료]하면 편집에 남는다.
- 편집 카드 순서: 문항 → 글자 수 제한 → 어필포인트(`textarea cl-p`) → 답변. 어필포인트는 글자 수·합계에 안 세고, 어필포인트만 있는 문항은 빈 문항이 아니라 저장된다.
- 백엔드: `cover_letter_items.appeal`(Text, NOT NULL, server_default "") + 마이그레이션 `95daf954dc12`, `CoverLetterItem.appeal`(안 보내면 빈 글), store 읽기·쓰기, `agent_read document`가 어필포인트가 있는 문항에만 "어필포인트(작성 의도 메모):" 줄을 낸다.
- 프런트: `types.ts`·`emptyItem`·mock(`appeal ?? ""`)·http(본문 그대로), `router.tsx`의 documentRoute search에 `mode`, `styles.css`에 `.cl-p` `.cl-read` `.cl-appeal`.
- 문서: `docs/testing.md` 표 갱신.
- 주요 파일: backend/app/{db,models,agent_read}.py, backend/app/stores/documents.py, backend/migrations/versions/*95daf954dc12*, frontend/src/components/CoverLetterScreen.tsx, frontend/src/router.tsx.

### 커밋
- 2c161c1 자소서 문항에 어필포인트 칸 (내용 없는 빈 마이그레이션만 담김: 실수. 다음 커밋이 지우고 대체)
- ad70597 자소서 문항에 어필포인트 칸: appeal 칸과 마이그레이션, 저장·조회, agent_read 출력
- d73b3ea 자소서 화면을 조회와 편집으로 나누고 편집에 어필포인트 칸 추가

### 테스트
- backend pytest (PostgreSQL 임시 컨테이너): test_cover_letter_store, test_cover_letter_api, test_agent_read, test_migrations 74 통과. `saveme_dev`에서 위로·아래로·위로 마이그레이션 확인.
- frontend: CoverLetterScreen·screens·router·coverLetter·coverLetterService·DocumentGroupScreen 테스트 95 통과, `npm run build` 통과, `npm run lint` 오류 없음(기존 경고만). 전체 테스트는 돌리지 않았다, CI가 돈다.

### 내가 정한 것
- 조회/편집 모드: 컴포넌트에 `mode`(기본 "view")·`onModeChange` props, 라우트가 search `mode=edit`와 `replace: true` 이동으로 연결. 빈 자소서는 컴포넌트가 열 때 한 번 `onModeChange("edit")`를 부르고(그 전 렌더도 편집으로 보임) 이후 [완료]에서 막는다.
- 어필포인트 영역 배경은 `--surface-2` 토큰이 없어서 `var(--bg)`를 썼다 (흰 카드 안에서 구분됨).
- `agent_read`: 자소서 문항 출력은 면접관 시점(`--reader`) 같은 경험 숨김 출력이 없어서(`document`는 일반 조회뿐) 그대로 넣었다. 줄 이름은 "어필포인트(작성 의도 메모):".
- 조회 화면의 문항 글은 굵게(`cl-read-q`), 사이드바 클릭은 스크롤만 하고 포커스 없음.
- 자소서 가져오기 코드는 없다 (importers에 자소서 없음), 확인할 것 없음.
- 테스트 파일은 prettier(폭 120)로 정리해서 일부 줄 바뀜이 섞였다.

### 질문
- 없음.
