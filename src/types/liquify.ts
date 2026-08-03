export type ToolMode = 'push' | 'swell' | 'pinch' | 'reconstruct' | 'pan';

export interface BrushSettings {
  size: number; // in screen pixels (or image pixels)
  strength: number; // 0.0 to 1.0 (or 0-100%)
  touchOffset: number; // offset in pixels above touch point (e.g. 40px)
  enableOffset: boolean;
  meshOverlay: boolean;
  meshGridSize: number; // e.g. 128 (128x128 grid)
  meshOpacity: number; // 0.1 to 1.0
  meshColor: string; // e.g. '#3b82f6'
}

export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ExportSettings {
  format: ExportFormat;
  quality: number; // 0.1 to 1.0
}

export interface SampleImage {
  id: string;
  name: string;
  url: string;
  description?: string;
}
