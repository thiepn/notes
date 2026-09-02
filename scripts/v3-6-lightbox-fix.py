from pathlib import Path

path = Path('src/features/notes/AttachmentPanel.tsx')
text = path.read_text()

old = "  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);"
new = """  const [dimensions, setDimensions] = useState<{
    attachmentId: string;
    width: number;
    height: number;
  } | null>(null);"""
if old in text:
    text = text.replace(old, new, 1)
elif 'attachmentId: string;' not in text:
    raise SystemExit('Lightbox dimension-state marker changed.')

reset = """
  useEffect(() => {
    setDimensions(null);
  }, [attachment?.id]);
"""
text = text.replace(reset, '', 1)

old = """  const dimensionLabel = dimensions
    ? formatImageDimensions(dimensions.width, dimensions.height)
    : null;"""
new = """  const dimensionLabel =
    dimensions?.attachmentId === attachment.id
      ? formatImageDimensions(dimensions.width, dimensions.height)
      : null;"""
if old in text:
    text = text.replace(old, new, 1)
elif 'dimensions?.attachmentId === attachment.id' not in text:
    raise SystemExit('Lightbox dimension-label marker changed.')

old = """              setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })"""
new = """              setDimensions({
                attachmentId: attachment.id,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })"""
if old in text:
    text = text.replace(old, new, 1)
elif 'attachmentId: attachment.id' not in text:
    raise SystemExit('Lightbox image-load marker changed.')

path.write_text(text)
