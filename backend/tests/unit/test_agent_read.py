"""에이전트용 조회 명령 (app.agent_read): 근거 구분, 사용자 분리, 읽기 전용, 인자."""

from datetime import date

import pytest
from sqlalchemy import MetaData, select

from app.agent_read import (
    NO_USER,
    NOT_AT_HEAD,
    QAS_HINT,
    REFERENCE_MARK,
    RETRY_MARK,
    build_parser,
    main,
)
from app.models import (
    Answer,
    Career,
    ExperienceAsked,
    ExperienceInput,
    ExperienceLinkInput,
    ExperienceQa,
    JobInput,
    PersonalityAnswer,
    QuestionInput,
    ResumeBasics,
    ReviewInput,
    SkillGroup,
)
from app.stores import Stores
from tests.conftest import application

SECRET_QA = "비밀예상질문ZZ"
SECRET_QA_ANSWER = "비밀예상답변ZZ"
SECRET_AI = "AI첨언심은문구ZZ"
SECRET_SUMMARY = "후기개요심은문구ZZ"
SECRET_INTERVIEWER = "면접관말심은문구ZZ"
OTHER_MARK = "남의데이터ZZ"


def snapshot(engine) -> dict[str, list]:
    metadata = MetaData()
    metadata.reflect(engine)
    with engine.connect() as connection:
        return {
            name: sorted(map(tuple, connection.execute(select(table)).all()), key=repr)
            for name, table in metadata.tables.items()
        }


def run(monkeypatch, capsys, url: str, *argv: str) -> str:
    monkeypatch.setenv("DATABASE_URL", url)
    main(list(argv))
    return capsys.readouterr().out


def fail(monkeypatch, capsys, url: str, *argv: str) -> tuple[int | str, str]:
    monkeypatch.setenv("DATABASE_URL", url)
    with pytest.raises(SystemExit) as info:
        main(list(argv))
    return info.value.code, capsys.readouterr().err


def seed(stores: Stores, user_id: int, mark: str = "") -> dict:
    """한 사용자의 경험 둘(하나는 다른 경험과 연결), 후기, 이력, 인성답변, 공고분석."""
    first = stores.experiences.create(
        user_id,
        ExperienceInput(
            name=f"{mark}결제 개편",
            started_on="2025-03",
            ended_on="2025-09",
            org="누리",
            tags=["성능", "협업"],
            summary="요약 첫 줄\n요약 둘째 줄",
            situation="상황 글",
            task="과제 글",
            scope="내가 맡은 범위",
            actions=[{"title": "캐시 도입", "points": ["읽기 줄이기", "여러 줄\n둘째 줄"], "note": "회고 글"}],
            result_mine=["응답 40% 단축"],
            numbers="40%",
            appeal_questions=["성능을 개선한 경험은?"],
            framing=["팀 성과를 내 것처럼 쓰지 말 것"],
            asked=[ExperienceAsked(question="캐시 무효화는?", where="1차 면접")],
            qas=[ExperienceQa(question=SECRET_QA, answer=SECRET_QA_ANSWER, caution="주의")],
        ),
    )
    second = stores.experiences.create(
        user_id,
        ExperienceInput(
            name=f"{mark}검색 개선",
            tags=["성능"],
            related=[ExperienceLinkInput(experience_id=first.id, note="같은 팀")],
        ),
    )
    app = stores.applications.create(user_id, application(f"{mark}누리커머스", date(2026, 7, 1)))
    review = stores.reviews.create(
        user_id,
        ReviewInput(
            application_id=app.id,
            round="1차 면접",
            extra="실무진",
            interviewed_at=date(2026, 7, 20),
            summary=SECRET_SUMMARY,
            questions=[
                QuestionInput(
                    question="캐시를 왜 썼나요?",
                    answers=[
                        Answer(kind="interviewer", body=SECRET_INTERVIEWER),
                        Answer(kind="mine", body="읽기가 많아서요"),
                        Answer(kind="retry", body="수치를 먼저 말하겠다"),
                        Answer(kind="memo", body="메모 글"),
                        Answer(kind="ai", body=SECRET_AI),
                    ],
                )
            ],
        ),
    )
    stores.resume.save_basics(user_id, ResumeBasics(name=f"{mark}김지원", want="백엔드", summary="요약\n둘째 줄"))
    stores.resume.save_list(
        user_id, "careers", [Career(company=f"{mark}누리", role="개발", started_on="2024-01", duties="결제\n정산")]
    )
    stores.resume.save_list(user_id, "skills", [SkillGroup(category=f"{mark}언어", items="Python, SQL", memo="3년")])
    stores.resume.save_list(
        user_id,
        "personality",
        [PersonalityAnswer(topic="협업", question=f"{mark}갈등을 푼 경험은?", answer="대화로 풀었다", lesson="먼저 듣기")],
    )
    job = stores.jobs.create(user_id, JobInput(company=f"{mark}누리커머스", title="백엔드", application_id=app.id))
    return {"first": first, "second": second, "review": review, "job": job}


