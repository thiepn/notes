export type CaptureKind = 'text' | 'checklist' | 'image' | 'drawing' | 'voice' | 'scan';

export interface CaptureRequest {
  id: number;
  kind: CaptureKind;
  files?: File[];
}
