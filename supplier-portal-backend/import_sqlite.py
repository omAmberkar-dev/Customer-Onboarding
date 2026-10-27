"""Build the local SQLite database (sqlite_db.py) from a MySQL / HeidiSQL dump of the portal database.

    python import_sqlite.py <dump.sql> [--force]

Creates every table of the dump with its indexes and rows, then adds the demat columns (demat_account.sql) to `vendor`.
The file is written next to this script as local.db (or SQLITE_PATH); --force replaces an existing one.
"""
import re
import sqlite3
import sys
from pathlib import Path

import sqlite_db

COLUMN = re.compile(r"^`(\w+)` (\w+)(\([^)]*\))?(.*?),?$")
INDEX = re.compile(r"^(UNIQUE )?KEY `(\w+)` \((.+)\),?$")
PRIMARY = re.compile(r"^PRIMARY KEY \((.+)\),?$")
FOREIGN = re.compile(r"^CONSTRAINT `\w+` (FOREIGN KEY .+?),?$")
TYPES = {"int": "INTEGER", "bigint": "INTEGER", "tinyint": "INTEGER", "smallint": "INTEGER", "mediumint": "INTEGER",
         "datetime": "DATETIME", "timestamp": "TIMESTAMP", "date": "DATE", "decimal": "DECIMAL"}
DEMAT_COLUMNS = {"demat_id": 16, "dp_id": 8, "bo_id": 16, "depository": 4}


def _column(table, line, autoincrement, triggers):
    name, mysql_type, _, rest = COLUMN.match(line).groups()
    if name == autoincrement:
        return f'"{name}" INTEGER PRIMARY KEY AUTOINCREMENT'
    if "ON UPDATE CURRENT_TIMESTAMP" in rest:
        triggers.append(name)
    rest = re.sub(r" COMMENT '(?:[^'\\]|\\.|'')*'", "", rest)
    rest = re.sub(r" ON UPDATE CURRENT_TIMESTAMP| unsigned| AUTO_INCREMENT| CHARACTER SET \w+| COLLATE \w+", "", rest)
    return f'"{name}" {TYPES.get(mysql_type.lower(), "TEXT")}{rest}'


def create_table(lines):
    """SQLite statements for one MySQL CREATE TABLE block (its lines between the opening and the closing line)."""
    table = re.search(r"`(\w+)`", lines[0]).group(1)
    body = [line.strip() for line in lines[1:-1]]
    autoincrement = next((COLUMN.match(l).group(1) for l in body if COLUMN.match(l) and "AUTO_INCREMENT" in l), None)
    parts, indexes, triggers = [], [], []
    for line in body:
        if line.startswith("`"):
            parts.append(_column(table, line, autoincrement, triggers))
        elif match := PRIMARY.match(line):
            if match.group(1).replace("`", "") != autoincrement:
                parts.append(f"PRIMARY KEY ({match.group(1)})")
        elif match := INDEX.match(line):
            unique, name, columns = match.groups()
            indexes.append(f'CREATE {"UNIQUE " if unique else ""}INDEX "{table}_{name}" ON "{table}" ({columns})')
        elif match := FOREIGN.match(line):
            parts.append(match.group(1))
        else:
            raise ValueError(f"{table}: unrecognised line {line!r}")
    statements = [f'CREATE TABLE "{table}" (\n  ' + ",\n  ".join(parts) + "\n)", *indexes]
    for column in triggers:
        statements.append(
            f'CREATE TRIGGER "{table}_{column}_on_update" AFTER UPDATE ON "{table}" FOR EACH ROW WHEN NEW."{column}" = OLD."{column}" '
            f'BEGIN UPDATE "{table}" SET "{column}" = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid; END'
        )
    return statements


ESCAPES = {"0": "\0", "n": "\n", "r": "\r", "t": "\t", "Z": "\x1a", "b": "\b"}


def parse_row(text):
    """The values of one `(v1, 'v2', NULL, ...)` tuple of a MySQL INSERT."""
    values, i = [], text.index("(") + 1
    while True:
        while text[i] in " \t":
            i += 1
        if text[i] == "'":
            chars, i = [], i + 1
            while text[i] != "'" or text[i + 1:i + 2] == "'":
                if text[i] == "\\":
                    chars.append(ESCAPES.get(text[i + 1], text[i + 1]))
                    i += 2
                elif text[i] == "'":
                    chars.append("'")
                    i += 2
                else:
                    chars.append(text[i])
                    i += 1
            values.append("".join(chars))
            i += 1
        else:
            end = i
            while text[end] not in ",)":
                end += 1
            token = text[i:end].strip()
            values.append(None if token == "NULL" else token)
            i = end
        if text[i] == ")":
            return values
        i += 1  # the comma


def build(dump_path, db_path):
    conn = sqlite3.connect(db_path)
    lines = Path(dump_path).read_text(encoding="utf-8").splitlines()
    i, tables, rows = 0, 0, 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("CREATE TABLE"):
            end = next(j for j in range(i, len(lines)) if lines[j].startswith(")"))
            for statement in create_table(lines[i:end + 1]):
                conn.execute(statement)
            tables, i = tables + 1, end + 1
            continue
        if line.startswith("INSERT INTO"):
            table = re.search(r"`(\w+)`", line).group(1)
            columns = re.search(r"\((.*?)\) VALUES", line).group(1).replace("`", '"')
            batch = []
            while True:
                i += 1
                batch.append(parse_row(lines[i]))
                if lines[i].rstrip().endswith(";"):
                    break
            placeholders = ", ".join("?" * len(batch[0]))
            conn.executemany(f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})', batch)
            rows += len(batch)
        i += 1
    existing = {row[1] for row in conn.execute('PRAGMA table_info("vendor")')}
    for column, length in DEMAT_COLUMNS.items():
        if column not in existing:
            conn.execute(f'ALTER TABLE "vendor" ADD COLUMN "{column}" VARCHAR({length}) NULL')
    conn.commit()
    conn.close()
    return tables, rows


def main(argv):
    if not argv or argv[0].startswith("-"):
        sys.exit(__doc__)
    db_path = sqlite_db.DB_PATH
    if db_path.exists():
        if "--force" not in argv:
            sys.exit(f"{db_path} already exists; pass --force to replace it.")
        db_path.unlink()
    staging = db_path.with_suffix(".building")
    staging.unlink(missing_ok=True)
    try:
        tables, rows = build(argv[0], staging)
    except BaseException:
        staging.unlink(missing_ok=True)
        raise
    staging.rename(db_path)
    print(f"{db_path}: {tables} tables, {rows} rows imported, demat columns added to vendor.")


if __name__ == "__main__":
    main(sys.argv[1:])