@pytest.fixture
def seeded(db_file, monkeypatch):
    url, engine, stores = db_file
    user = stores.users.dev_user()
    data = seed(stores, user.id)
    return url, engine, stores, user.id, data


# ── 경험 ──


def test_experience_index_lists_experiences_tags_and_questions(seeded, monkeypatch, capsys):
    url, _, _, _, data = seeded
    out = run(monkeypatch, capsys, url, "experience-index")

    assert f"[id {data['first'].id}] 결제 개편 (2025-03 ~ 2025-09 · 누리)" in out
    assert f"[id {data['second'].id}] 검색 개선" in out
    assert "- 성능 (2건)" in out and "- 협업 (1건)" in out
    assert "성능을 개선한 경험은?" in out
    assert "요약 첫 줄" in out and "요약 둘째 줄" in out


def test_experience_index_hides_expected_questions_by_default(seeded, monkeypatch, capsys):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "experience-index")

    assert SECRET_QA not in out and SECRET_QA_ANSWER not in out
    assert REFERENCE_MARK not in out
    assert QAS_HINT in out
    # 개수는 알리지 않는다.
    assert "1건" not in QAS_HINT and "(1)" not in out


def test_experience_index_with_reference_marks_them(seeded, monkeypatch, capsys):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "experience-index", "--include-reference")

    assert out.index(REFERENCE_MARK) < out.index(SECRET_QA)


def test_experience_shows_star_fields_and_links(seeded, monkeypatch, capsys):
    url, _, _, _, data = seeded
    out = run(monkeypatch, capsys, url, "experience", str(data["first"].id))
    assert "상황 글" in out and "과제 글" in out and "내가 맡은 범위" in out
    assert "### 1. 캐시 도입" in out and "읽기 줄이기" in out and "회고 글" in out
    assert "여러 줄\n  둘째 줄" in out
    assert "응답 40% 단축" in out
    assert "팀 성과를 내 것처럼 쓰지 말 것" in out
    assert "캐시 무효화는?" in out

    linked = run(monkeypatch, capsys, url, "experience", str(data["second"].id))
    assert f"[id {data['first'].id}] 결제 개편" in linked and "같은 팀" in linked


def test_experience_hides_expected_questions_by_default(seeded, monkeypatch, capsys):
    url, _, _, _, data = seeded
    out = run(monkeypatch, capsys, url, "experience", str(data["first"].id))
    assert SECRET_QA not in out and SECRET_QA_ANSWER not in out
    assert REFERENCE_MARK not in out
    assert QAS_HINT in out


def test_experience_with_reference_puts_the_mark_before_them(seeded, monkeypatch, capsys):
    url, _, _, _, data = seeded
    out = run(monkeypatch, capsys, url, "experience", str(data["first"].id), "--include-reference")
    assert out.index(REFERENCE_MARK) < out.index(SECRET_QA) < out.index(SECRET_QA_ANSWER)
    assert "서류의 근거로 쓰지 마세요" in out


def test_missing_experience_id_fails(seeded, monkeypatch, capsys):
    url, *_ = seeded
    code, err = fail(monkeypatch, capsys, url, "experience", "9999")
    assert code == 1 and "없어요" in err


# ── 이력, 인성답변, 공고분석 ──


def test_profile_personality_and_jobs(seeded, monkeypatch, capsys):
    url, _, _, _, data = seeded
    profile = run(monkeypatch, capsys, url, "profile")
    assert "김지원" in profile and "백엔드" in profile
    assert "요약\n  둘째 줄" in profile
    assert "누리 · 개발" in profile and "결제\n  정산" in profile
    assert "Python, SQL" in profile and "3년" in profile

    personality = run(monkeypatch, capsys, url, "personality")
    assert "갈등을 푼 경험은?" in personality and "대화로 풀었다" in personality and "먼저 듣기" in personality

    jobs = run(monkeypatch, capsys, url, "jobs")
    assert f"[id {data['job'].id}] 누리커머스 · 백엔드" in jobs
    assert "사람 확인 Y" in jobs and "연결됨 (누리커머스 2026-07-01)" in jobs


# ── 면접후기: 근거 구분 ──


