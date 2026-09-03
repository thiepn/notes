from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src/features/search/SearchWorkspace.tsx"


def replace_in_const_block(content: str, const_name: str, old: str, new: str) -> str:
    start = content.find(f"  const {const_name}")
    if start < 0:
        raise RuntimeError(f"Could not find {const_name}")
    end = content.find("\n\n  const ", start + 8)
    if end < 0:
        raise RuntimeError(f"Could not find end of {const_name}")
    block = content[start:end]
    if old not in block:
        raise RuntimeError(f"Could not find {old!r} inside {const_name}")
    return content[:start] + block.replace(old, new) + content[end:]


content = PATH.read_text()
for name in [
    "handleTogglePin",
    "handleArchive",
    "handleUnarchive",
    "handleTrash",
    "handleSetColor",
    "handleSetLabels",
    "handleSaved",
    "handleChecklistSaved",
]:
    content = replace_in_const_block(content, name, "refreshDocument()", "refreshDocument(note.id)")

content = replace_in_const_block(
    content,
    "handleDuplicate",
    "refreshDocument()",
    "refreshDocument(duplicate.id)",
)
PATH.write_text(content)
