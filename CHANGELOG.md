# 변경 기록

새 버전이 위에 온다. 버전 규칙은 [`docs/versioning.md`](docs/versioning.md).

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
