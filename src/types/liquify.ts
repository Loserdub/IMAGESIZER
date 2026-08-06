export type ToolMode = 'push' | 'pull' | 'vortex' | 'reconstruct' | 'freeze' | 'thaw' | 'pan';

export interface BrushSettings {
  size: number; // in screen pixels
  strength: number; // 0.0 to 1.0
  touchOffset: number; // offset in pixels above touch point
  enableOffset: boolean;
  meshOverlay: boolean;
  meshGridSize: number; // e.g. 120
  meshOpacity: number; // 0.1 to 1.0
  meshColor: string; // e.g. '#3b82f6'
  showMask: boolean; // toggle freeze mask overlay
  maskOpacity: number; // 0.1 to 1.0
  maskColor: string; // e.g. '#ef4444'
  
  // Fluid Physics Parameters
  antiGravityIntensity: number; // 0.0 to 1.0
  antiGravityDirection: number; // Angle in radians
  fluidViscosity: number; // 0.0 to 1.0
  densityDissipation: number; // 0.0 to 1.0
  velocityDissipation: number; // 0.0 to 1.0
  distortionStrength: number; // 0.0 to 2.0
  pressureIterations: number; // Performance vs Quality
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
