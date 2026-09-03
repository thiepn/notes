from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text()
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}")
    target.write_text(content.replace(old, new, 1))


replace_once(
    "e2e/backup-recovery-polish.spec.ts",
    "Backup v2 · Database v2",
    "Backup v2 · Database v3",
)
replace_once(
    "e2e/database.spec.ts",
    "expect(result.databaseVersion).toBe(2);",
    "expect(result.databaseVersion).toBe(3);",
)
