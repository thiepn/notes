from pathlib import Path


def append_once(path: str, marker: str, addition: str) -> None:
    file = Path(path)
    text = file.read_text()
    if marker in text:
        return
    file.write_text(text.rstrip() + '\n\n' + addition.strip() + '\n')


append_once(
    'src/styles/notes.css',
    '.capture-menu-layer {',
    '''
.capture-menu-layer {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--scrim);
}

.capture-menu {
  width: min(560px, calc(100vw - 32px));
  padding: 22px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  color: var(--text);
}

.capture-menu-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.capture-menu-header .workspace-kicker {
  margin-bottom: 4px !important;
}

.capture-menu-header h2 {
  margin: 0;
  font: 400 30px/1.1 var(--font-display);
}

.capture-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.capture-menu-action {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  min-height: 74px;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.capture-menu-action:hover,
.capture-menu-action:focus-visible {
  border-color: var(--accent-strong);
  background: var(--surface-hover);
}

.capture-menu-action-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.capture-menu-action-icon svg {
  width: 19px;
  height: 19px;
}

.capture-menu-action strong,
.capture-menu-action small {
  display: block;
}

.capture-menu-action strong {
  font-size: 14px;
}

.capture-menu-action small {
  margin-top: 3px;
  color: var(--text-subtle);
  font-size: 11px;
  line-height: 1.35;
}

.capture-menu-hint {
  margin: 16px 0 0;
  color: var(--text-subtle);
  font: 11px var(--font-mono);
  text-align: center;
}

@media (max-width: 767px) {
  .capture-menu-layer {
    place-items: end stretch;
    padding: 0;
  }

  .capture-menu {
    width: 100%;
    max-height: min(82dvh, 640px);
    overflow: auto;
    padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 18px 18px 0 0;
  }

  .capture-menu-grid {
    grid-template-columns: 1fr;
  }

  .capture-menu-action {
    min-height: 64px;
  }
}
''',
)

append_once(
    'src/styles/checklists.css',
    '.checklist-progress {',
    '''
.checklist-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 180px);
  align-items: center;
  gap: var(--space-3);
  color: var(--text-subtle);
  font-size: var(--text-xs);
}

.checklist-progress progress {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  accent-color: var(--accent-strong);
}

.checklist-primary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.checklist-primary-actions button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 620;
}

.checklist-primary-actions button:hover,
.checklist-primary-actions button:focus-visible {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.checklist-primary-actions svg {
  width: 15px;
  height: 15px;
}

@media (max-width: 767px) {
  .checklist-progress {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .checklist-options {
    align-items: stretch;
  }

  .checklist-primary-actions {
    width: 100%;
  }

  .checklist-primary-actions button {
    min-height: 44px;
  }
}
''',
)

print('P4 styles appended.')
