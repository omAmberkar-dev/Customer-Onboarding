import os

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    # DB_ENGINE=sqlite runs the portal on a local file (sqlite_db.py) instead of the shared MySQL database.
    if os.environ.get("DB_ENGINE", "mysql").lower() == "sqlite":
        import sqlite_db

        return sqlite_db.connect()
    return mysql.connector.connect(
        host=os.environ["DB_HOST"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        port=int(os.environ.get("DB_PORT", 3306)),
    )
