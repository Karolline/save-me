# Changelog

All notable changes, newest first. Versions follow [`docs/versioning.md`](docs/versioning.md).

## Unreleased

- 지원현황: timeline of applications (bar color by the furthest stage, result symbols, stats row, legend, filters, tooltips, table view), empty, loading and error states.
- 지원 건: add, edit and delete in a side panel (company and submission day tell applications apart), detail panel with stages, posting and notes (느낀점).
- Layout: sidebar and mobile tab bar with all six menus (the unbuilt ones marked "준비 중"), account menu, settings with logout and logout everywhere, 404 page.
- Login: users, login identities and cookie sessions; the local login ("이 PC에서 바로 시작") until Kakao login.
- Local operations: docker compose with `saveme` and `saveme_dev` databases, Alembic migrations, backup, restore-drill and update scripts.
