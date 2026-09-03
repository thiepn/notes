from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}")
    write(path, content.replace(old, new, 1))


replace_once(
    "src/components/ui/useDialogFocusTrap.ts",
    """  const onEscapeRef = useRef(options.onEscape);\n  onEscapeRef.current = options.onEscape;\n  const initialFocusRef = options.initialFocusRef;\n\n  useEffect(() => {\n""",
    """  const onEscapeRef = useRef(options.onEscape);\n  const initialFocusRef = options.initialFocusRef;\n\n  useEffect(() => {\n    onEscapeRef.current = options.onEscape;\n  }, [options.onEscape]);\n\n  useEffect(() => {\n""",
)

replace_once(
    "src/features/notes/NotesWorkspace.tsx",
    """  useEffect(() => {\n    if (!captureRequest || mode !== 'notes') return;\n    if (captureRequest.kind === 'checklist') {\n      setTextCaptureRequestId(undefined);\n      setChecklistCaptureOpen(true);\n    } else {\n      setChecklistCaptureOpen(false);\n      setTextCaptureRequestId(captureRequest.id);\n    }\n    onCaptureRequestHandled?.(captureRequest.id);\n  }, [captureRequest, mode, onCaptureRequestHandled]);\n""",
    """  useEffect(() => {\n    if (!captureRequest || mode !== 'notes') return;\n    const request = captureRequest;\n    const frame = window.requestAnimationFrame(() => {\n      if (request.kind === 'checklist') {\n        setTextCaptureRequestId(undefined);\n        setChecklistCaptureOpen(true);\n      } else {\n        setChecklistCaptureOpen(false);\n        setTextCaptureRequestId(request.id);\n      }\n      onCaptureRequestHandled?.(request.id);\n    });\n    return () => window.cancelAnimationFrame(frame);\n  }, [captureRequest, mode, onCaptureRequestHandled]);\n""",
)

replace_once(
    "src/features/storage/StorageHealthSettings.tsx",
    """  useEffect(() => {\n    void refresh();\n  }, [refresh]);\n""",
    """  useEffect(() => {\n    let cancelled = false;\n    void readStorageHealth().then((nextHealth) => {\n      if (!cancelled) setHealth(nextHealth);\n    });\n    return () => {\n      cancelled = true;\n    };\n  }, []);\n""",
)
