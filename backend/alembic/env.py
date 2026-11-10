"""Alembic migration environment.

Resolves the database URL from application settings (``DATABASE_URL`` from the
environment / ``.env``) and exposes ``Base.metadata`` as the autogenerate
target. Importing :mod:`app.models` registers every ORM model on the metadata.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.database import Base

# Importing the models package registers every table on ``Base.metadata`` so
# that Alembic autogenerate can detect them. The star import pulls in whatever
# the package re-exports; the package itself is responsible for importing all
# model modules (per the contract, app/models/__init__.py imports them all).
from app import models  # noqa: F401
from app.models import *  # noqa: F401,F403

# Alembic Config object, providing access to values within alembic.ini.
config = context.config

# Inject the runtime database URL from settings so the .ini stays secret-free.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Configure Python logging from the .ini file, if present.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata object that autogenerate compares against.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
