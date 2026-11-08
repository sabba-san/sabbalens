import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

log = logging.getLogger(__name__)

is_sqlite = settings.database_url.startswith("sqlite")
engine_kwargs = {}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and perform lightweight column additions for existing databases (SQLite and PostgreSQL)."""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            if is_sqlite:
                result = conn.exec_driver_sql("PRAGMA table_info(photos);").fetchall()
                existing_columns = {row[1] for row in result}
                if existing_columns and "telegram_message_id" not in existing_columns:
                    conn.exec_driver_sql("ALTER TABLE photos ADD COLUMN telegram_message_id VARCHAR(255);")
                    conn.commit()
            else:
                conn.exec_driver_sql("ALTER TABLE photos ADD COLUMN IF NOT EXISTS telegram_message_id VARCHAR(255);")
                conn.commit()
        except Exception as exc:
            log.warning("Column auto-migration check notice: %s", exc)