# 공고분석 받은편지함

다른 프로젝트의 공고분석 에이전트가 공고를 분석하면, 결과를 아래 양식의 마크다운 파일로 SaveMe 받은편지함에 둔다. SaveMe에서는 `/import-jobs` 스킬(`.claude/skills/import-jobs/`)이 파일을 읽어 가져오기 JSON(`docs/local-operations.md`의 "공고분석")으로 바꾸고, 시험 실행과 백업을 한 뒤 DB에 넣는다.

## 어디에, 어떤 이름으로

- 폴더: `C:\dev\save-me\private\inbox\jobs\` (없으면 만든다). `private/`는 git이 무시하므로 진짜 데이터를 둬도 된다.
- 파일 이름: `YYYY-MM-DD-<회사>-<직무>.md`, UTF-8. 예: `2026-10-16-오늘의집-DataAnalyticsEngineer.md`.
- 파일 하나에 분석 하나.
- `done\` 폴더는 가져오기가 끝난 파일을 두는 곳이다. 거기에 쓰지 않는다.

## 양식

- 맨 위의 `---` 블록(기본 정보)과 `##`, `###` 제목은 **글자 그대로** 쓴다. 제목의 이름을 바꾸거나 순서를 바꾸지 않는다.
- 내용이 없는 섹션은 제목째 뺀다. `없음` 같은 글을 넣지 않는다.
- `[충족]`처럼 대괄호로 고르는 값은 적어 둔 것 중 하나만 쓴다.
- 목록 한 줄은 한 항목이다. 긴 글은 자유 글 섹션(한 줄 결론, 핏 평가, 잘 맞는 점, 공고 행간 읽기, 답, 기타 메모, 공고 원문)에 쓴다.
- `공고 원문`은 늘 맨 끝에 둔다. 그 아래는 모두 원문으로 읽는다.

````markdown
---
회사: 오늘의집
팀: Data팀
직무: Data Analytics Engineer (물류 도메인)
공고 URL: https://bucketplace.career.greetinghr.com/ko/o/237958
분석일: 2026-10-16
마감일: 2026-10-31
지원 여부: 미정
기술 핏: 상
---

## 한 줄 결론
자격요건은 대부분 채우지만 물류 도메인 경험이 비어 있어, 이걸 어떻게 말할지가 관건인 공고.

## 지원 조건
- [충족] 경력 4년 이상 — 총 경력 5년 2개월
- [확인 필요] 즉시 입사 — 현 직장 인수인계 1개월

## 요구사항
### 주요업무
- [충족] 물류 도메인 데이터 모델링 및 마트 설계
  - 설명: 정산 마트를 처음부터 설계해 운영함
  - 근거 경험: 2022-09 정산배치-튜닝, 주문이벤트-스트림재설계
  - 주의: 물류가 아니라 커머스 정산이었다는 점은 먼저 말한다
### 자격요건
- [부분] dbt 등 변환 도구 실무 경험
  - 근거 경험: 2024-03 지표표준화
  - 근거 없음: dbt 자체는 써 본 적 없음
### 우대사항
- [없음] 물류·SCM 도메인 경험
- [미평가] Airflow 운영 경험

## 핏 평가
판정 근거: 자격요건 5개 중 3개 충족, 2개 부분.

비는 곳: 물류 도메인, dbt.

## 성향 적합도
- 등급: Green
- 총점: 97
- 실제 역할 유형: 비즈니스 지표·마트 서포트형 (추정)
### 점수표
- 현업 소통·데이터 편의성: 18/20
  - 공고 근거: "현업의 업무 프로세스를 이해하고"
- 표준화·품질: 20/20
  - 공고 근거: "지표의 정의를 표준화"
### 잘 맞는 점
"SSOT", "Silver/Gold Layer" — 이미 실무에서 해 본 방식과 같은 말.
### 공고 행간 읽기
업무 8개 중 6개가 모델링·지표 표준화·품질이라 파이프라인 구축은 수단으로 보인다.
### Risk · Red Flag 체크
- 조직문화 인터뷰가 2회라 문화 적합을 엄격히 본다 (중간)

