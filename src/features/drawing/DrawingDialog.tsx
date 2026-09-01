import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Eraser,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const DEFAULT_COLOR = '#202124';
const COLORS = ['#202124', '#c5221f', '#185abc', '#188038', '#8430ce'] as const;
const WIDTHS = [3, 7, 14] as const;

type DrawingTool = 'pen' | 'eraser';

interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingStroke {
  tool: DrawingTool;
  color: string;
  width: number;
  points: DrawingPoint[];
}

interface DrawingDialogProps {
  onSave(file: File): Promise<void> | void;
  onClose(): void;
}

export function DrawingDialog({ onSave, onClose }: DrawingDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([]);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redraw = useCallback((nextStrokes: DrawingStroke[] = strokes) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const stroke of nextStrokes) drawStroke(context, stroke);
  }, [strokes]);

  useLayoutEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, saving]);

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (saving || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    const stroke: DrawingStroke = {
      tool,
      color,
      width,
      points: [point],
    };
    activeStrokeRef.current = stroke;
    drawStrokeSegment(event.currentTarget, stroke, point, point);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke || saving) return;
    event.preventDefault();
    const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
    const previous = stroke.points[stroke.points.length - 1] ?? point;
    stroke.points.push(point);
    drawStrokeSegment(event.currentTarget, stroke, previous, point);
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    event.preventDefault();
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setStrokes((current) => [...current, cloneStroke(stroke)]);
    setRedoStack([]);
  };

  const undo = () => {
    setStrokes((current) => {
      const removed = current[current.length - 1];
      if (!removed) return current;
      setRedoStack((redo) => [...redo, removed]);
      return current.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((current) => {
      const restored = current[current.length - 1];
      if (!restored) return current;
      setStrokes((existing) => [...existing, restored]);
      return current.slice(0, -1);
    });
  };

  const clear = () => {
    if (strokes.length === 0) return;
    setRedoStack(strokes);
    setStrokes([]);
  };

  const save = async () => {
    if (saving || strokes.length === 0) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The drawing canvas is unavailable.');
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = CANVAS_HEIGHT;
      const context = exportCanvas.getContext('2d');
      if (!context) throw new Error('This browser cannot export drawings.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      context.drawImage(canvas, 0, 0);
      const blob = await canvasToBlob(exportCanvas);
      const filename = `drawing-${new Date().toISOString().replace(/[:.]/gu, '-')}.png`;
      await onSave(new File([blob], filename, { type: 'image/png', lastModified: Date.now() }));
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The drawing could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="drawing-dialog-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Drawing editor"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="drawing-dialog">
        <header className="drawing-dialog-header">
          <div>
            <strong>Drawing</strong>
            <span>Draw with mouse, touch, or stylus</span>
          </div>
          <button type="button" aria-label="Close drawing editor" disabled={saving} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools">
          <button
            type="button"
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            disabled={saving}
            onClick={() => setTool('pen')}
          >
            <Pencil aria-hidden="true" /> Pen
          </button>
          <button
            type="button"
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            disabled={saving}
            onClick={() => setTool('eraser')}
          >
            <Eraser aria-hidden="true" /> Eraser
          </button>

          <span className="drawing-toolbar-divider" aria-hidden="true" />

          <div className="drawing-colors" role="group" aria-label="Pen color">
            {COLORS.map((item) => (
              <button
                className="drawing-color"
                type="button"
                aria-label={`Pen color ${item}`}
                aria-pressed={color === item}
                disabled={saving}
                key={item}
                style={{ '--drawing-color': item } as React.CSSProperties}
                onClick={() => {
                  setColor(item);
                  setTool('pen');
                }}
              />
            ))}
          </div>

          <div className="drawing-widths" role="group" aria-label="Stroke width">
            {WIDTHS.map((item) => (
              <button
                type="button"
                aria-label={`Stroke width ${item}`}
                aria-pressed={width === item}
                disabled={saving}
                key={item}
                onClick={() => setWidth(item)}
              >
                <span style={{ width: item, height: item }} />
              </button>
            ))}
          </div>

          <span className="drawing-toolbar-spacer" />

          <button type="button" aria-label="Undo drawing stroke" disabled={saving || strokes.length === 0} onClick={undo}>
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" aria-label="Redo drawing stroke" disabled={saving || redoStack.length === 0} onClick={redo}>
            <Redo2 aria-hidden="true" />
          </button>
          <button type="button" aria-label="Clear drawing" disabled={saving || strokes.length === 0} onClick={clear}>
            <Trash2 aria-hidden="true" />
          </button>
        </div>

        <div className="drawing-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="drawing-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            aria-label="Drawing canvas"
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
        </div>

        <footer className="drawing-dialog-footer">
          <div aria-live="polite">
            {errorMessage ? <span className="drawing-error">{errorMessage}</span> : null}
            {!errorMessage && strokes.length === 0 ? <span>Draw at least one stroke to save.</span> : null}
          </div>
          <div>
            <button type="button" className="drawing-cancel" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="drawing-save" disabled={saving || strokes.length === 0} onClick={() => void save()}>
              {saving ? <RotateCcw aria-hidden="true" /> : <Save aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save drawing'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): DrawingPoint {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((clientX - bounds.left) / bounds.width) * CANVAS_WIDTH,
    y: ((clientY - bounds.top) / bounds.height) * CANVAS_HEIGHT,
  };
}

function drawStroke(context: CanvasRenderingContext2D, stroke: DrawingStroke): void {
  const points = stroke.points;
  if (points.length === 0) return;
  configureContext(context, stroke);
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  if (points.length === 1) {
    context.lineTo(points[0]!.x + 0.01, points[0]!.y + 0.01);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]!;
      context.lineTo(point.x, point.y);
    }
  }
  context.stroke();
  context.globalCompositeOperation = 'source-over';
}

function drawStrokeSegment(
  canvas: HTMLCanvasElement,
  stroke: DrawingStroke,
  from: DrawingPoint,
  to: DrawingPoint,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  configureContext(context, stroke);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.globalCompositeOperation = 'source-over';
}

function configureContext(context: CanvasRenderingContext2D, stroke: DrawingStroke): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.tool === 'eraser' ? Math.max(18, stroke.width * 3) : stroke.width;
  context.strokeStyle = stroke.color;
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
}

function cloneStroke(stroke: DrawingStroke): DrawingStroke {
  return { ...stroke, points: stroke.points.map((point) => ({ ...point })) };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && blob.size > 0) resolve(blob);
      else reject(new Error('This browser could not encode the drawing as PNG.'));
    }, 'image/png');
  });
}
