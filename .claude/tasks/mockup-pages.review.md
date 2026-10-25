리뷰한 커밋: 253a35adf7f91909f749f2a4142bbf96c0332572

## 리뷰 결과: 고친 뒤 합치기

### 꼭 고칠 것
- .github/workflows/pages.yml:29,34,38 — Pages 액션 세 개가 한 단계 이상 옛 메이저 버전이다. configure-pages@v5 → v6, upload-pages-artifact@v3 → v5, deploy-pages@v4 → v5 로 같은 세대로 함께 올린다. v5/v4(configure·deploy)는 node20 런타임이라 곧 깨질 수 있다. (_site에는 index.html 하나뿐이라 upload v4부터의 숨김 파일 제외 변경은 영향 없음)

### 고치면 좋은 것
- 없음.

### 확인한 것
- 권한(contents: read, pages: write, id-token: write), paths(docs/archive/mockup/**, 워크플로 파일), main push + workflow_dispatch, concurrency(pages, cancel-in-progress: false), 목업만 _site로 복사해 올림, environment github-pages 모두 지시서대로.
- README 주소 https://karolline.github.io/save-me/ 와 docs/mockup-pages.md(한국어) 적절. 하지 않을 것 위반 없음. 목업의 바깥 참조는 Google Fonts 절대 URL뿐이라 파일 하나만 올려도 깨지지 않는다.
- 테스트는 리뷰어가 돌리지 않았다 (개발자의 YAML 파싱·byte 비교·개인정보 훑기를 믿음).

## 재확인 (진행자)
지적한 액션 버전 3줄(configure-pages v6, upload-pages-artifact v5, deploy-pages v5)이 리뷰어 권고 그대로 반영된 것을 diff로 확인했다. 다른 변경 없음. 꼭 고칠 것 해결됨.