## 부각할 경험
1. 지표표준화
   - 대응하는 공고 요구: 주요업무 2 · 자격 3
   - 이유 · 주의: 지표 정의를 표준화한 경험이 공고 문장과 그대로 겹친다
2. 정산배치-튜닝
   - 대응하는 공고 요구: 주요업무 1
   - 이유 · 주의: 물류가 아니라 정산이라는 점을 먼저 밝힌다

## 서류에서 뺀 경험
- 사내 챗봇 PoC
  - 쓸 곳: 면접에서 AI 활용 역량을 물으면

## 약한 부분 · 면접 예상 질문
### 물류 데이터를 다뤄 본 적이 있나요?
정산 데이터가 주문·배송 이벤트와 이어져 있었다는 점에서 시작한다 → 배송 상태 지표를 만든 경험으로.

### dbt를 써 봤나요?
같은 문제를 SQL 뷰 계층으로 풀었다고 말하고, 옮겨 가는 데 걸릴 시간을 구체적으로 말한다.

## 작성 권장
- 지표 표준화 결과를 숫자로 (정의 몇 개 → 몇 개)

## 갭
- 물류 도메인
- dbt

## 경험 보완 제안
- dbt 튜토리얼로 정산 마트 일부를 다시 만들어 보기

## 면접 역질문
- 물류 지표의 정의는 지금 누가 관리하나요?

## 확인 필요
- 근무지가 판교인지 성수인지

## 기타 메모
[전형] 서류 > 직무 인터뷰(1~2회) > 조직문화 인터뷰(2회) > 처우협의

## 공고 원문
(사용자가 붙여 넣은 공고를 고치지 않고 그대로)
````

## 칸의 값

| 양식 | 쓸 수 있는 값 |
|---|---|
| 분석일 | `YYYY-MM-DD`. 꼭 쓴다. |
| 마감일 | `YYYY-MM-DD`. 상시 모집이거나 모르면 줄째 뺀다. |
| 지원 여부 | `미정`, `지원함`, `지원 안 함` |
| 기술 핏 | `상`, `중`, `하`, `판정 안 함` |
| 지원 조건 `[ ]` | `충족`, `확인 필요`, `안 맞음`. `—` 뒤는 내 상황. |
| 요구사항 `[ ]` | `충족`, `부분`(부분·인접), `없음`(경험에 근거 없음), `미평가` |
| 요구사항 아래 줄 | `설명`, `근거 경험`(쉼표로 구분), `근거 없음`, `주의`. 없는 줄은 뺀다. |
| 성향 적합도 등급 | `Green`, `Yellow`, `Red` |
| 총점, 점수표 점수 | 0 이상의 정수 (총점은 100점 만점). `받은 점수/만점`. |

- `회사`와 `분석일`은 꼭 쓴다. `직무`도 꼭 쓴다: SaveMe는 (회사, 직무)가 같으면 같은 분석으로 본다.
- 요구사항의 문장은 공고 문장을 그대로 옮긴다.
- 지원 건 연결은 양식에 없다. SaveMe 앱에서 한다.
- 어느 섹션에도 맞지 않는 내용은 `기타 메모`에 쓴다.

## SaveMe에서 바꾸는 법 (`/import-jobs`가 따른다)

