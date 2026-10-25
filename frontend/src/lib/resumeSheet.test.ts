import { describe, expect, it } from "vitest";
import { RESUME } from "@/services/sampleDocuments";
import { SAMPLE_RESUME } from "@/services/sampleResume";
import type { Resume } from "@/services";
import { blankResume, bodyToResumeData, dotMonth, fillFromMenu, splitComma, withBlanks } from "./resumeSheet";

describe("blankResume", () => {
  it("has exactly one empty item in every list", () => {
    const data = blankResume();
    expect(data.careers).toHaveLength(1);
    expect(data.careers[0].blocks).toEqual([{ title: "", items: [""], projects: [] }]);
    expect(data.personalProjects).toEqual([{ title: "", items: [""] }]);
    expect(data.educations).toHaveLength(1);
    expect(data.skills).toEqual([""]);
  });

  it("withBlanks refills emptied lists but keeps filled ones", () => {
    const data = withBlanks({ ...blankResume(), careers: [], skills: ["A"], educations: [] });
    expect(data.careers).toHaveLength(1);
    expect(data.skills).toEqual(["A"]);
    expect(data.educations).toHaveLength(1);
  });
});

describe("splitComma / dotMonth", () => {
  it("splits on commas outside parentheses", () => {
    expect(splitComma("Python, SQL,  ,AWS (S3, EMR)")).toEqual(["Python", "SQL", "AWS (S3, EMR)"]);
  });
  it("writes months with a dot", () => {
    expect(dotMonth("2021-10")).toBe("2021.10");
    expect(dotMonth(null)).toBe("");
  });
});

const emptyMenu = (): Resume => ({
  basics: { name: "", email: "", phone: "", status: "", want: "", summary: "" },
  direction: "",
  careers: [],
  educations: [],
  certificates: [],
  skills: [],
  personality: [],
});

describe("fillFromMenu", () => {
  const menu: Resume = {
    ...emptyMenu(),
    basics: { name: "홍길동", email: "a@example.com", phone: "010-0000-0000", status: "", want: "", summary: "소개\n둘째 줄" },
    careers: [
      {
        company: "예시", team: "팀", role: "엔지니어", startedOn: "2021-10", endedOn: null,
        leaveStartedOn: null, leaveEndedOn: null, duties: "첫 일\n\n둘째 일\n",
      },
      {
        company: "예시2", team: "", role: "", startedOn: "2020-06", endedOn: "2021-09",
        leaveStartedOn: null, leaveEndedOn: null, duties: "",
      },
    ],
    educations: [{ school: "대학", major: "전공", startedOn: "2013-03", endedOn: null, status: "졸업" }],
    skills: [
      { category: "언어", items: "Python, SQL", memo: "" },
      { category: "처리", items: "SQL, Spark", memo: "" },
    ],
  };

  it("copies everything into a blank sheet", () => {
    const { data, changed, menuEmpty } = fillFromMenu(blankResume(), menu);

    expect(changed).toBe(true);
    expect(menuEmpty).toBe(false);
    expect([data.name, data.phone, data.email]).toEqual(["홍길동", "010-0000-0000", "a@example.com"]);
    expect(data.intro).toBe("소개\n둘째 줄");
    expect(data.careers[0]).toEqual({
      company: "예시", from: "2021.10", to: "재직중", type: "", role: "엔지니어",
      blocks: [{ title: "", items: ["첫 일", "둘째 일"], projects: [] }],
    });
    expect(data.careers[1].to).toBe("2021.09");
    expect(data.careers[1].blocks[0].items).toEqual([""]);
    expect(data.educations[0]).toEqual({ school: "대학", from: "2013.03", to: "", status: "졸업", major: "전공" });
    expect(data.skills).toEqual(["Python", "SQL", "Spark"]);
    expect(data.personalProjects).toEqual(blankResume().personalProjects);
  });

  it("fills only the empty fields and never overwrites", () => {
    const current = {
      ...blankResume(),
      name: "내 이름",
      careers: [{ ...blankResume().careers[0], company: "내 회사" }],
      skills: ["Go"],
    };

    const { data, changed } = fillFromMenu(current, menu);

    expect(changed).toBe(true);
    expect(data.name).toBe("내 이름");
    expect(data.phone).toBe("010-0000-0000");
    expect(data.careers).toHaveLength(1);
    expect(data.careers[0].company).toBe("내 회사");
    expect(data.skills).toEqual(["Go"]);
    expect(data.educations[0].school).toBe("대학");
  });

  it("changes nothing when every field is already filled", () => {
    const first = fillFromMenu(blankResume(), menu).data;

    const second = fillFromMenu(first, menu);

    expect(second.changed).toBe(false);
    expect(second.data).toEqual(first);
  });

  it("reports an empty menu", () => {
    const { changed, menuEmpty, data } = fillFromMenu(blankResume(), emptyMenu());
    expect(menuEmpty).toBe(true);
    expect(changed).toBe(false);
    expect(data).toEqual(blankResume());
  });

  it("works with the sample resume", () => {
    const { data } = fillFromMenu(blankResume(), SAMPLE_RESUME);
    expect(data.careers.length).toBe(SAMPLE_RESUME.careers.length);
    expect(data.skills.length).toBeGreaterThan(0);
  });
});

