from datetime import timedelta

from app.stores import DEV_IDENTITY, Stores
from app.stores.users import hash_token
from tests.conftest import FakeClock


def test_login_creates_an_active_user_once(stores: Stores):
    first = stores.users.login_identity("kakao", "1001", "지원")
    again = stores.users.login_identity("kakao", "1001", "다른 닉네임")

    assert first.id == again.id
    assert first.status == "active"
    assert again.nickname == "지원"  # the stored nickname, not the new one
    assert first.provider == "kakao"


def test_same_provider_id_on_another_provider_is_another_user(stores: Stores):
    kakao = stores.users.login_identity("kakao", "1001", "지원")
    google = stores.users.login_identity("google", "1001", "지원")
    assert kakao.id != google.id


def test_dev_user_is_always_the_same_user(stores: Stores):
    first = stores.users.dev_user()
    assert stores.users.dev_user().id == first.id
    assert first.provider == DEV_IDENTITY[0]
    assert first.nickname == "나"


def test_session_token_finds_its_user_and_is_stored_hashed(stores: Stores, engine):
    user = stores.users.dev_user()
    token = stores.users.create_session(user.id, 30)

    found = stores.users.user_for_token(token, 30)

    assert found is not None and found.id == user.id and found.provider == "dev"
    with engine.connect() as connection:
        stored = connection.exec_driver_sql("SELECT token_hash FROM sessions").scalar()
    assert stored == hash_token(token) != token
    assert stores.users.user_for_token("not-a-token", 30) is None


def test_expired_session_is_rejected_and_removed(stores: Stores, clock: FakeClock, engine):
    user = stores.users.dev_user()
    token = stores.users.create_session(user.id, 30)

    clock.now += timedelta(days=31)

    assert stores.users.user_for_token(token, 30) is None
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM sessions").scalar() == 0


def test_using_a_session_extends_it(stores: Stores, clock: FakeClock):
    user = stores.users.dev_user()
    token = stores.users.create_session(user.id, 30)

    clock.now += timedelta(days=20)
    assert stores.users.user_for_token(token, 30) is not None
    clock.now += timedelta(days=20)  # 40 days after login, 20 after last use

    assert stores.users.user_for_token(token, 30) is not None


def test_logout_deletes_one_session_logout_all_deletes_every_one(stores: Stores):
    user = stores.users.dev_user()
    other = stores.users.login_identity("kakao", "2002", "남")
    a = stores.users.create_session(user.id, 30)
    b = stores.users.create_session(user.id, 30)
    c = stores.users.create_session(other.id, 30)

    stores.users.delete_session(a)
    assert stores.users.user_for_token(a, 30) is None
    assert stores.users.user_for_token(b, 30) is not None

    stores.users.delete_sessions(user.id)
    assert stores.users.user_for_token(b, 30) is None
    assert stores.users.user_for_token(c, 30) is not None
