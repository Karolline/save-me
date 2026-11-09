리뷰한 커밋: a1302eb30c18ba1d163ec36999a26825eea7c032

## 리뷰 결과: 합쳐도 됨

꼭 고칠 것: 없음.

### 고치면 좋은 것
- frontend/src/components/CoverLetterScreen.tsx:143-147, 203 — 빈 자소서를 열 때 효과가 openedEmpty를 바로 내리고 onModeChange("edit")는 비동기라, 조회 화면("문항을 적지 않았어요", [편집])이 잠깐 깜빡일 수 있다. 데이터 손실은 없다. openedEmpty를 mode가 edit가 된 뒤에 내리거나 [완료]에서만 내린다.
- frontend/src/router.tsx:676-705 — search mode=edit 검증, replace 이동, 새로고침 유지에 대한 라우트 테스트가 없다.
- 커밋 2c161c1은 내용이 빈 마이그레이션(e78aab2e8572)만 담은 실수 커밋이다. ad70597이 95daf954dc12로 바꿔 채우므로 결과는 깨끗하다. 원하면 두 커밋을 합칠 수 있다. saveme_dev가 e78aab2e8572로 찍혀 있지 않은지는 확인하지 못했다 (개발자 보고로는 95daf954dc12일 것).

### 확인한 것
마이그레이션(DB 중립, 모델과 같은 커밋), 어필포인트의 글자 수·합계 제외, isBlank, 조회/편집 전환과 저장 실패 처리, 카드 순서, mock/http/백엔드 모델 일치, agent_read 출력, 남의 데이터 404, 언어·규칙. 직접 돌린 테스트는 없고 개발자 보고를 믿었다.

---

## 재리뷰 (fd65e72, 고친 부분만)

리뷰한 커밋: fd65e72b294956e1458993daa6c6e74cfb7bc328

결과: 고친 뒤 합치기 (코드는 제대로 고쳐짐, 새 버그 없음)

### 꼭 고칠 것
- docs/testing.md:110, 114 — 테스트 파일 두 개가 바뀌었는데 표를 고치지 않았다. CoverLetterScreen.test.tsx 줄에 "모드 변경이 늦게 와도 빈 자소서가 조회 화면으로 깜빡이지 않음"을, router.test.tsx 줄에 자소서 경로(잘못된 mode면 조회, [편집]이 replace 이동으로 ?mode=edit, 새로 열어도 편집 유지, [완료]로 mode가 빠짐)를 더한다.

### 고치면 좋은 것
- CoverLetterScreen.tsx:147, 174, 208 — 부모가 onModeChange를 안 넘기거나 mode를 안 바꾸면 빈 자소서가 편집에 갇힌다. 지금 앱에서는 일어나지 않는다(쓰는 곳이 router.tsx 하나). finish에서 문항이 비어 있지 않을 때 setOpenedEmpty(false)도 하면 막힌다.