describe("bodyToResumeData", () => {
  it("turns an empty body into a blank sheet", () => {
    expect(bodyToResumeData("")).toEqual(blankResume());
    expect(bodyToResumeData("  \n ")).toEqual(blankResume());
  });

  it("converts the sample resume", () => {
    const data = bodyToResumeData(RESUME);

    expect(data.name).toBe("김지원");
    expect(data.email).toBe("jiwon.kim@example.com");
    expect(data.phone).toBe("010-0000-0000");
    expect(data.intro).toContain("주문·정산 데이터를 다루는 5년 차");
    expect(data.careers).toHaveLength(2);
    expect(data.careers[0]).toMatchObject({
      company: "미담플랫폼", from: "2023.01", to: "2025.05", type: "정규직", role: "데이터플랫폼팀",
    });
    expect(data.careers[0].blocks).toHaveLength(1);
    expect(data.careers[0].blocks[0].items).toEqual([
      "주문 이벤트 스트림의 핫 파티션 장애 해결 (프로모션 날 최대 랙 6시간 → 15분)",
      "데이터 품질 검사 도입, 잘못된 마트 0건",
    ]);
    expect(data.careers[1].company).toBe("다올커머스");
    expect(data.skills).toEqual(["Python", "SQL", "Scala", "Spark", "Kafka", "Airflow", "AWS (S3, EMR, MSK)"]);
    expect(data.educations).toHaveLength(1);
    expect(data.educations[0]).toMatchObject({ school: "한빛대학교", major: "산업공학과 (부전공 컴퓨터공학)" });
    // 학교가 아닌 줄과 연락처 줄의 나머지는 버리지 않고 소개 글 아래로.
    expect(data.intro).toContain("희망: 데이터 엔지니어 (데이터 플랫폼)");
    expect(data.intro).toContain("정보처리기사 · SQLD");
  });

  it("converts a flowing resume copied from an HTML page (invented example)", () => {
    const body = [
      "# 홍길동",
      "gildong@example.com / 010-1234-5678",
      "",
      "## 경력",
      "예시주식회사",
      "2021.10 - 재직중 / 정규직 / 데이터 엔지니어",
      "지표 표준화와 원천 모델링",
      "1. 지표 식별 기준 정립 (2021.11 - 2021.12)",
      "- 팀별로 다르던 기준 조사",
      "- 표준 기준 정립",
      "2. 외부 데이터 적재 설계 (2022.01 - 2022.03)",
      "- 적재 단위 유일성 검증",
      "",
      "## 기술 스택",
      "- Python",
      "- SQL, Spark",
      "",
      "## 학력",
      "예시대학교 영어영문학과 2013.03 - 2017.08 졸업",
    ].join("\n");

    const data = bodyToResumeData(body);

    expect(data).toMatchObject({ name: "홍길동", email: "gildong@example.com", phone: "010-1234-5678" });
    const career = data.careers[0];
    expect(career).toMatchObject({ company: "예시주식회사", from: "2021.10", to: "재직중", type: "정규직", role: "데이터 엔지니어" });
    expect(career.blocks[0].projects.map((p) => p.title)).toEqual([
      "지표 식별 기준 정립 (2021.11 - 2021.12)",
      "외부 데이터 적재 설계 (2022.01 - 2022.03)",
    ]);
    expect(career.blocks[0].projects[0].items).toEqual(["팀별로 다르던 기준 조사", "표준 기준 정립"]);
    // 표시 없는 제목 줄("지표 표준화와 원천 모델링")은 업무 묶음 제목이다.
    expect(career.blocks[0].title).toBe("지표 표준화와 원천 모델링");
    expect(data.skills).toEqual(["Python", "SQL", "Spark"]);
    expect(data.educations[0]).toMatchObject({
      school: "예시대학교", from: "2013.03", to: "2017.08", status: "졸업", major: "영어영문학과",
    });
  });

  it("converts a plain-text resume without markers into companies, titled blocks and schools (invented example)", () => {
    const body = [
      "홍길동",
      "010-1234-5678 / gildong@example.com",
      "",
      "소개 문단입니다.",
      "",
      "",
      "경력",
      "",
      "",
      "예시주식회사",
      "2021.10 - 재직중 / 정규직 / 데이터 엔지니어",
      "",
      "",
      "지표 표준화",
      "",
      "1. 기준 정립 (2021.11 - 2021.12)",
      "- 기준 조사",
      "",
      "2. 적재 설계 (2022.01 - 2022.03)",
      "- 유일성 검증",
      "",
      "",
      "플랫폼 전환 (2022.10 - 2023.08, 파트 담당)",
      "",
      "- 모듈 개발",
      "- 소스 전환",
      "",
      "",
      "예시상사 (자회사 소속)",
      "2020.06 - 2021.09 (1년 4개월) / 정규직 / 데이터 엔지니어",
      "",
      "",
      "추천 파이프라인 개발",
      "",
      "1. 태깅 서버 데이터 수집",
      "2. 마트 로직 설계",
      "",
      "",
      "학력",
      "",
      "",
      "예시대학교",
      "2013.03 - 2017.08 / 졸업 / 영어영문학과(주전공), 컴퓨터과학부(부전공)",
    ].join("\n");

    const data = bodyToResumeData(body);

    expect(data.intro).toBe("소개 문단입니다.");
    expect(data.careers.map((c) => c.company)).toEqual(["예시주식회사", "예시상사 (자회사 소속)"]);
    const [first, second] = data.careers;
    expect(first.blocks.map((b) => b.title)).toEqual(["지표 표준화", "플랫폼 전환 (2022.10 - 2023.08, 파트 담당)"]);
    expect(first.blocks[0].projects.map((p) => p.title)).toEqual(["기준 정립 (2021.11 - 2021.12)", "적재 설계 (2022.01 - 2022.03)"]);
    expect(first.blocks[1]).toMatchObject({ items: ["모듈 개발", "소스 전환"], projects: [] });
    // 아래에 "- " 줄이 없는 번호 줄은 프로젝트가 아니라 그냥 줄이다.
    expect(second).toMatchObject({ to: "2021.09 (1년 4개월)", type: "정규직", role: "데이터 엔지니어" });
    expect(second.blocks[0]).toMatchObject({ title: "추천 파이프라인 개발", items: ["태깅 서버 데이터 수집", "마트 로직 설계"], projects: [] });
    expect(data.educations).toEqual([
      { school: "예시대학교", from: "2013.03", to: "2017.08", status: "졸업", major: "영어영문학과(주전공), 컴퓨터과학부(부전공)" },
    ]);
  });

  it("splits a company's lines into titled blocks and the personal projects section", () => {
    const body = [
      "# 이름",
      "## 경력",
      "### 회사 · 팀",
      "> 2023.01 – 2025.05 · 정규직",
      "- 첫 줄",
      "#### 소제목",
      "- 소제목 아래 줄",
      "",
      "## 개인 프로젝트",
      "### 사이드 프로젝트 (2024)",
      "- 만든 것",
    ].join("\n");

    const data = bodyToResumeData(body);

    expect(data.careers[0].blocks).toEqual([
      { title: "", items: ["첫 줄"], projects: [] },
      { title: "소제목", items: ["소제목 아래 줄"], projects: [] },
    ]);
    expect(data.personalProjects).toEqual([{ title: "사이드 프로젝트 (2024)", items: ["만든 것"] }]);
  });

  it("keeps text it does not understand under the intro instead of dropping it", () => {
    const body = "# 이름\n\n## 자기소개서\n저는 이런 사람입니다.\n\n## 맺음말\n감사합니다.";

    const data = bodyToResumeData(body);

    expect(data.name).toBe("이름");
    expect(data.intro).toContain("자기소개서");
    expect(data.intro).toContain("저는 이런 사람입니다.");
    expect(data.intro).toContain("감사합니다.");
    expect(data.careers).toEqual(blankResume().careers);
  });

  it("treats plain section lines like 경력 as section titles", () => {
    const data = bodyToResumeData("김가나\n010-1111-2222\n\n경력\n회사A\n2020.01 - 2021.02\n- 한 일\n\n학력\n가나대학교 졸업");

    expect(data.phone).toBe("010-1111-2222");
    expect(data.careers[0]).toMatchObject({ company: "회사A", from: "2020.01", to: "2021.02" });
    expect(data.educations[0]).toMatchObject({ school: "가나대학교", status: "졸업" });
  });

  it("never throws: unreadable text still opens", () => {
    for (const body of ["###", "|||", "- ", "1. ", "> \n>", "# \n## \n### "]) {
      expect(() => bodyToResumeData(body)).not.toThrow();
    }
  });
});
