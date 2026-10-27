"""A local SQLite stand-in for the portal's MySQL database (DB_ENGINE=sqlite, file at SQLITE_PATH, default local.db).

The connection behaves like mysql.connector's as far as the portal uses it: `cursor(dictionary=True)` rows are dicts, DATETIME /
DATE / DECIMAL columns come back as datetime / date / Decimal, and errors are raised as mysql.connector errors (with the MySQL
errno for a missing table or column), so the existing `except MySQLError` handling is unchanged. The few MySQL-only statements
the portal sends are rewritten on the way in (see _translate). NOW() is UTC, like the database's CURRENT_TIMESTAMP defaults.

Create the file from a MySQL dump with import_sqlite.py.
"""
import os
import re
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from mysql.connector import errors

DB_PATH = Path(os.getenv("SQLITE_PATH") or Path(__file__).with_name("local.db"))


def _datetime(value):
    return datetime.fromisoformat(value.decode())


sqlite3.register_adapter(datetime, lambda v: v.strftime("%Y-%m-%d %H:%M:%S"))
sqlite3.register_adapter(date, lambda v: v.isoformat())
sqlite3.register_adapter(Decimal, str)
sqlite3.register_converter("DATETIME", _datetime)
sqlite3.register_converter("TIMESTAMP", _datetime)
sqlite3.register_converter("DATE", lambda v: date.fromisoformat(v.decode()[:10]))
sqlite3.register_converter("DECIMAL", lambda v: Decimal(v.decode()))

# MySQL -> SQLite rewrites, applied in order.
_REWRITES = [
    # UPDATE a x JOIN b y ON ... SET x.col = ... WHERE ...  ->  UPDATE a AS x SET col = ... FROM b AS y WHERE (...) AND ...
    (re.compile(r"^UPDATE (\w+) (\w+) JOIN (\w+) (\w+) ON (.+?) SET \2\.(\w+) = (.+?) WHERE (.+)$", re.S),
     r"UPDATE \1 AS \2 SET \6 = \7 FROM \3 AS \4 WHERE (\5) AND \8"),
    (re.compile(r"TIMESTAMPDIFF\(SECOND,\s*(.+?),\s*NOW\(\)\)"), r"CAST(ROUND((julianday(NOW()) - julianday(\1)) * 86400) AS INTEGER)"),
    (re.compile(r"DATE_ADD\(NOW\(\),\s*INTERVAL %s MINUTE\)"), r"datetime(NOW(), '+' || %s || ' minutes')"),
    (re.compile(r"NOW\(\) - INTERVAL (\d+) HOUR"), r"datetime(NOW(), '-\1 hours')"),
    (re.compile(r"\s+FOR UPDATE\b"), ""),
    # A computed NOW() has no declared type: name it "<alias> [DATETIME]" so it comes back as a datetime, as from MySQL.
    (re.compile(r"\bNOW\(\) AS (\w+)"), r'NOW() AS "\1 [DATETIME]"'),
    (re.compile(r"%s"), "?"),
]


def _translate(sql):
    for pattern, replacement in _REWRITES:
        sql = pattern.sub(replacement, sql)
    return sql


def _mysql_error(err):
    """The mysql.connector error the portal would have seen for this SQLite error."""
    message = str(err)
    if isinstance(err, sqlite3.IntegrityError):
        return errors.IntegrityError(msg=message, errno=1062)
    if "no such table" in message:
        return errors.ProgrammingError(msg=message, errno=1146)
    if "no such column" in message or "has no column" in message:
        return errors.ProgrammingError(msg=message, errno=1054)
    return errors.DatabaseError(msg=message)


class Cursor:
    def __init__(self, cursor, dictionary):
        self._cursor, self._dictionary = cursor, dictionary

    def execute(self, sql, params=()):
        try:
            self._cursor.execute(_translate(sql), tuple(params or ()))
        except sqlite3.Error as err:
            raise _mysql_error(err) from err

    def _row(self, row):
        if row is None or not self._dictionary:
            return row
        return {column[0]: value for column, value in zip(self._cursor.description, row)}

    def fetchone(self):
        return self._row(self._cursor.fetchone())

    def fetchall(self):
        return [self._row(row) for row in self._cursor.fetchall()]

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    @property
    def with_rows(self):
        return self._cursor.description is not None

    def close(self):
        self._cursor.close()


class Connection:
    def __init__(self, path):
        self._conn = sqlite3.connect(path, timeout=30, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
        self._conn.create_function("NOW", 0, lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        self._conn.create_function("JSON_UNQUOTE", 1, lambda v: v)

    def cursor(self, dictionary=False, **_):
        return Cursor(self._conn.cursor(), dictionary)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def connect():
    if not DB_PATH.exists():
        raise errors.InterfaceError(msg=f"{DB_PATH.name} not found: create it with `python import_sqlite.py <dump.sql>`")
    return Connection(DB_PATH)
