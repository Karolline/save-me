## 결과: 완료
브랜치: task/mockup-pages   worktree: C:\dev\save-me\.claude\worktrees\mockup-pages

### 바꾼 것
- 목업을 GitHub Pages로 배포하는 워크플로 `.github/workflows/pages.yml` (main push 시 `docs/archive/mockup/**`나 이 파일이 바뀌면, 수동 실행도 가능). 목업만 `_site/index.html`로 복사해 올림.
- `docs/mockup-pages.md`: 배포 방식, 사용자 설정(Settings → Pages → Source = GitHub Actions), 자동 재배포 안내.
- `README.md` 목업 줄에 배포 주소 https://karolline.github.io/save-me/ 와 안내 문서 링크 추가 (remote가 Karolline/save-me).

### 커밋
- (아래 git log 참고)

### 테스트
- 워크플로 YAML을 pyyaml로 파싱: 문법 오류 없음, 권한 pages/id-token write, contents read.
- `_site/index.html`을 만들어 목업과 byte 단위로 같음을 확인(cmp), 임시 폴더는 지움.
- 개인정보 훑기: 이메일 `jiwon.kim@example.com`, 전화 `010-0000-0000`, 이름 `김지원`만 나옴, 모두 가짜 자리표시 값이라 문제 없음.
- 앱 코드가 바뀌지 않아 앱 테스트는 돌리지 않음. 전체 테스트는 돌리지 않았다, CI가 돈다.

### 내가 정한 것
- 액션 버전: configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4, checkout은 기존 파일대로 v7. (CI의 checkout만 최신 표기를 따랐고, Pages 액션 버전은 내가 아는 안정판이라 push 후 CI에서 해석되는지 확인 필요.)
- concurrency 그룹 이름은 `pages`, `environment: github-pages`와 page_url 출력 사용.
