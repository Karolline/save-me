리뷰한 커밋: a1302eb30c18ba1d163ec36999a26825eea7c032

## 리뷰 결과: 합쳐도 됨

꼭 고칠 것: 없음.

### 고치면 좋은 것
- frontend/src/components/CoverLetterScreen.tsx:143-147, 203 — 빈 자소서를 열 때 효과가 openedEmpty를 바로 내리고 onModeChange("edit")는 비동기라, 조회 화면("문항을 적지 않았어요", [편집])이 잠깐 깜빡일 수 있다. 데이터 손실은 없다. openedEmpty를 mode가 edit가 된 뒤에 내리거나 [완료]에서만 내린다.
- frontend/src/router.tsx:676-705 — search mode=edit 검증, replace 이동, 새로고침 유지에 대한 라우트 테스트가 없다.
- 커밋 2c161c1은 내용이 빈 마이그레이션(e78aab2e8572)만 담은 실수 커밋이다. ad70597이 95daf954dc12로 바꿔 채우므로 결과는 깨끗하다. 원하면 두 커밋을 합칠 수 있다. saveme_dev가 e78aab2e8572로 찍혀 있지 않은지는 확인하지 못했다 (개발자 보고로는 95daf954dc12일 것).

### 확인한 것
마이그레이션(DB 중립, 모델과 같은 커밋), 어필포인트의 글자 수·합계 제외, isBlank, 조회/편집 전환과 저장 실패 처리, 카드 순서, mock/http/백엔드 모델 일치, agent_read 출력, 남의 데이터 404, 언어·규칙. 직접 돌린 테스트는 없고 개발자 보고를 믿었다.
