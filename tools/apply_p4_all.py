from pathlib import Path
import subprocess
import sys


def run(*args: str) -> None:
    subprocess.run(args, check=True)


if 'openCaptureMenu' not in Path('src/app/AppShell.tsx').read_text():
    run(sys.executable, 'tools/prepare_p4_patcher_v2.py')
    run(sys.executable, 'tools/apply_p4_shell.py')
    run(sys.executable, 'tools/apply_p4_notes.py')
    run(sys.executable, 'tools/apply_p4_checklists.py')
    run(sys.executable, 'tools/apply_p4_styles.py')

path = Path('src/features/notes/TextNoteComposer.tsx')
text = path.read_text()
old = '''  useEffect(() => {
    const request = captureRequest;
    if (!request || lastCaptureRequestIdRef.current === request.id) return;
    lastCaptureRequestIdRef.current = request.id;
    openCapture();

    if (request.kind === 'drawing') {
      setQuickDrawingOpen(true);
      return;
    }
    if (request.kind === 'voice') {
      setQuickVoiceOpen(true);
      return;
    }
    if (request.kind === 'image' || request.kind === 'scan') {
      const files = request.files ?? [];
      if (request.kind === 'scan') setExpandedToolsOpen(true);
      if (files.length > 0) void handleQuickImages(files);
    }
  }, [captureRequest, handleQuickImages, openCapture]);
'''
new = '''  useEffect(() => {
    const request = captureRequest;
    if (!request || lastCaptureRequestIdRef.current === request.id) return;
    lastCaptureRequestIdRef.current = request.id;
    const frame = window.requestAnimationFrame(() => {
      openCapture();
      if (request.kind === 'drawing') {
        setQuickDrawingOpen(true);
        return;
      }
      if (request.kind === 'voice') {
        setQuickVoiceOpen(true);
        return;
      }
      if (request.kind === 'image' || request.kind === 'scan') {
        const files = request.files ?? [];
        if (request.kind === 'scan') setExpandedToolsOpen(true);
        if (files.length > 0) void handleQuickImages(files);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [captureRequest, handleQuickImages, openCapture]);
'''
if old in text:
    path.write_text(text.replace(old, new, 1))
elif new not in text:
    raise RuntimeError('P4 capture intent effect shape was not found.')

print('P4 integrated source prepared.')
