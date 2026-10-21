import type { DocumentReviewInput, DocumentSource, DocumentType } from "./types";

/**
 * 목업(DOCGROUP_SEED)과 같은 지어낸 지원서류 묶음. 사람과 회사는 모두 지어낸 것이다.
 * `jobCompany`와 같은 회사의 샘플 공고분석이 정확히 하나면 이어진다 (가져오기와 같은 규칙).
 */
export interface DocumentSeed {
  company: string;
  writtenOn: string;
  jobCompany?: string;
  documents: [type: DocumentType, source: DocumentSource, body: string][];
  review?: DocumentReviewInput & { reviewedAt?: string };
}

const RESUME = `# 김지원
jiwon.kim@example.com · 010-0000-0000 · 희망: 데이터 엔지니어 (데이터 플랫폼)

## 요약
주문·정산 데이터를 다루는 5년 차 데이터 엔지니어입니다. 일 3억 건 주문 이벤트 스트림과 정산 배치를 운영했고, 데이터 품질 검사 기준을 직접 정했습니다.

## 경력
### 미담플랫폼 · 데이터플랫폼팀
> 2023.01 – 2025.05 · 정규직
- 주문 이벤트 스트림의 핫 파티션 장애 해결 (프로모션 날 최대 랙 6시간 → **15분**)
- 데이터 품질 검사 도입, 잘못된 마트 0건
### 다올커머스 · 데이터팀
> 2020.03 – 2022.12 · 정규직
- 정산 쿼리 **40분 → 6분**
- 클라우드 이전에서 로그 수집 파트 담당, 유실 0건

## 기술 스택
| 분류 | 기술 |
| --- | --- |
| 언어 | Python, SQL, Scala |
| 처리 | Spark, Kafka, Airflow |
| 클라우드 | AWS (S3, EMR, MSK) |

## 학력 · 자격증
한빛대학교 산업공학과 (부전공 컴퓨터공학) · 정보처리기사 · SQLD`;

const CAREER = `# 경력기술서
김지원 · 한결로보틱스 로봇 데이터 플랫폼 엔지니어 지원

## 요약
일 3억 건 이벤트를 받는 스트림과 정산 배치를 운영하며, 늦거나 틀린 데이터를 먼저 알아채는 파이프라인을 만들어 왔습니다.

## 1. 주문 이벤트 스트림 재설계
> 미담플랫폼 · 2023.04 – 2023.09
- 프로모션 날마다 컨슈머 랙이 쌓여 정산 배치가 늦어지는 문제를 맡음
- 파티션별 랙을 나눠 보고 판매자 ID 하나에 이벤트가 몰리는 것을 찾음
- 키를 (판매자 ID + 주문 ID 해시)로 다시 설계
한결로보틱스에서도 대용량 로그를 안정적으로 수집하겠습니다.

## 2. 데이터 품질 검사 도입
> 미담플랫폼 · 2024.02 – 2024.06
1. 테이블별 행 수와 null 비율을 매일 기록
2. 기준을 지난 4주 평균 ±20%로 정하고, 넘으면 그날 마트 생성을 멈춤
3. 도입 후 잘못된 마트가 사용자에게 나간 건 **0건**
한결로보틱스에서도 데이터 품질 검사와 이상 탐지 체계를 운영하겠습니다.

## 3. 클라우드 이전 · 로그 수집 파트
> 다올커머스 · 2021.07 – 2022.02
### 3-1. 공통 모듈
- 소스 23개의 적재 코드를 설정 파일 + 공통 모듈로 정리
- 자주 바뀌는 부분만 설정으로 뺌
### 3-2. 두 경로 같이 돌리기
- 옛 경로와 새 경로를 2주 동안 같이 돌리며 건수와 최소·최대 시각을 대조
- 차이의 원인은 대부분 시간대(UTC/KST) 처리 차이였음
한결로보틱스에서도 수집 파이프라인을 설계하겠습니다.

---

## 맺음말
감사합니다. 자세한 내용은 [포트폴리오](https://example.com/portfolio)에 정리했습니다.`;

const PORTFOLIO = `# 포트폴리오
김지원 · 데이터 엔지니어

## 소개
데이터가 늦거나 틀리면 먼저 아는 파이프라인을 만드는 데 관심이 있습니다.

## 프로젝트 1 · 핫 파티션 장애 해결
문제: 프로모션 날 정산이 최대 6시간 늦어짐
한 일: 파티션별 랙 분석 → 키 재설계 → 랙 알림 기준 공유
결과: 최대 랙 6시간 → 15분, 이후 6개월 정산 지연 0건
> 그림: 파티션별 랙 그래프 (프로모션 날 한 파티션만 튀는 모습)`;

