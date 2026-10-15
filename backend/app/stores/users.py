"""Users, their login identities, and login sessions."""

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import delete, select

from app.db import SessionRow, UserIdentityRow, UserRow
from app.models import User
from app.stores.base import BaseStore

# The single local user of the fake login (provider, provider_user_id).
DEV_IDENTITY = ("dev", "me")
DEV_NICKNAME = "나"
# A session's last_seen_at is written at most this often, not on every request.
SEEN_EVERY = timedelta(minutes=10)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class UserStore(BaseStore):
    def login_identity(self, provider: str, provider_user_id: str, nickname: str) -> User:
        """The user with this identity, created (active) if there is none yet.

        Records the login time. Signup steps (invite code, terms) come with
        Kakao login; until then new users are active right away.
        """
        now = self.clock()
        with self.session() as db, db.begin():
            identity = db.scalar(
                select(UserIdentityRow).where(
                    UserIdentityRow.provider == provider,
                    UserIdentityRow.provider_user_id == provider_user_id,
                )
            )
            if identity is None:
                user = UserRow(nickname=nickname, status="active", created_at=now)
                db.add(user)
                db.flush()
                db.add(
                    UserIdentityRow(
                        user_id=user.id,
                        provider=provider,
                        provider_user_id=provider_user_id,
                        created_at=now,
                    )
                )
            else:
                user = db.get_one(UserRow, identity.user_id)
            user.last_login_at = now
            return User(id=user.id, nickname=user.nickname, status=user.status, provider=provider)

    def dev_user(self) -> User:
        """The local fake-login user, created on first use."""
        return self.login_identity(*DEV_IDENTITY, nickname=DEV_NICKNAME)

    def create_session(self, user_id: int, days: int) -> str:
        """Start a session and return its token (only its hash is stored)."""
        token = secrets.token_urlsafe(32)
        now = self.clock()
        with self.session() as db, db.begin():
            db.add(
                SessionRow(
                    user_id=user_id,
                    token_hash=hash_token(token),
                    created_at=now,
                    expires_at=now + timedelta(days=days),
                    last_seen_at=now,
                )
            )
        return token

    def user_for_token(self, token: str, days: int) -> User | None:
        """The user of a live session, or None. Using a session extends it."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = db.scalar(select(SessionRow).where(SessionRow.token_hash == hash_token(token)))
            if row is None:
                return None
            if row.expires_at <= now:
                db.delete(row)
                return None
            if now - row.last_seen_at >= SEEN_EVERY:
                row.last_seen_at = now
                row.expires_at = now + timedelta(days=days)
            user = db.get_one(UserRow, row.user_id)
            provider = db.scalar(
                select(UserIdentityRow.provider)
                .where(UserIdentityRow.user_id == user.id)
                .order_by(UserIdentityRow.id)
                .limit(1)
            )
            return User(id=user.id, nickname=user.nickname, status=user.status, provider=provider or "")

    def delete_session(self, token: str) -> None:
        with self.session() as db, db.begin():
            db.execute(delete(SessionRow).where(SessionRow.token_hash == hash_token(token)))

    def delete_sessions(self, user_id: int) -> None:
        """Log out everywhere."""
        with self.session() as db, db.begin():
            db.execute(delete(SessionRow).where(SessionRow.user_id == user_id))