| 양식 | 가져오기 JSON |
|---|---|
| 회사, 팀, 직무, 공고 URL, 분석일, 마감일 | `company`, `team`, `title`, `url`, `analyzedAt`, `deadline` (없으면 `null`) |
| 지원 여부 미정 / 지원함 / 지원 안 함 | `status`: `undecided` / `applied` / `skipped` |
| 기술 핏 상 / 중 / 하 / 판정 안 함 | `fit`: `상` / `중` / `하` / `""` |
| 한 줄 결론 | `conclusion` |
| 지원 조건 `- [상태] 조건 — 내 상황` | `conditions[]`: `{label, state: ok/check/no, text}` |
| 요구사항 `###` 주요업무 / 자격요건 / 우대사항 | `requirements[].category`: `duty` / `must` / `pref` (파일 순서대로) |
| `[충족]` / `[부분]` / `[없음]` / `[미평가]` | `level`: `full` / `part` / `none` / `""` |
| 설명, 근거 경험, 근거 없음, 주의 | `description`, `evidence[]`, `noEvidence`, `caution` |
| 핏 평가 (빈 줄로 나눈 문단) | `fitNotes[]` |
| 등급, 총점, 실제 역할 유형 | `cultureGrade`, `cultureScore`, `cultureType` |
| 점수표 `- 항목: 받은/만점`, `공고 근거` | `cultureItems[]`: `{name, score, max, quote}` |
| 잘 맞는 점, 공고 행간 읽기 | `culturePoints`, `cultureReadBetween` |
| Risk · Red Flag 체크 | `cultureRisks[]` |
| 부각할 경험 (번호 순) | `highlight[]`: `{exp, maps, why}` |
| 서류에서 뺀 경험 | `excluded[]`: `{exp, where}` |
| 약한 부분 · 면접 예상 질문 `###` 질문, 아래 글 | `questions[]`: `{question, answer}` |
| 작성 권장, 갭, 경험 보완 제안, 면접 역질문, 확인 필요 | `toWrite[]`, `gaps[]`, `expSuggestions[]`, `askBack[]`, `checks[]` |
| 기타 메모, 공고 원문 | `notes`, `rawText` |
| (없음) | `application: null` |

양식에 맞지 않는 줄이 있으면 짐작해서 넣지 않고, 사용자에게 보여 주고 묻는다.

## 가져오면 어떻게 되나

- 새 분석은 사람 확인이 N(미확인)으로 들어간다. 사용자가 앱에서 읽고 [읽고 확인했어요]를 누른다.
- 같은 (회사, 직무)가 이미 있으면 건너뛴다. 미확인 분석은 사용자가 원하면 바꾼다. 확인한 분석은 바꾸지 않는다: 다시 분석한 내용을 넣으려면 사용자가 앱에서 기존 분석을 지운 뒤 가져온다.

---

# Job analysis inbox (English)

When the job analysis agent in another project analyzes a posting, it drops the result as a Markdown file in the template above into SaveMe's inbox. In SaveMe the `/import-jobs` skill (`.claude/skills/import-jobs/`) reads the file, converts it to the import JSON ("공고분석" in `docs/local-operations.md`), dry-runs, backs up, and imports it.

## Where and what name

- Folder: `C:\dev\save-me\private\inbox\jobs\` (create it if missing). git ignores `private/`, so real data is fine there.
- File name: `YYYY-MM-DD-<company>-<title>.md`, UTF-8.
- One analysis per file.
- `done\` holds files that were already imported. Don't write there.

## Template

The template is in the Korean section above; it is the source of truth.

- Write the `---` block (basic info) and the `##`/`###` headings **exactly as given**. Don't rename or reorder them.
- Leave out a section with no content, heading and all. Don't write placeholders like `없음`.
- Bracketed choices like `[충족]` take one of the listed values only.
- One list line is one item. Long text goes in the free-text sections.
- `공고 원문` is always last; everything below it is read as the posting.

## Values

See the "칸의 값" table above. `회사`, `직무` and `분석일` are required (SaveMe treats the same company and title as the same analysis). Copy requirement sentences from the posting as is. Linking an application isn't part of the template; it happens in the SaveMe app. Content that fits nowhere goes in `기타 메모`.

## How SaveMe converts it (`/import-jobs` follows this)

The "SaveMe에서 바꾸는 법" table above maps each template part to the import JSON fields (`JobFields` in `openapi.yaml`, plus `analyzedAt` and `application: null`). A line that doesn't fit the template is never guessed at: show it to the user and ask.

## What happens on import

- A new analysis comes in with human check N (unconfirmed). The user reads it in the app and presses [읽고 확인했어요].
- An existing (company, title) is skipped. An unconfirmed one is replaced if the user asks; a confirmed one never is: to bring in a redone analysis, the user deletes the old one in the app first.
