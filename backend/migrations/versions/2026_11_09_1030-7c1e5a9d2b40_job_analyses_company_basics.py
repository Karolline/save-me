"""job analyses company basics

Revision ID: 7c1e5a9d2b40
Revises: 306ce6188f26
Create Date: 2026-11-09 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c1e5a9d2b40'
down_revision: Union[str, Sequence[str], None] = '306ce6188f26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('job_analyses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('company_note', sa.Text(), server_default='', nullable=False))
        batch_op.add_column(sa.Column('company_qna', sa.JSON(), server_default='[]', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('job_analyses', schema=None) as batch_op:
        batch_op.drop_column('company_qna')
        batch_op.drop_column('company_note')
