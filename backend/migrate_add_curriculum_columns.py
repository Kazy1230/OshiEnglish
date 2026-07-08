"""
One-shot migration: courses テーブルに curriculum_* 列と completion_video_url を追加する。
既に存在する列はスキップする（冪等）。
"""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)

columns = [
    ("curriculum_purpose",          "TEXT"),
    ("curriculum_target_audience",  "TEXT"),
    ("curriculum_topics",           "TEXT"),
    ("curriculum_duration",         "VARCHAR(100)"),
    ("curriculum_style",            "TEXT"),
    ("curriculum_concerns",         "TEXT"),
    ("curriculum_existing_videos",  "TEXT"),
    ("completion_video_url",        "VARCHAR(500)"),
]

with engine.connect() as conn:
    # 既存列を取得
    result = conn.execute(text("SHOW COLUMNS FROM courses"))
    existing = {row[0] for row in result}

    for col_name, col_type in columns:
        if col_name in existing:
            print(f"  SKIP  {col_name} (already exists)")
        else:
            conn.execute(text(f"ALTER TABLE courses ADD COLUMN {col_name} {col_type} NULL"))
            conn.commit()
            print(f"  ADDED {col_name} {col_type}")

print("Done.")
