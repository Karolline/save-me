import type { ExperienceAction, ExperienceFields } from "./types";

/**
 * 목업(EXP_SEED)의 지어낸 경험. 사람과 회사는 모두 지어낸 것이다.
 * 받은 질문의 면접후기는 (회사, 차수)로 SAMPLE_REVIEWS에서 찾고, 관련 경험은 제목으로 찾는다.
 */
export interface ExperienceSeed {
  experience: Partial<ExperienceFields> & { name: string };
  /** 사람 확인 (없으면 확인됨). */
  verified?: boolean;
  /** asked와 같은 순서로, 이을 면접후기 (회사, 차수). 없으면 잇지 않는다. */
  reviews?: ([company: string, round: string] | null)[];
  /** 관련 경험 (제목, 어떻게 이어지나). */
  related?: [name: string, note: string][];
  /** 경험 그룹 이름 (목업의 EXPGROUP_SEED). 같은 이름끼리 한 그룹이 된다. */
  group?: string;
}

const A = (title: string, points: string[], note = "", source = ""): ExperienceAction => ({ title, points, note, source });

export const SAMPLE_EXPERIENCES: ExperienceSeed[] = [
  {
    verified: false,
    experience: {
      name: "클라우드 이전 · 로그 수집 파트",
      linkKey: "클라우드이전-로그수집",
      project: "사내 하둡 → AWS 데이터 플랫폼 전환",
      startedOn: "2021-07",
      endedOn: "2022-02",
      org: "다올커머스 · 데이터팀",
      role: "데이터 엔지니어 (로그 수집 파트 담당)",
      tags: ["클라우드 이전", "AWS", "로그 수집", "Spark", "데이터 정합성", "Airflow"],
      summary:
        "사내 하둡을 AWS로 옮기는 6개월 프로젝트에서 로그 수집 경로를 끊김 없이 옮기고, 소스별 적재 코드를 공통 모듈 하나로 묶어 팀의 이관 공수를 줄였다.",
      situation:
        "사내 하둡 클러스터의 장비 교체 시기가 다가와, 데이터 플랫폼 전체를 AWS로 옮기는 6개월 프로젝트가 시작됐다. 하루 2억 건의 앱 로그가 하둡으로 들어오고 있었고, 이 로그를 쓰는 마트가 40개였다.",
      scope: "프로젝트 전체 중 **로그 수집 경로 이관** 파트. 저장소 설계·비용 관리는 다른 팀원 담당이었다.",
      task: "이관 기간에도 로그가 한 건도 빠지지 않게 새 경로로 옮기고, 소스마다 따로 짜여 있던 적재 코드를 새 환경에 맞게 다시 만드는 것.",
      actionsIntro: "1~2는 이관 설계 단계, 3~4는 이관을 진행하면서 한 일이다 (4는 면접 답변을 정리하며 추가).",
      actions: [
        A(
          "옛 경로와 새 경로를 2주 동안 같이 돌리기",
          ["로그를 하둡과 S3 양쪽에 동시에 적재", "소스별 건수·최소/최대 시각을 매일 표로 비교", "차이 나는 소스를 하나씩 원인 확인 후 맞춤"],
          "차이 대부분은 시간대(UTC/KST) 처리 차이였다.",
        ),
        A(
          "소스별 적재 코드를 공통 모듈로 묶기",
          ["소스 23개마다 따로 있던 적재 코드를 설정 파일 + 공통 모듈 하나로 정리", "재시도해도 같은 결과가 나오도록 파티션 단위 덮어쓰기로 통일"],
          "공통 인터페이스로 깔끔하게 추상화한 건 아니고, 자주 바뀌는 부분만 설정으로 뺐다.",
        ),
        A(
          "Spark 버전 올리며 의존성 충돌 정리",
          ["Spark 2 → 3으로 올리면서 빌드 의존성을 다시 정리해 라이브러리 충돌 해소", "가장 큰 소스는 하루 약 8천만 건"],
          "버전 전후 실행 계획 비교는 하지 않았다.",
        ),
        A(
          "이관 순서와 정합성 관리",
          ["작업 간 의존 관계는 표로 정리해 사람이 확인", "이관 전/후 통계(건수, 최소/최대 값)를 메타 테이블에 기록해 대조", "본인 1차 확인 + 동료 2차 확인"],
          "",
          "파랑모빌리티 1차 면접 답변을 정리하며 추가",
        ),
      ],
      resultMine: ["이관 기간 동안 로그 유실 0건", "적재 코드를 공통 모듈로 묶어 팀원들의 소스 추가 작업이 쉬워짐"],
      resultTeam: ["하둡 → AWS 전체 이관을 일정 안에 끝냄", "클라우드 비용 관리 체계 마련"],
      numbers: "",
      appealMainUse: "가장 자랑스러운 프로젝트",
      appealQuestions: ["대규모 플랫폼 이관 경험", "데이터 정합성을 어떻게 확인했나", "여러 사람이 쓰는 공통 모듈을 만든 경험"],
      appealStrength: "내 작업이 팀 전체 작업 방식으로 넓어진 사례라 \"영향 범위\"를 묻는 질문에 강하다.",
      framing: [
        "인프라 전체 설계와 비용 절감은 팀 성과다. 본인 담당은 로그 수집 파트로 한정해서 말한다.",
        "\"실행 계획으로 효과를 확인했다\"고 말하지 않는다. 비교하지 않았다.",
        "\"의존 관계를 자동으로 추출했다\"고 말하지 않는다. 표로 정리해 사람이 확인했다.",
      ],
      asked: [
        { question: "배치와 스트리밍 중 무엇을 고를지 어떻게 정하나요?", where: "파랑모빌리티 1차 면접", interviewReviewId: null },
        { question: "클라우드로 옮기면서 가장 신경 쓴 점은?", where: "아라미디어 1차 면접", interviewReviewId: null },
        { question: "정합성은 어떻게 확인했나요?", where: "누리커머스 1차 면접", interviewReviewId: null },
      ],
      qas: [
        { question: "공통 모듈을 팀원들이 실제로 잘 썼나요?", answer: "", caution: "" },
        {
          question: "파티션 덮어쓰기가 왜 재시도에 안전한가요?",
          answer: "같은 날짜 파티션을 통째로 다시 쓰기 때문에, 몇 번 다시 돌려도 결과가 같다는 흐름으로 답한다.",
          caution: "이 방식은 팀에 이미 있던 관행을 따른 것이다. 내가 고안했다고 말하지 않는다.",
        },
      ],
      missing: ["공통 모듈로 줄어든 팀 공수 (수치)", "공통 모듈을 몇 명이 썼는지", "비용 절감액 중 이관 덕분인 부분"],
    },
    reviews: [["파랑모빌리티", "1차 면접"], null, null],
    related: [
      ["정산 배치 튜닝", "이관 뒤 정산 배치를 새 환경에서 튜닝한 일로 이어짐"],
      ["클라우드 비용 대시보드", "이관 뒤 비용을 보는 대시보드"],
    ],
  },
  {
    experience: {
      name: "주문 이벤트 스트림 재설계",
      linkKey: "주문이벤트-스트림재설계",
      project: "정산 지연 해소",
      startedOn: "2023-04",
      endedOn: "2023-09",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "데이터 엔지니어 (설계·구현 주도)",
      tags: ["스트리밍", "Kafka", "장애 대응"],
      summary: "특정 키에 이벤트가 몰리는 핫 파티션 때문에 밀리던 주문 이벤트 스트림을 키 설계부터 다시 짰다.",
      situation: "일 3억 건 주문 이벤트가 Kafka로 들어오는데, 프로모션 날마다 컨슈머 랙이 쌓여 정산 배치가 최대 6시간 늦어졌다.",
      scope: "원인 분석과 키 재설계 전체.",
      task: "랙의 원인을 찾고, 프로모션 날에도 정산 배치가 제시간에 시작되게 만드는 것.",
      actions: [
        A("파티션별 랙으로 원인 좁히기", ["파티션별 랙을 나눠 보고 판매자 ID 하나에 이벤트가 몰리는 것을 확인"]),
        A("키 다시 설계", ["키를 (판매자 ID + 주문 ID 해시)로 변경", "순서가 필요한 결제 상태 이벤트만 주문 ID 키로 분리"]),
        A("랙 알림 기준 공유", ["랙 알림 기준을 정해 운영팀과 공유"]),
      ],
      resultMine: ["프로모션 날 최대 랙 6시간 → 15분", "이후 6개월 동안 정산 지연 0건"],
      numbers: "최대 랙 6시간 → 15분, 정산 지연 0건 (6개월)",
      appealMainUse: "장애 대응",
      appealQuestions: ["가장 어려웠던 장애 대응", "Kafka 운영 경험"],
      appealStrength: "원인을 데이터로 좁혀 간 과정이 분명하다.",
      asked: [{ question: "스트리밍 파이프라인에서 중복 처리를 어떻게 막나요?", where: "라온소프트 1차 면접", interviewReviewId: null }],
      qas: [{ question: "키를 바꾸면 순서가 깨지지 않나요?", answer: "순서가 필요한 결제 상태 이벤트만 주문 ID 키로 따로 보냈다고 답한다.", caution: "" }],
    },
    reviews: [["라온소프트", "1차 면접"]],
    related: [["수집 지연 알림 도입", "랙 알림을 수집 지연 알림으로 넓힘"]],
  },
  {
    group: "데이터 품질·모니터링",
    verified: false,
    experience: {
      name: "수집 지연 알림 도입",
      linkKey: "수집지연-알림도입",
      startedOn: "2024-02",
      endedOn: "2024-03",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "데이터 엔지니어",
      tags: ["모니터링", "운영"],
      summary: "수집이 늦어지면 데이터를 쓰는 팀이 먼저 알도록 알림을 붙였다.",
      situation: "수집이 늦어져도 다음 날 아침 대시보드가 비어 있어야 알 수 있었다.",
      task: "늦어지는 순간 우리 팀과 사용하는 팀이 함께 알게 하는 것.",
      actions: [
        A("마지막 적재 시각 기록", ["소스별 마지막 적재 시각을 기록하는 표 생성"]),
        A("기준 시간 넘으면 알림", ["메신저 채널로 알림, 사용 팀 2곳까지 받도록 넓힘"]),
      ],
      resultMine: ["사용 팀이 대시보드를 열기 전에 지연을 알게 됨"],
      missing: ["알림 도입 전후로 지연을 알아챈 시간"],
    },
  },
  {
    group: "정산·결제 데이터",
    experience: {
      name: "정산 배치 튜닝",
      linkKey: "정산배치-튜닝",
      startedOn: "2022-09",
      endedOn: "2022-11",
      org: "다올커머스 · 데이터팀",
      role: "데이터 엔지니어",
      tags: ["배치", "SQL 튜닝", "파티셔닝"],
      summary: "40분 걸리던 일 정산 쿼리를 6분으로 줄였다.",
      situation: "정산 마트를 만드는 쿼리가 40분 걸려 재무팀 마감 보고가 자주 늦었다.",
      task: "마감 시간 안에 정산 마트가 준비되게 하는 것.",
      actions: [
        A("실행 계획으로 원인 찾기", ["풀 스캔이 나는 조인 두 곳을 찾음"]),
        A("날짜 파티션으로 변경", ["주문 테이블을 날짜 파티션으로 바꾸고 조인 키에 맞춰 정렬", "오래된 파티션은 보존 기간에 맞춰 정리"]),
      ],
      resultMine: ["40분 → 6분", "마감 보고 지연 월 4회 → 0회"],
      numbers: "40분 → 6분, 지연 월 4회 → 0회",
      appealMainUse: "SQL 튜닝",
      appealQuestions: ["SQL 튜닝 경험"],
    },
    related: [["클라우드 이전 · 로그 수집 파트", "이관 직후 새 환경에서 한 튜닝"]],
  },
  {
    group: "데이터 품질·모니터링",
    experience: {
      name: "데이터 품질 검사 도입",
      linkKey: "데이터품질-검사도입",
      startedOn: "2024-02",
      endedOn: "2024-06",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "데이터 엔지니어 (기준 설계)",
      tags: ["데이터 품질", "Airflow"],
      summary: "행 수·null 비율 검사를 파이프라인 안에 넣고 기준을 정했다.",
      situation: "원천 테이블이 비거나 반쯤 들어와도 아무도 모른 채 마트가 만들어졌다.",
      task: "잘못 들어온 날을 자동으로 잡아내되, 오탐으로 사람을 지치게 하지 않는 것.",
      actions: [
        A("매일 통계 기록", ["테이블별 행 수와 null 비율을 매일 기록"]),
        A("기준 정하기", ["지난 3개월 변동 폭을 보고 4주 평균 ±20%로 정함"]),
        A("넘으면 멈추고 알림", ["기준을 넘으면 그날 마트 생성을 멈추고 알림"]),
      ],
      resultMine: ["도입 후 잘못된 마트가 사용자에게 나간 건 0건"],
      numbers: "잘못된 마트 0건",
      qas: [{ question: "기준을 왜 ±20%로 정했나요?", answer: "지난 3개월 실제 변동 폭을 보고 정했다고 답한다.", caution: "" }],
      missing: ["오탐을 줄인 수치"],
    },
  },
  {
    experience: {
      name: "Airflow DAG 정리",
      linkKey: "Airflow-DAG정리",
      startedOn: "2023-11",
      endedOn: "2024-01",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "데이터 엔지니어",
      tags: ["Airflow", "운영"],
      summary: "흩어진 DAG 120개의 이름·재시도·알림 규칙을 하나로 맞췄다.",
      resultMine: ["실패 알림 하루 30건 → 8건"],
      numbers: "실패 알림 30건 → 8건",
      missing: ["상황·과제·행동"],
    },
  },
  {
    verified: false,
    experience: {
      name: "Iceberg 테이블 포맷 실험 (개인)",
      linkKey: "Iceberg",
      startedOn: "2025-03",
      endedOn: "2025-04",
      org: "개인 프로젝트",
      role: "혼자",
      tags: ["테이블 포맷", "개인 프로젝트"],
      summary: "공개 데이터로 Iceberg 테이블을 만들고 시간 여행 조회까지 해 봤다.",
      missing: ["무엇을 확인하려고 했는지", "결과"],
    },
  },
  {
    group: "정산·결제 데이터",
    experience: {
      name: "결제 로그 마트 구축",
      linkKey: "결제로그-마트구축",
      startedOn: "2022-03",
      endedOn: "2022-06",
      org: "다올커머스 · 데이터팀",
      role: "데이터 엔지니어",
      tags: ["배치", "마트"],
      summary: "결제 실패 분석용 마트를 처음부터 만들었다.",
      resultMine: ["분석가 요청 처리 시간 3일 → 반나절"],
      numbers: "3일 → 반나절",
    },
  },
  {
    experience: {
      name: "클라우드 비용 대시보드",
      linkKey: "비용대시보드",
      startedOn: "2024-07",
      endedOn: null,
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "데이터 엔지니어",
      tags: ["클라우드 비용", "대시보드"],
      summary: "팀별 클라우드 비용을 매일 보는 대시보드를 만들었다.",
      resultTeam: ["월 비용 30% 절감 (팀 전체)"],
      framing: ["30% 절감은 팀 전체 수치다. 대시보드가 기여한 부분만 말한다."],
      missing: ["대시보드가 기여한 절감 부분"],
    },
  },
  {
    verified: false,
    experience: {
      name: "장애 회고 문서 도입",
      linkKey: "장애회고-문화도입",
      startedOn: "2023-01",
      endedOn: "2023-03",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "제안·작성",
      tags: ["협업", "운영"],
      summary: "장애가 나면 회고 문서를 남기는 틀을 제안했다.",
      qas: [{ question: "회고 문화를 어떻게 정착시켰나요?", answer: "", caution: "" }],
    },
  },
  {
    experience: {
      name: "신규 입사자 온보딩 문서",
      linkKey: "온보딩문서화",
      startedOn: "2024-11",
      endedOn: "2024-12",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "작성",
      tags: ["협업", "문서화"],
      summary: "파이프라인 구조와 운영 절차를 신규 입사자용으로 정리했다.",
      resultMine: ["온보딩 기간 4주 → 2주"],
      numbers: "4주 → 2주",
    },
  },
  {
    experience: {
      name: "첫 ETL 이관",
      linkKey: "ETL이관",
      startedOn: "2019-09",
      endedOn: "2019-12",
      org: "다올커머스 · 데이터팀",
      role: "신입 데이터 엔지니어",
      tags: ["배치", "SQL"],
      summary: "스크립트로 돌던 ETL 작업 20개를 Airflow로 옮겼다.",
    },
  },
  // 아래 셋은 경험 캘린더의 흐름 점검을 보이려는 것 (끝이 비었는데 퇴사, 시작 없음, 이력에 없는 소속).
  {
    experience: {
      name: "정산 대사 자동화",
      startedOn: "2022-08",
      endedOn: null,
      org: "다올커머스 · 데이터팀",
      role: "데이터 엔지니어",
      tags: ["배치", "정산"],
      summary: "재무팀이 손으로 하던 정산 대사를 매일 도는 배치로 바꿨다.",
    },
  },
  {
    experience: {
      name: "사내 데이터 스터디 운영",
      org: "미담플랫폼 · 데이터플랫폼팀",
      role: "스터디 운영",
      tags: ["협업", "스터디"],
      summary: "격주로 데이터 엔지니어링 책을 함께 읽는 사내 스터디를 꾸렸다.",
    },
  },
  {
    experience: {
      name: "오픈소스 문서 번역",
      startedOn: "2025-10",
      endedOn: "2025-12",
      org: "Airflow 한국 사용자 모임 · 번역팀",
      role: "번역 기여",
      tags: ["오픈소스", "Airflow"],
      summary: "Airflow 공식 문서의 운영 가이드 일부를 한국어로 옮겼다.",
    },
  },
];
