"""frequent questions

Revision ID: b3e8a1c4d5f2
Revises: 95daf954dc12
Create Date: 2026-11-09 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e8a1c4d5f2'
down_revision: Union[str, Sequence[str], None] = '95daf954dc12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('frequent_questions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Text(), nullable=False),
    sa.Column('example', sa.Text(), server_default='', nullable=False),
    sa.Column('how_to', sa.Text(), server_default='', nullable=False),
    sa.Column('good_example', sa.Text(), server_default='', nullable=False),
    sa.Column('avoid', sa.Text(), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_frequent_questions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_frequent_questions'))
    )
    with op.batch_alter_table('frequent_questions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_frequent_questions_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('frequent_questions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_frequent_questions_user_id'))

    op.drop_table('frequent_questions')
