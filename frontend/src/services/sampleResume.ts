import type { Resume } from "./types";

/**
 * 목업(RESUME_SEED)과 바뀐 곳 목업의 지어낸 이력. 사람과 회사는 모두 지어낸 것이다.
 * 회사 이름은 샘플 경험의 소속(SAMPLE_EXPERIENCES)과 같다.
 */
export const SAMPLE_RESUME: Resume = {
  basics: {
    name: "김지원",
    email: "jiwon.kim@example.com",
    phone: "010-0000-0000",
    status: "재직 중 (휴직)",
    want: "데이터 엔지니어 (데이터 플랫폼·파이프라인)",
    summary:
      "주문·정산 데이터를 다루는 5년 차 데이터 엔지니어입니다. 일 3억 건 주문 이벤트 스트림과 정산 배치를 운영했고, 데이터 품질 검사 기준을 직접 정했습니다.",
  },
  direction:
    "파이프라인을 운영하는 일에서 시작해, 데이터 플랫폼을 설계하는 쪽으로 가고 싶다.\n사용자가 데이터를 믿고 쓸 수 있게 만드는 품질·관측 쪽에 특히 관심이 있다.\n\n피하고 싶은 것\n- 야간 장애 대응만 하는 자리",
  careers: [
    {
      company: "미담플랫폼",
      team: "데이터플랫폼팀",
      role: "정규직 · 데이터 엔지니어",
      startedOn: "2023-01",
      endedOn: null,
      leaveStartedOn: "2025-08",
      leaveEndedOn: "2026-12",
      duties: "주문 이벤트 스트림 운영 (일 3억 건), 핫 파티션 장애 해결\n데이터 품질 검사 도입\nAirflow DAG 120개 운영",
    },
    {
      company: "다올커머스",
      team: "데이터팀",
      role: "정규직 · 데이터 엔지니어",
      startedOn: "2020-03",
      endedOn: "2022-12",
      leaveStartedOn: null,
      leaveEndedOn: null,
      duties: "정산 쿼리 개선 (40분 → 6분)\n클라우드 이전 · 로그 수집 파트",
    },
  ],
  educations: [
    {
      school: "한빛대학교",
      major: "산업공학과 · 부전공 컴퓨터공학",
      startedOn: "2014-03",
      endedOn: "2020-02",
      status: "졸업",
    },
  ],
  certificates: [
    { name: "SQLD", acquiredOn: "2020-01", issuer: "한국데이터산업진흥원", number: "SQLD-0123456" },
    { name: "정보처리기사", acquiredOn: "2019-08", issuer: "한국산업인력공단", number: "19201234567A" },
  ],
  skills: [
    { category: "언어", items: "Python, SQL, Scala", memo: "" },
    { category: "분산처리", items: "Spark, Kafka, Flink (공부)", memo: "Spark 2→3 업그레이드 직접 함. AQE는 써 본 적 없음" },
    { category: "워크플로", items: "Airflow", memo: "" },
    { category: "클라우드", items: "AWS (S3, EMR, MSK)", memo: "" },
    { category: "컨테이너", items: "Kubernetes", memo: '입문 수준. "운영 n년" 요건 근거로 쓰지 않음' },
  ],
  personality: [
    {
      topic: "이직 사유",
      question: "지금 회사를 왜 그만두려 하나요?",
      answer: "회사 사정이 어려워진 것이 결론이고, 플랫폼 쪽으로 더 배우고 싶다는 이야기를 덧붙였어요.",
      lesson: "지원한 회사가 플랫폼 일을 주지 못하는 곳이면 두 번째 이유는 앞세우지 않는다.",
    },
    { topic: "이직 사유", question: "첫 회사를 그만둔 이유는?", answer: "", lesson: "" },
    {
      topic: "협업",
      question: "팀원과 의견이 갈렸을 때 어떻게 했나요?",
      answer: "품질 검사 위치로 의견이 갈렸을 때 두 안을 일주일씩 돌려 보고 실패 건수로 정했다.",
      lesson: "결론보다 합의 방식을 먼저 말하자.",
    },
    {
      topic: "",
      question: "가장 크게 실패한 경험은?",
      answer: "프로모션 날 정산이 6시간 늦어진 일.",
      lesson: "",
    },
  ],
};
