import type { JobFields, Requirement, RequirementCategory, RequirementLevel } from "./types";

/**
 * 목업(JOB_SEED)의 지어낸 공고분석. 회사와 경험은 모두 지어낸 것이다.
 * 지원 건은 (회사, 서류 제출일)로 찾아 잇는다 (SAMPLE_APPLICATIONS에 있는 것만).
 */
export interface JobSeed {
  analyzedAt: string;
  /** 연결할 지원 건 (회사, 서류 제출일). */
  application: [company: string, appliedAt: string] | null;
  job: Partial<JobFields> & { company: string };
}

const R = (
  category: RequirementCategory,
  level: RequirementLevel,
  text: string,
  description = "",
  evidence: string[] = [],
  noEvidence = "",
  caution = "",
): Requirement => ({ category, level, text, description, evidence, noEvidence, caution });

const url = (n: number) => `https://careers.example.com/postings/${700 + n}`;

export const SAMPLE_JOBS: JobSeed[] = [
  {
    analyzedAt: "2026-10-11",
    application: null,
    job: {
      company: "한결로보틱스",
      team: "로봇플랫폼실 · 데이터플랫폼팀",
      title: "로봇 데이터 플랫폼 엔지니어",
      url: url(7),
      deadline: "2026-10-25",
      status: "undecided",
      fit: "중",
      conclusion:
        "로그 수집·배치 운영·품질 검사로 자격요건은 대부분 채우지만, 공고의 중심인 시계열 저장소와 로봇 도메인(ROS) 경험이 비어 있어 이 둘을 어떻게 말할지가 관건인 공고.",
      conditions: [
        { label: "경력 4년 이상", state: "ok", text: "총 경력 5년 2개월" },
        { label: "입사 가능 시기", state: "check", text: "2026.12 이전 입사 희망이라고 적혀 있음. 협의 필요" },
        { label: "근무지", state: "ok", text: "판교 · 주 2회 재택" },
      ],
      requirements: [
        R("duty", "full", "로봇에서 올라오는 주행·센서 로그를 수집하는 파이프라인 설계·운영", "일 3억 건 주문 이벤트 수집 파이프라인 운영, 수집 지연 알림 체계 도입.", ["2023-04 주문이벤트-스트림재설계", "2024-02 수집지연-알림도입"]),
        R("duty", "part", "대용량 시계열 데이터 저장소 설계와 보존 정책 관리", "날짜 파티션 설계와 보존 기간 정리는 해 봤다. 시계열 전용 DB는 공부한 수준.", ["2022-09 정산배치-튜닝"], "시계열 DB(InfluxDB·TimescaleDB) 실무: 경험에 근거 없음"),
        R("duty", "part", "로봇 개발·운영 조직이 쓰는 분석용 데이터 마트 제공", "주문·정산 마트를 운영하며 재무팀 요청을 받아 왔다.", ["2022-09 정산배치-튜닝"], "", "마트 사용자가 현업이었지 엔지니어 조직은 아니었다"),
        R("duty", "none", "ROS bag 파일 변환·적재 자동화", "", [], "ROS, bag 파일: 경험에 근거 없음"),
        R("duty", "full", "데이터 품질 검사와 이상 탐지 체계 운영", "행 수·null 비율 검사를 파이프라인에 넣고, 기준을 지난 4주 평균 ±20%로 정했다.", ["2024-02 데이터품질-검사도입"], "", "오탐을 줄인 수치는 기록이 없어 쓰지 않는다"),
        R("must", "full", "데이터 엔지니어링 경력 4년 이상", "5년 2개월, 회사 2곳.", ["이력 · 경력"]),
        R("must", "full", "Python, SQL 능숙", "정산 쿼리 40분 → 6분 튜닝, Python 수집기 운영.", ["2022-09 정산배치-튜닝"]),
        R("must", "full", "Airflow 등 워크플로 도구 운영 경험", "DAG 120개 운영, 실패 알림 정리.", ["2023-11 Airflow-DAG정리"]),
        R("must", "part", "클라우드(AWS) 환경에서 데이터 인프라 구성", "클라우드 이전 프로젝트에서 로그 수집 파트를 맡았다.", ["2021-07 클라우드이전-로그수집"], "", "인프라 전체 설계는 팀 성과, 본인은 로그 수집 파트"),
        R("must", "part", "대용량 시계열 데이터 처리 경험", "주문 이벤트도 시간순 데이터지만 센서 측정값과는 결이 다르다.", ["2023-04 주문이벤트-스트림재설계"], "센서·측정값 시계열: 경험에 근거 없음"),
        R("pref", "none", "ROS 사용 경험", "", [], "경험에 근거 없음"),
        R("pref", "part", "Iceberg·Delta 등 테이블 포맷 운영", "개인 프로젝트에서 Iceberg 시간 여행 조회까지 해 봤다.", ["2025-03 Iceberg (개인)"], "", "실무 도입이라고 말하지 않는다"),
        R("pref", "full", "Kafka 운영 경험", "주문 이벤트 스트림 2년 운영, 핫 파티션 장애 해결.", ["2023-04 주문이벤트-스트림재설계"]),
        R("pref", "none", "C++ 코드를 읽을 수 있는 수준", "", [], "경험에 근거 없음"),
      ],
      fitNotes: [
        "판정 근거: 자격요건 5개 중 3개 충족, 2개 부분, 없음 0. 수집·배치·품질 검사는 지금 하는 일과 같다.",
        "비는 곳: 시계열 저장소 설계, 로봇 도메인(ROS, bag 파일), C++. 포지션 이름이 '로봇 데이터'라 면접에서 도메인 질문이 많을 것이다.",
        "가장 위험한 항목: 시계열 저장소. 주요업무 2번이자 자격요건 5번이라 두 번 걸린다.",
      ],
      cultureGrade: "Yellow",
      cultureScore: 72,
      cultureType: "플랫폼 구축형 (추정)",
      cultureItems: [
        { name: "비즈니스 성과 연계", max: 30, score: 18, quote: "\"로봇 운영 효율을 데이터로 높입니다\" — 성과를 재는 지표 언급은 없음" },
        { name: "현업 소통·데이터 편의성", max: 25, score: 20, quote: "\"로봇 개발·운영 조직이 쓰는 분석용 데이터 마트 제공\"" },
        { name: "도메인 데이터(DW/DM) 운영", max: 25, score: 16, quote: "마트 제공은 주요업무 5개 중 1개" },
        { name: "Red Flag 부재", max: 20, score: 18, quote: "\"ROS bag 파일 변환\" — 장비 쪽 작업이 일부 있음 (-2)" },
      ],
      culturePoints: "\"수집 파이프라인 설계·운영\", \"품질 검사와 이상 탐지\" — 지금 하는 일과 같은 말이다.",
      cultureRisks: ["저수준 장비 연동 비중: 일부 있음 (ROS bag 변환)", "플랫폼 R&D형 징후: 약함. 새 저장소 도입 검토가 업무에 들어 있음"],
      cultureReadBetween: "플랫폼 구축형 (추정). 주요업무 5개 중 3개가 수집·저장소·변환이고 마트 제공은 1개. 데이터 사용자는 로봇 개발 조직이다.",
      highlight: [
        { exp: "주문이벤트-스트림재설계", maps: "주요업무 1 · 자격 5 · 우대 3", why: "수집 규모(일 3억 건)와 핫 파티션 해결 사례. 센서 데이터를 다뤘다고 말하지 않는다" },
        { exp: "데이터품질-검사도입", maps: "주요업무 5", why: "기준을 정한 과정(4주 평균 ±20%)이 구체적이다" },
        { exp: "정산배치-튜닝", maps: "자격 2 · 주요업무 2", why: "40분 → 6분 수치. 파티션 설계를 시계열 저장소 질문의 연결 고리로 쓴다" },
        { exp: "클라우드이전-로그수집", maps: "자격 4", why: "담당 범위를 로그 수집 파트로 한정해서 말한다" },
      ],
      excluded: [
        { exp: "Airflow-DAG정리", where: "자격 3은 다른 경험으로도 충족. 경력 요약 한 줄로만" },
        { exp: "Iceberg (개인)", where: "면접에서 테이블 포맷 질문이 나올 때만" },
      ],
      questions: [
        { question: "시계열 데이터를 어떻게 저장하겠나?", answer: "실무 근거 없음. 정산 배치의 날짜 파티션·보존 정책 경험까지만 말하고, 시계열 DB는 공부한 범위를 사실대로" },
        { question: "ROS를 써 봤나?", answer: "없다고 말한다. bag 파일 구조는 지원 전에 개념만 정리해 둔다" },
        { question: "로봇 수천 대의 로그가 한꺼번에 몰리면?", answer: "핫 파티션 장애 사례로 연결한다. 키 설계와 랙 알림 기준" },
      ],
      toWrite: ["데이터품질-검사도입의 오탐을 줄인 수치 — 주요업무 5번 근거가 강해진다"],
      gaps: ["시계열 DB 실무 (InfluxDB, TimescaleDB)", "ROS, bag 파일", "C++", "로봇·IoT 도메인 데이터"],
      expSuggestions: ["클라우드이전-로그수집에서 본인이 맡은 저장소 설계 범위 — 시계열 저장소 질문에 쓸 수 있는지 확인"],
      askBack: ["로봇 한 대가 하루에 만드는 로그 양과, 지금 가장 큰 병목은 어디인가요?", "데이터 마트의 주 사용자는 로봇 개발 조직인가요, 운영 조직인가요?"],
      checks: ["입사 가능 시기 2026.12 협의 가능 여부", "지원 이력 없음 → 첫 지원", "코딩테스트 유무: 공고에 없음"],
      notes: "[전형] 서류 > 직무 인터뷰 > 임원 인터뷰 > 처우협의\n코딩테스트는 공고에 없다.",
      // 회사 동향 (지어낸 기사와 링크).
      trendsCheckedOn: "2026-10-12",
      trendsNote: "비상장사라 사업보고서가 없어 기사와 회사 기술 블로그로 대신했다. 해석에는 (추정)을 붙였다.",
      trends: [
        {
          kind: "spend",
          label: "실적",
          text: "2025년 매출 약 820억 원(전년 대비 **+38%**), 영업손실 약 60억 원. 물류 로봇 판매 대수가 두 배로 늘었다",
          sources: [
            { name: "한빛경제", date: "2026-03-30", url: "https://news.example.com/hangyeol-2025" },
            { name: "로봇신문", date: "2026-04-02", url: "https://news.example.com/robot-sales" },
          ],
        },
        { kind: "spend", label: "사업부별 손익", text: "자료 없음", sources: [] },
        {
          kind: "spend",
          label: "물류",
          text: "평택에 로봇 관제 센터를 새로 열고 고객사 물류센터 원격 운영을 늘림",
          sources: [{ name: "한빛경제", date: "2026-06-11", url: "https://news.example.com/pyeongtaek" }],
        },
        {
          kind: "spend",
          label: "물류",
          text: "관제의 출발은 시흥의 시범 물류센터 한 곳",
          sources: [{ name: "테크데일리", date: "2023-05-18", url: "https://news.example.com/siheung" }],
        },
        {
          kind: "rival",
          label: "바다로봇",
          text: "같은 물류 로봇 시장에서 가격으로 경쟁. 데이터 관제는 아직 외주",
          sources: [{ name: "로봇신문", date: "2026-08-20", url: "https://news.example.com/rival" }],
        },
        {
          kind: "users",
          label: "고객사 후기",
          text: "\"장애가 나도 원인을 빨리 알려 준다\"는 평이 많다. 리포트가 늦다는 불만도 있다",
          sources: [{ name: "고객 사례집", date: null, url: "https://hangyeol.example.com/cases" }],
        },
      ],
      directionQuotes: ["\"로봇 수천 대가 만드는 주행·센서 로그를 모아\"", "\"데이터 품질 검사와 이상 탐지 체계 운영\""],
      directionReading:
        "관제 센터가 늘면서 로그 양이 커졌고, 적자 상태라 장애 원인을 빨리 찾아 운영비를 줄이려는 것으로 보인다.",
      appeals: [
        {
          situation: "관제 센터가 늘어 로그 수집 규모가 커지는 중",
          contribution: "일 3억 건 주문 이벤트 수집 파이프라인을 운영하고 **핫 파티션 장애**를 해결했다",
          evidence: ["2023-04 주문이벤트-스트림재설계"],
        },
        {
          situation: "고객사가 장애 원인을 빨리 알고 싶어 함",
          contribution: "품질 검사 기준(지난 4주 평균 ±20%)을 정하고 알림을 붙였다",
          // 둘째 태그는 아직 경험으로 적지 않아서 링크가 아니다.
          evidence: ["2024-02 데이터품질-검사도입", "고객 리포트 자동화"],
        },
      ],
      appealGaps: ["로봇 센서 시계열 저장 → 실무 근거 없음"],
      rawText:
        "포지션 소개\n한결로보틱스 데이터플랫폼팀은 물류 로봇 수천 대가 만드는 주행·센서 로그를 모아 로봇 개발과 운영에 필요한 데이터를 제공합니다.\n\n주요업무\n- 로봇에서 올라오는 주행·센서 로그를 수집하는 파이프라인 설계·운영\n- 대용량 시계열 데이터 저장소 설계와 보존 정책 관리\n- 로봇 개발·운영 조직이 쓰는 분석용 데이터 마트 제공\n- ROS bag 파일 변환·적재 자동화\n- 데이터 품질 검사와 이상 탐지 체계 운영\n\n자격요건\n- 데이터 엔지니어링 경력 4년 이상\n- Python, SQL 능숙\n- Airflow 등 워크플로 도구 운영 경험\n- 클라우드(AWS) 환경에서 데이터 인프라 구성\n- 대용량 시계열 데이터 처리 경험\n\n우대사항\n- ROS 사용 경험\n- Iceberg·Delta 등 테이블 포맷 운영\n- Kafka 운영 경험\n- C++ 코드를 읽을 수 있는 수준\n\n진행 절차\n서류 > 직무 인터뷰 > 임원 인터뷰 > 처우협의",
    },
  },
  {
    analyzedAt: "2026-09-03",
    application: ["바른정보", "2026-09-07"],
    job: {
      company: "바른정보",
      team: "데이터실",
      title: "데이터 파이프라인 엔지니어",
      url: url(1),
      deadline: "2026-09-14",
      status: "applied",
      fit: "상",
      conclusion: "요구 역량이 지금 하는 일과 거의 같아서, 품질 검사 기준을 정한 과정만 구체적으로 준비하면 되는 공고.",
      conditions: [{ label: "경력 3년 이상", state: "ok", text: "5년 2개월" }],
      requirements: [
        R("duty", "full", "사내 데이터 웨어하우스로 들어오는 배치 파이프라인 운영과 개선", "DAG 120개 운영.", ["2023-11 Airflow-DAG정리"]),
        R("must", "full", "SQL 튜닝 경험", "정산 쿼리 40분 → 6분.", ["2022-09 정산배치-튜닝"]),
        R("must", "part", "데이터 품질 검사 설계", "행 수·null 비율 검사만 해 봤다.", ["2024-02 데이터품질-검사도입"]),
        R("pref", "part", "Iceberg 등 테이블 포맷 경험", "개인 프로젝트 수준.", ["2025-03 Iceberg (개인)"]),
      ],
      cultureGrade: "Green",
      cultureScore: 88,
      cultureType: "운영 안정화형 (추정)",
      questions: [{ question: "우리 팀 배치를 처음 맡으면 무엇부터 보겠나?", answer: "실패 이력과 의존 관계부터. 첫 2주 결과물까지 말한다" }],
    },
  },
  {
    analyzedAt: "2026-09-29",
    application: ["초록식품", "2026-10-02"],
    job: {
      company: "초록식품",
      team: "신설 데이터팀",
      title: "데이터 엔지니어 (신설 팀)",
      url: url(2),
      deadline: "2026-10-05",
      status: "applied",
      fit: "중",
      conclusion: "처음부터 만드는 경험이 약하다. 클라우드 이전 때 설계에 참여한 부분을 크게 보여줘야 하는 공고.",
      requirements: [
        R("duty", "part", "공장·유통 데이터 수집 파이프라인 구축", "기존 파이프라인 확장 위주였다.", ["2021-07 클라우드이전-로그수집"]),
        R("must", "part", "클라우드 인프라 구성", "AWS 이전 프로젝트 참여.", ["2021-07 클라우드이전-로그수집"]),
        R("pref", "none", "IoT 센서 데이터", "", [], "경험에 근거 없음"),
      ],
      cultureGrade: "Yellow",
      cultureScore: 70,
      cultureType: "1인 구축형 (추정)",
    },
  },
  {
    analyzedAt: "2026-07-10",
    application: ["라온소프트", "2026-07-13"],
    job: {
      company: "라온소프트",
      title: "데이터 엔지니어 (스트리밍)",
      url: url(3),
      deadline: "2026-07-20",
      status: "applied",
      fit: "상",
      conclusion: "핫 파티션 장애 사례가 공고 핵심과 딱 맞는다.",
      requirements: [
        R("must", "full", "Kafka 운영", "주문 이벤트 스트림 2년.", ["2023-04 주문이벤트-스트림재설계"]),
        R("must", "part", "스트림 처리 프레임워크", "Flink는 사이드 프로젝트."),
      ],
    },
  },
  {
    analyzedAt: "2026-07-24",
    application: null,
    job: {
      company: "아라미디어",
      title: "콘텐츠 데이터 엔지니어",
      url: url(4),
      deadline: "2026-07-31",
      status: "applied",
      fit: "중",
      conclusion: "왜 미디어인지 답이 약하다. 공고에 나온 데이터 종류를 내 경험과 이어 둘 것.",
      requirements: [
        R("must", "part", "대용량 로그 처리", "일 3억 건."),
        R("pref", "none", "추천 시스템 이해", "", [], "경험에 근거 없음"),
      ],
    },
  },
  {
    analyzedAt: "2026-02-27",
    application: null,
    job: {
      company: "누리커머스",
      title: "커머스 데이터 엔지니어",
      url: url(5),
      deadline: "2026-03-05",
      status: "applied",
      fit: "중",
      requirements: [R("must", "full", "SQL"), R("must", "part", "데이터 품질 관리")],
    },
  },
  {
    analyzedAt: "2026-01-28",
    application: ["파랑모빌리티", "2026-02-02"],
    job: {
      company: "파랑모빌리티",
      title: "모빌리티 데이터 플랫폼 엔지니어",
      url: url(6),
      deadline: "2026-02-02",
      status: "applied",
      fit: "상",
      conclusion: "배치와 스트리밍을 둘 다 운영해 본 경험이 그대로 맞는다.",
      requirements: [R("must", "full", "배치·스트리밍 병행 설계")],
    },
  },
  {
    analyzedAt: "2026-10-08",
    application: null,
    job: {
      company: "마루증권",
      team: "리스크관리본부",
      title: "데이터 엔지니어 (리스크)",
      url: url(8),
      deadline: "2026-10-20",
      status: "undecided",
      fit: "하",
      conclusion: "근거 없는 요구 역량이 두 개. 지원한다면 배치 운영 하나로 승부해야 하는 공고.",
      requirements: [
        R("must", "none", "금융 데이터 이해", "", [], "경험에 근거 없음"),
        R("must", "full", "배치 운영"),
        R("pref", "none", "규제 보고 경험", "", [], "경험에 근거 없음"),
      ],
      cultureGrade: "Red",
      cultureScore: 48,
      cultureType: "규제 대응형 (추정)",
    },
  },
  {
    analyzedAt: "2026-10-05",
    application: null,
    job: {
      company: "소담커머스",
      title: "검색 데이터 엔지니어",
      url: url(9),
      deadline: "2026-10-19",
      status: "undecided",
      fit: "상",
      // 기존 분석처럼 해당도를 아직 매기지 않은 문장도 있다.
      requirements: [
        R("duty", "full", "검색 로그 파이프라인"),
        R("duty", "part", "검색 품질 지표 마트"),
        R("must", "", "검색 엔진(Elasticsearch) 운영 경험"),
      ],
    },
  },
  {
    analyzedAt: "2026-09-15",
    application: null,
    job: {
      company: "늘봄카드",
      title: "마케팅 데이터 엔지니어",
      url: url(10),
      deadline: "2026-09-22",
      status: "skipped",
      fit: "하",
      conclusion: "하고 싶은 일과 거리가 멀어서 지원 안 함.",
      skipReason: "마케팅 도구 연동이 주업무라 하고 싶은 일과 거리가 멀다.",
      requirements: [R("must", "none", "마케팅 도구 연동", "", [], "경험에 근거 없음")],
    },
  },
  {
    analyzedAt: "2026-08-25",
    application: null,
    job: {
      company: "해든게임즈",
      title: "실시간 로그 엔지니어",
      url: url(11),
      deadline: "2026-08-31",
      status: "skipped",
      fit: "중",
      conclusion: "마감이 너무 빨라 준비하지 못함.",
    },
  },
];