/** 목업처럼 묶음 셋: 리뷰가 있는 것, 서류가 둘인 것, 리뷰 전인 것. */
export const SAMPLE_DOCUMENTS: DocumentSeed[] = [
  {
    company: "한결로보틱스",
    writtenOn: "2026-10-12",
    jobCompany: "한결로보틱스",
    documents: [
      ["resume", "written", RESUME],
      ["career", "imported_edited", CAREER],
      ["portfolio", "imported", PORTFOLIO],
    ],
    review: {
      reviewer: "서류검토 에이전트",
      reviewedAt: "2026-10-13T09:00:00Z",
      parts: [
        {
          documentType: "resume",
          verdict: "fix",
          intro:
            "5년간 일 3억 건 주문 이벤트 스트림과 정산 배치를 운영했고, 데이터 품질 검사 기준을 직접 정한 DE. 다만 로봇·센서 데이터 경험은 없고, 시계열 저장소 설계는 서류로는 안 보임.",
          fixes: [
            {
              label: "이력서 요약",
              headline: "공고와 이어지는 강점이 첫 줄에 안 보입니다.",
              details: [
                "\"주문·정산 데이터\"로 시작해서, 로봇 로그 수집 자리와 무슨 관계인지 바로 읽히지 않습니다.",
                "\"대용량 로그 수집\"과 \"품질 검사\"를 첫 문장으로 올리는 편이 낫습니다.",
              ],
              jumpType: "resume",
              jumpFind: "## 요약",
            },
            {
              label: "자격요건 5 (시계열 데이터)",
              headline: "실무 근거가 약합니다.",
              details: ["지금은 주문 이벤트 스트림 정도만 보입니다.", "날짜 파티션이나 보존 정책을 직접 정한 경험이 있는지 확인이 필요합니다."],
              jumpType: null,
              jumpFind: "",
            },
          ],
          stuck: ["기술 스택에 수준 표시가 없어서 Kafka와 Spark를 같은 깊이로 다룬 것처럼 읽힙니다."],
          good: ["정산 쿼리를 40분에서 6분으로 줄인 방법"],
        },
        {
          documentType: "career",
          verdict: "fix",
          intro: "",
          fixes: [
            {
              label: "경력기술서 2 (데이터 품질 검사)",
              headline: "결과가 반쪽입니다.",
              details: ["잘못된 마트 0건은 있지만, 검사를 넣은 뒤 오탐이 얼마나 줄었는지가 없습니다."],
              jumpType: "career",
              jumpFind: "## 2.",
            },
            {
              label: "경력기술서 3-2 (클라우드 이전)",
              headline: "앞뒤가 맞지 않게 읽힙니다.",
              details: [
                "건수와 최소·최대 시각으로 대조했다고 쓴 뒤, 차이의 원인이 \"시간대 처리 차이\"라고 합니다.",
                "시간대 차이라면 건수는 같아야 해서 \"건수 차이는 어떻게 났지?\"라는 의심이 생깁니다.",
              ],
              jumpType: "career",
              jumpFind: "### 3-2",
            },
          ],
          stuck: [
            "\"랙\"이 무엇인지 설명이 없고, 알림 기준도 빠져 있습니다.",
            "각 절 끝의 \"한결로보틱스에서도 …하겠습니다\"가 3번 반복됩니다.",
          ],
          good: ["핫 파티션을 랙 그래프에서 어떻게 찾아냈는지", "±20% 기준을 어떻게 정했는지"],
        },
        {
          documentType: "portfolio",
          verdict: "ok",
          intro: "",
          fixes: [],
          stuck: ["그림 설명이 본문 \"한 일\"과 겹칩니다. 그림에는 숫자 축만 남겨도 됩니다."],
          good: ["키를 바꾼 뒤 순서가 필요한 이벤트는 어떻게 했는지"],
        },
      ],
    },
  },
  {
    company: "바른정보",
    writtenOn: "2026-09-05",
    jobCompany: "바른정보",
    documents: [
      ["resume", "written", RESUME.replace("희망: 데이터 엔지니어 (데이터 플랫폼)", "희망: 데이터 파이프라인 엔지니어")],
      [
        "career",
        "written",
        "# 경력기술서\n김지원 · 바른정보 데이터 파이프라인 엔지니어 지원\n\n## 요약\n배치 파이프라인 운영과 개선이 주 업무였습니다.\n\n## 1. Airflow DAG 정리\n- DAG 120개의 이름·재시도·알림 규칙 통일\n- 실패 알림 하루 30건 → 8건",
      ],
    ],
    review: {
      reviewer: "직접 작성",
      reviewedAt: "2026-09-06T09:00:00Z",
      parts: [
        { documentType: "resume", verdict: "ok", intro: "배치 운영을 숫자로 보여 주는 DE.", fixes: [], stuck: [], good: ["실패 알림을 줄인 기준"] },
        {
          documentType: "career",
          verdict: "fix",
          intro: "",
          fixes: [],
          stuck: ["경력기술서가 1쪽이라 이력서와 거의 같습니다. 품질 검사 사례를 하나 더 넣으면 좋습니다."],
          good: [],
        },
      ],
    },
  },
  {
    company: "소담커머스",
    writtenOn: "2026-10-14",
    jobCompany: "소담커머스",
    documents: [["resume", "written", RESUME.replace("희망: 데이터 엔지니어 (데이터 플랫폼)", "희망: 검색 데이터 엔지니어")]],
  },
];
