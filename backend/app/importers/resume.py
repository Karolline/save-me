"""이력을 JSON 파일에서 가져온다.

파일은 카드마다 키 하나이고, 칸은 API의 PUT 본문(camelCase)과 같다. 어느 키든 없어도 된다:

    {
      "basics": {"name": "김지원", "email": "jiwon.kim@example.com", "phone": "010-0000-0000",
                 "status": "재직 중", "want": "데이터 엔지니어", "summary": "5년 차 데이터 엔지니어입니다."},
      "direction": "플랫폼 쪽 일을 하고 싶다.\\n\\n## 피하고 싶은 것\\n- 야간 대응만 하는 자리",
      "careers": [{"company": "다올커머스", "team": "데이터팀", "role": "데이터 엔지니어",
                   "startedOn": "2021-03", "endedOn": "2022-12",
                   "leaveStartedOn": null, "leaveEndedOn": null,
                   "duties": "정산 쿼리 개선\\n클라우드 이전 · 로그 수집 파트"}],
      "educations": [{"school": "한빛대학교", "major": "통계학", "startedOn": "2011-03",
                      "endedOn": "2017-02", "status": "졸업"}],
      "certificates": [{"name": "SQLD", "acquiredOn": "2020-09", "issuer": "한국데이터산업진흥원",
                        "number": "SQLD-0123456"}],
      "skills": [{"category": "분산처리", "items": "Spark, Kafka", "memo": "AQE는 써 본 적 없음"}],
      "personality": [{"topic": "이직 사유", "question": "지금 회사를 왜 그만두려 하나요",
                       "answer": "", "lesson": ""}]
    }

(예는 지어낸 것이다.) 모르는 키(예: "education", 칸 이름 오타)가 있으면 아무것도 쓰지 않고 멈춘다. 경력의 회사 이름은 경험의 소속과 같은 이름으로 적는다.

카드마다 로컬 사용자의 카드가 비어 있으면 채우고, 이미 적은 것이 있으면 건너뛴다
("건너뜀"). --replace를 주면 그 카드를 통째로 바꾼다. 파일에서 비어 있는 카드(빈 목록,
빈 글, 칸이 모두 빈 기본 정보)는 없는 것처럼 다룬다: --replace로도 지우지 않는다.
같은 파일을 두 번 돌리면 두 번째는 모두 건너뛴다. 쓰기는 트랜잭션 하나다.

--dry-run은 같은 검사를 모두 하고 같은 요약을 보이지만, 끝에 트랜잭션을 되돌려
아무것도 쓰지 않는다. 마이그레이션도 하지 않으므로, DB가 최신 버전이 아니면 멈춘다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.resume ../private/resume.json
    uv run python -m app.importers.resume FILE --database-url postgresql://... [--dry-run] [--replace]
"""

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ConfigDict
from sqlalchemy import make_url

from app.db import database_url
from app.importers.confirm import execute
from app.importers.jobs import DRY_RUN_NOTE, one_line
from app.models import ApiModel, Career, Certificate, Education, PersonalityAnswer, ResumeBasics, SkillGroup
from app.stores import CARDS, Card, Stores

CARD_LABELS: dict[Card, str] = {
    "basics": "기본 정보",
    "careers": "경력",
    "educations": "학력",
    "certificates": "자격증",
    "skills": "기술 스택",
    "direction": "커리어 방향",
    "personality": "인성 답변",
}


# 가져오기 파일은 모르는 키를 거절한다: "education"·"certs" 같은 오타가 카드를 말없이
# 건너뛰지 않고 오류로 드러나게 (API 모델은 그대로 둔다).
FORBID = ConfigDict(**ApiModel.model_config, extra="forbid")


class ImportBasics(ResumeBasics):
    model_config = FORBID


class ImportCareer(Career):
    model_config = FORBID


class ImportEducation(Education):
    model_config = FORBID


class ImportCertificate(Certificate):
    model_config = FORBID


class ImportSkillGroup(SkillGroup):
    model_config = FORBID


class ImportPersonalityAnswer(PersonalityAnswer):
    model_config = FORBID


class ImportFile(ApiModel):
    model_config = FORBID

    basics: ImportBasics | None = None
    direction: str | None = None
    careers: list[ImportCareer] = []
    educations: list[ImportEducation] = []
    certificates: list[ImportCertificate] = []
    skills: list[ImportSkillGroup] = []
    personality: list[ImportPersonalityAnswer] = []

    def cards(self) -> dict[Card, Any]:
        """파일에 내용이 있는 카드만, 화면 순서대로."""
        out: dict[Card, Any] = {}
        for card in CARDS:
            value = getattr(self, card)
            if card == "basics":
                if value is not None and any(v.strip() for v in value.model_dump().values()):
                    out[card] = value
            elif card == "direction":
                if value and value.strip():
                    out[card] = value
            elif value:
                out[card] = value
        return out


@dataclass
class ImportResult:
    # 파일에 내용이 있는 카드 수.
    total: int = 0
    filled: int = 0
    replaced: int = 0
    # 건너뛴 카드의 이름, 화면 순서대로.
    skipped: list[str] = field(default_factory=list)

    def lines(self, target: str, dry_run: bool = False) -> list[str]:
        """사람이 읽는 요약: 첫 줄, 건너뛴 카드마다 한 줄, 시험이면 끝에 한 줄."""
        prefix = "[시험] " if dry_run else ""
        out = [
            f"{prefix}{target}: 채움 {self.filled}, 바꿈 {self.replaced}, "
            f"건너뜀 {len(self.skipped)} (파일 카드 {self.total}개)"
        ]
        out += [f"건너뜀: {name} (이미 있음)" for name in self.skipped]
        if dry_run:
            out.append(DRY_RUN_NOTE)
        return out


def load(path: Path) -> ImportFile:
    return ImportFile.model_validate(json.loads(path.read_text(encoding="utf-8")))


def import_resume(stores: Stores, user_id: int, data: ImportFile, replace: bool = False) -> ImportResult:
    cards = data.cards()
    actions = stores.resume.save_imported(user_id, cards, replace=replace)
    result = ImportResult(total=len(cards))
    for card, action in actions.items():
        if action == "filled":
            result.filled += 1
        elif action == "replaced":
            result.replaced += 1
        else:
            result.skipped.append(CARD_LABELS[card])
    return result


def run(stores: Stores, data: ImportFile, replace: bool) -> ImportResult:
    user = stores.users.dev_user()
    return import_resume(stores, user.id, data, replace=replace)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="기본값: DATABASE_URL, 없으면 saveme_dev")
    parser.add_argument("--dry-run", action="store_true", help="검사하고 요약만 보이고 아무것도 쓰지 않는다")
    parser.add_argument("--replace", action="store_true", help="이미 적은 카드도 파일 내용으로 바꾼다")
    args = parser.parse_args(argv)

    url = args.database_url or database_url()
    try:
        data = load(args.file)
    except (OSError, ValueError, TypeError) as error:
        # 파일을 못 읽거나 JSON·칸 모양이 틀렸다 (pydantic ValidationError도 ValueError). 아무것도 쓰지 않는다.
        raise SystemExit(f"파일을 읽지 못했어요 ({args.file}): {one_line(error)}") from error
    # --dry-run은 아무것도 쓰지 않는다. 진짜 DB에는 사람의 확인이 있어야 쓴다 (confirm.py).
    target = Path(make_url(url).database or url).name
    execute(
        url,
        is_dry_run=args.dry_run,
        work=lambda stores: run(stores, data, args.replace),
        summary=lambda result, dry: result.lines(target, dry_run=dry),
    )


if __name__ == "__main__":
    main()
