"""careers has_day

Revision ID: 306ce6188f26
Revises: b3b3c7c40600
Create Date: 2026-10-25 21:57:40.871844

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '306ce6188f26'
down_revision: Union[str, Sequence[str], None] = 'b3b3c7c40600'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('careers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('started_on_has_day', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('ended_on_has_day', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('leave_started_on_has_day', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('leave_ended_on_has_day', sa.Boolean(), server_default=sa.false(), nullable=False))



def downgrade() -> None:
    with op.batch_alter_table('careers', schema=None) as batch_op:
        batch_op.drop_column('leave_ended_on_has_day')
        batch_op.drop_column('leave_started_on_has_day')
        batch_op.drop_column('ended_on_has_day')
        batch_op.drop_column('started_on_has_day')

