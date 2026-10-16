# 변경 기록

새 버전이 위에 온다. 버전 규칙은 [`docs/versioning.md`](docs/versioning.md).

## 0.5.0 (2026-10-16)

- 이력 메뉴: 기본 정보(이력서 요약문, 총 경력 자동 계산과 휴직 포함 표시), 경력(휴직 기간), 학력, 자격증(자격번호), 기술 스택(분류마다 메모), 커리어 방향, 인성 답변(주제별로 묶기, 빈 답은 "답변 작성 필요"). 카드마다 그 자리에서 편집한다.
- 이력 가져오기(`app.importers.resume`): 빈 카드만 채우고 이미 적은 카드는 건너뛰며, `--replace`로 바꾸고 `--dry-run`으로 미리 보기. 모르는 키나 칸 이름 오타가 있으면 아무것도 쓰지 않고 멈춘다.

## 0.4.0 (2026-10-16)

- 경험 메뉴: 목록(전체·미확인·보완 필요 보기, 검색, 보완할 것 표시), 상세(상황·과제·행동·결과, 어필 포인트, 프레이밍 주의, 받은 질문의 면접후기 연결, 예상 질문과 답변, 관련 경험), 추가·편집, 삭제, [읽고 확인했어요].
- 공고분석 상세: 근거 경험 태그에 경험의 공고분석 연결 이름이 들어 있으면 ↗로 그 경험에 간다.
- 경험 가져오기(`app.importers.experiences`): 같은 제목은 건너뛰고, `--replace`는 미확인 경험만 바꾸고, `--dry-run`으로 미리 보기. 받은 질문은 회사·차수가 꼭 하나 맞는 면접후기에 잇는다.

## 0.3.0 (2026-10-16)

- 공고분석 메뉴: 분석 목록(지원 여부 필터, 검색), 상세(기술 핏·성향 적합도·지원 조건 요약 카드, 요구사항 해당도, 섹션별 보기), 추가·편집. 지원 건 하나에 분석 하나를 연결하고, 지원 상세에 [분석]/[+ 분석].
- 공고분석의 사람 확인(확인됨/미확인): 가져온 분석은 미확인, 앱에서 저장하거나 [읽고 확인했어요]를 누르면 확인됨.
- 공고분석 가져오기(`app.importers.jobs`): 이미 있는 분석은 건너뛰고, `--replace`는 미확인 분석만 바꾸고, `--dry-run`으로 미리 보기.
- 다른 프로젝트의 공고분석을 받는 받은편지함(`private/inbox/jobs/`, 양식은 `docs/job-inbox.md`)과 `/import-jobs`.
- 병합 전 브랜치 미리 보기(`scripts/preview.ps1`, 8200 포트).

## 0.2.1 (2026-10-16)

- 지원현황: 막대 옆에 자리가 없는 진행 순서 문구는 막대 아래 줄로 내린다 (진행 중 필터처럼 기간이 짧을 때 회사명 칸을 덮던 문제).
- 면접후기: 사람이 확인했는지(확인됨/미확인)를 보기와 목록에 표시하고, 미확인 후기에 [읽고 확인했어요]. 앱에서 저장하면 확인됨.
- 면접후기 편집: 초점이 늦게 옮겨지던 문제를 고쳤다.

## 0.2.0 (2026-10-15)

- 면접후기 메뉴: 회사별로 묶은 후기 목록, 즐겨찾기 질문 모아 보기, 후기 보기(개요, 질문별 별, 마크다운 보기·복사, 삭제), 말풍선 편집(꼬리질문·면접관·내 답·다시 답한다면·메모·AI 첨언, 손잡이로 끌거나 ↑↓로 순서 바꾸기).
- 지원 건 상세에 그 지원의 면접 후기 목록과 [+ 후기 추가]. 지원 건을 지우면 후기도 함께 지워진다.
- 기존 면접 후기 가져오기(`app.importers.reviews`, 파일 전체를 한 번에 쓰거나 아무것도 쓰지 않음).

## 0.1.0 (2026-10-15)

- 지원현황: 지원 건 타임라인(막대 색 = 도달 단계, 결과 기호, 통계 줄, 범례, 필터, 툴팁, 표로 보기), 빈 상태·불러오는 중·오류 화면. 처음 열면 "진행 중" 필터.
- 지원 건: 옆 패널에서 추가·수정·삭제(회사명과 서류 제출일로 구분), 상세 패널(전형 단계, 공고, 느낀점).
- 레이아웃: 사이드바와 모바일 하단 탭, 메뉴 전체(아직 없는 메뉴는 "준비 중"), 계정 메뉴, 계정 설정(로그아웃, 모든 기기에서 로그아웃), 404 화면.
- 로그인: 사용자·로그인 수단·쿠키 세션. 카카오 로그인 전까지는 "이 PC에서 바로 시작".
- 로컬 운영: docker compose(`saveme`·`saveme_dev` DB), Alembic 마이그레이션, 백업(MYBOX 드라이브)·복구 연습·업데이트 스크립트, 기존 지원 기록 가져오기.

---

# Changelog (English)

Newest first. Versions follow [`docs/versioning.md`](docs/versioning.md).

## 0.2.1 (2026-10-16)

- 지원현황: a stage-chain label that fits on neither side of its bar drops below it (it used to cover the company column when the period was short, e.g. under the 진행 중 filter).
- 면접후기: whether a person checked a review (확인됨/미확인) shows in the view and the list, with [읽고 확인했어요] on unchecked ones. Saving in the app marks it checked.
- 면접후기 editor: focus no longer moves a moment late.

## 0.2.0 (2026-10-15)

- 면접후기 menu: reviews grouped by company, starred questions in one place, the review view (summary, per-question stars, markdown view and copy, delete), and the bubble editor (꼬리질문, 면접관, 내 답, 다시 답한다면, 메모, AI 첨언; reorder by dragging the grip or with the arrow keys).
- The application detail panel lists its reviews with [+ 후기 추가]. Deleting an application deletes its reviews.
- Importing existing reviews (`app.importers.reviews`, all or nothing).

## 0.1.0 (2026-10-15)

- 지원현황: timeline of applications (bar color by the furthest stage, result symbols, stats row, legend, filters, tooltips, table view), empty, loading and error states. Opens on the "진행 중" filter.
- 지원 건: add, edit and delete in a side panel (company and submission day tell applications apart), detail panel with stages, posting and notes (느낀점).
- Layout: sidebar and mobile tab bar with every menu (the unbuilt ones marked "준비 중"), account menu, settings with logout and logout everywhere, 404 page.
- Login: users, login identities and cookie sessions; the local login ("이 PC에서 바로 시작") until Kakao login.
- Local operations: docker compose with `saveme` and `saveme_dev` databases, Alembic migrations, backup (to the MYBOX drive), restore-drill and update scripts, importing existing applications.
