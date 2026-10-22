"""job analyses skip reason

Revision ID: 870dbfc8d9f6
Revises: 01b149104829
Create Date: 2026-10-22 13:10:50.649152

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '870dbfc8d9f6'
down_revision: Union[str, Sequence[str], None] = '01b149104829'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('job_analyses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('skip_reason', sa.Text(), server_default='', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('job_analyses', schema=None) as batch_op:
        batch_op.drop_column('skip_reason')
