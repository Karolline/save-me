# 목업 GitHub Pages

확정 목업(`docs/archive/mockup/saveme-mvp.html`)을 저장소를 열지 않고 볼 수 있게 GitHub Pages로 제공한다 (이슈 #25).

- 주소: https://karolline.github.io/save-me/
- 배포: `.github/workflows/pages.yml`. `main`에 push될 때 목업(`docs/archive/mockup/**`)이나 이 워크플로가 바뀌었으면, 또는 Actions 탭에서 수동 실행하면 배포한다. 목업 파일만 `index.html`로 복사해 올리고 `docs/`의 나머지(기획 문서)는 올리지 않는다.
- 사용자가 한 번 해야 하는 설정: 저장소 Settings → Pages → Source를 "GitHub Actions"로 바꾼다. 하지 않으면 배포가 실패한다.
- 목업을 고치고 main에 병합하면 자동으로 다시 배포된다.
- 목업은 가짜 데이터(예: 김지원, example.com)라 공개해도 된다. 목업에 진짜 개인정보를 넣지 않는다.