def test_reviews_default_shows_only_mine_retry_memo(seeded, monkeypatch, capsys):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "reviews")

    assert "읽기가 많아서요" in out and "메모 글" in out and "수치를 먼저 말하겠다" in out
    for hidden in (SECRET_AI, SECRET_SUMMARY, SECRET_INTERVIEWER):
        assert hidden not in out
    assert REFERENCE_MARK not in out


def test_reviews_mark_retry_but_not_mine_or_memo(seeded, monkeypatch, capsys):
    url, *_ = seeded
    lines = run(monkeypatch, capsys, url, "reviews").splitlines()

    retry = next(line for line in lines if "다시 답한다면" in line and "수치를 먼저" in line)
    mine = next(line for line in lines if "읽기가 많아서요" in line)
    memo = next(line for line in lines if "메모 글" in line)
    assert RETRY_MARK in retry
    assert RETRY_MARK not in mine and RETRY_MARK not in memo
    assert "실제로 한 답이 아님" not in mine + memo


def test_reviews_with_reference_marks_ai_and_unconfirmed_columns(seeded, monkeypatch, capsys):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "reviews", "--include-reference")

    for shown in (SECRET_AI, SECRET_SUMMARY, SECRET_INTERVIEWER):
        assert shown in out
        assert REFERENCE_MARK in out[: out.index(shown)]
        # 표시가 가장 가까운 앞쪽에 있다 (근거 아님 블록 안).
        block_start = out.rindex(REFERENCE_MARK, 0, out.index(shown))
        assert "### 질문" not in out[block_start : out.index(shown)]
    # 내 답은 여전히 표시 없이 나온다.
    assert "읽기가 많아서요" in out


# ── 사용자 분리 ──


def test_other_users_data_never_shows_up(seeded, other_user_id, monkeypatch, capsys):
    url, _, stores, _, data = seeded
    theirs = seed(stores, other_user_id, OTHER_MARK)

    for argv in (
        ("experience-index", "--include-reference"),
        ("experience", str(data["first"].id), "--include-reference"),
        ("profile",),
        ("personality",),
        ("reviews", "--include-reference"),
        ("jobs",),
    ):
        assert OTHER_MARK not in run(monkeypatch, capsys, url, *argv), argv

    code, err = fail(monkeypatch, capsys, url, "experience", str(theirs["first"].id))
    assert code == 1 and "없어요" in err and OTHER_MARK not in err


# ── 읽기 전용 ──


def test_commands_do_not_change_the_database(seeded, monkeypatch, capsys):
    url, engine, *_ = seeded
    before = snapshot(engine)
    for argv in (
        ("experience-index", "--include-reference"),
        ("experience", "1"),
        ("profile",),
        ("personality",),
        ("reviews", "--include-reference"),
        ("jobs",),
    ):
        run(monkeypatch, capsys, url, *argv)
    assert snapshot(engine) == before


def test_without_a_local_user_it_stops_without_creating_one(db_file, monkeypatch, capsys):
    url, engine, _ = db_file
    before = snapshot(engine)

    code, _ = fail(monkeypatch, capsys, url, "jobs")

    assert code == NO_USER
    assert snapshot(engine) == before


def test_old_database_stops_without_migrating(mig_url, monkeypatch, capsys):
    from alembic import command

    from app.db import make_engine
    from app.migrate import alembic_config

    command.upgrade(alembic_config(mig_url), "7cbb5044c70b")
    engine = make_engine(mig_url)
    before = snapshot(engine)

    code, _ = fail(monkeypatch, capsys, mig_url, "profile")

    assert code == NOT_AT_HEAD
    assert snapshot(engine) == before
    engine.dispose()


# ── 인자 ──


def test_no_or_unknown_subcommand_shows_usage_and_fails(db_file, monkeypatch, capsys):
    url, *_ = db_file
    for argv in ((), ("nope",), ("experience",), ("experience", "abc")):
        code, err = fail(monkeypatch, capsys, url, *argv)
        assert code != 0 and "사용법" in err, argv


def test_include_reference_only_where_allowed(db_file, monkeypatch, capsys):
    url, *_ = db_file
    for argv in (("profile", "--include-reference"), ("personality", "--include-reference"), ("jobs", "--include-reference")):
        code, _ = fail(monkeypatch, capsys, url, *argv)
        assert code != 0, argv


def test_parser_has_no_user_selecting_option():
    parser = build_parser()
    subparsers = next(a for a in parser._actions if hasattr(a, "choices") and a.choices)
    options = {o for p in [parser, *subparsers.choices.values()] for a in p._actions for o in a.option_strings}
    assert options <= {"-h", "--help", "--include-reference"}
    assert not any("user" in o or "database" in o for o in options)
    with pytest.raises(SystemExit):
        parser.parse_args(["jobs", "--user-id", "2"])
