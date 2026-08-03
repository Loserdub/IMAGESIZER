import React, { useRef, useEffect, useState, useCallback } from 'react';
import { LiquifyEngine } from '../engine/LiquifyEngine';
import { ToolMode, BrushSettings, ViewTransform, ImageDimensions } from '../types/liquify';

interface LiquifyCanvasProps {
  imageSrc: string;
  toolMode: ToolMode;
  settings: BrushSettings;
  engineRef: React.MutableRefObject<LiquifyEngine | null>;
  onHistoryChange: () => void;
  onImageLoaded: (dims: ImageDimensions) => void;
}

export const LiquifyCanvas: React.FC<LiquifyCanvasProps> = ({
  imageSrc,
  toolMode,
  settings,
  engineRef,
  onHistoryChange,
  onImageLoaded
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport Transform (Zoom & Pan)
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });

  // Cursor & Reticle position in screen coordinates
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: -1000,
    y: -1000,
    visible: false
  });

  // Touch Offset Reticle coordinates
  const [reticlePos, setReticlePos] = useState<{ touchX: number; touchY: number; targetX: number; targetY: number } | null>(null);

  // Interaction tracking
  const isDraggingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchStartMidRef = useRef<{ x: number; y: number } | null>(null);

  // Image dimensions
  const imageDimsRef = useRef<ImageDimensions>({ width: 800, height: 600 });

  // Initialize Liquify Engine
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new LiquifyEngine(canvasRef.current);
    engineRef.current = engine;

    return () => {
      engineRef.current = null;
    };
  }, []);

  // Load Image into Engine
  useEffect(() => {
    if (!engineRef.current || !imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const dims = { width: img.width, height: img.height };
      imageDimsRef.current = dims;
      onImageLoaded(dims);

      if (engineRef.current && canvasRef.current && containerRef.current) {
        // Size canvas
        const container = containerRef.current;
        canvasRef.current.width = container.clientWidth;
        canvasRef.current.height = container.clientHeight;

        engineRef.current.loadImage(img, settings.meshGridSize);
        fitImageToViewport(dims, container.clientWidth, container.clientHeight);
        onHistoryChange();
      }
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Update Mesh Settings in Engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMeshOverlay(settings.meshOverlay, settings.meshOpacity, settings.meshColor);
    }
  }, [settings.meshOverlay, settings.meshOpacity, settings.meshColor]);

  // Update Grid Size
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setGridSize(settings.meshGridSize);
    }
  }, [settings.meshGridSize]);

  // Fit Image inside container
  const fitImageToViewport = (dims: ImageDimensions, containerW: number, containerH: number) => {
    const padding = 40;
    const scaleX = (containerW - padding) / dims.width;
    const scaleY = (containerH - padding) / dims.height;
    const scale = Math.min(scaleX, scaleY, 1.5);

    const panX = (containerW - dims.width * scale) / 2;
    const panY = (containerH - dims.height * scale) / 2;

    setTransform({ scale, panX, panY });
  };

  // Resize Listener
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current || !engineRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      engineRef.current.render();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Screen to Image Normalized Coordinates
  const screenToNormImage = (screenX: number, screenY: number) => {
    const imgW = imageDimsRef.current.width * transform.scale;
    const imgH = imageDimsRef.current.height * transform.scale;

    const normX = (screenX - transform.panX) / imgW;
    const normY = (screenY - transform.panY) / imgH;

    return { normX, normY };
  };

  // Convert Screen brush radius to normalized image radius
  const screenRadiusToNorm = (screenRadius: number) => {
    const imgH = imageDimsRef.current.height * transform.scale;
    return screenRadius / imgH;
  };

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && (e as any).targetTouches?.length > 1) return;

    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    let screenX = e.clientX;
    let screenY = e.clientY;

    if (e.pointerType === 'touch' && settings.enableOffset) {
      screenY -= settings.touchOffset;
      setReticlePos({
        touchX: e.clientX,
        touchY: e.clientY,
        targetX: screenX,
        targetY: screenY
      });
    }

    lastPointRef.current = { x: screenX, y: screenY };

    if (toolMode !== 'pan' && engineRef.current) {
      const { normX, normY } = screenToNormImage(screenX, screenY);
      const normRadius = screenRadiusToNorm(settings.size / 2);

      engineRef.current.applyWarp(
        normX,
        normY,
        0,
        0,
        normRadius,
        settings.strength,
        toolMode
      );
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent) => {
    let screenX = e.clientX;
    let screenY = e.clientY;

    const isTouch = e.pointerType === 'touch';

    if (isTouch && settings.enableOffset) {
      const targetY = screenY - settings.touchOffset;
      setReticlePos({
        touchX: screenX,
        touchY: screenY,
        targetX: screenX,
        targetY: targetY
      });
      setCursorPos({ x: screenX, y: targetY, visible: true });
      screenY = targetY;
    } else {
      setReticlePos(null);
      setCursorPos({ x: screenX, y: screenY, visible: true });
    }

    if (!isDraggingRef.current || !lastPointRef.current) return;

    const dx = screenX - lastPointRef.current.x;
    const dy = screenY - lastPointRef.current.y;

    if (toolMode === 'pan') {
      setTransform(prev => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy
      }));
    } else if (engineRef.current) {
      const { normX, normY } = screenToNormImage(screenX, screenY);
      const imgW = imageDimsRef.current.width * transform.scale;
      const imgH = imageDimsRef.current.height * transform.scale;

      const normDragX = dx / imgW;
      const normDragY = dy / imgH;
      const normRadius = screenRadiusToNorm(settings.size / 2);

      engineRef.current.applyWarp(
        normX,
        normY,
        normDragX,
        normDragY,
        normRadius,
        settings.strength,
        toolMode
      );
    }

    lastPointRef.current = { x: screenX, y: screenY };
  };

  // Pointer Up / Cancel
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastPointRef.current = null;
    setReticlePos(null);

    if (toolMode !== 'pan' && engineRef.current) {
      engineRef.current.saveHistoryState();
      onHistoryChange();
    }
  };

  // Multi-Touch (2-finger Pinch Zoom & Pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];

      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartDistRef.current = dist;
      pinchStartScaleRef.current = transform.scale;
      pinchStartMidRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current && pinchStartMidRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];

      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scaleFactor = dist / pinchStartDistRef.current;

      const newScale = Math.max(0.2, Math.min(6, pinchStartScaleRef.current * scaleFactor));

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const dx = midX - pinchStartMidRef.current.x;
      const dy = midY - pinchStartMidRef.current.y;

      setTransform(prev => ({
        scale: newScale,
        panX: prev.panX + dx,
        panY: prev.panY + dy
      }));

      pinchStartMidRef.current = { x: midX, y: midY };
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
    pinchStartMidRef.current = null;
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(6, transform.scale * zoomFactor));

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const newPanX = mouseX - (mouseX - transform.panX) * (newScale / transform.scale);
    const newPanY = mouseY - (mouseY - transform.panY) * (newScale / transform.scale);

    setTransform({
      scale: newScale,
      panX: newPanX,
      panY: newPanY
    });
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerLeave={() => setCursorPos(prev => ({ ...prev, visible: false }))}
      className="relative w-full h-full bg-slate-950 overflow-hidden select-none touch-none cursor-crosshair"
    >
      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0px) scale(${transform.scale})`,
          transformOrigin: '0 0'
        }}
        className="absolute top-0 left-0 w-full h-full"
      />

      {/* Visual Brush Cursor Ring */}
      {cursorPos.visible && toolMode !== 'pan' && (
        <div
          style={{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            width: `${settings.size}px`,
            height: `${settings.size}px`
          }}
          className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-400/80 bg-indigo-500/10 shadow-lg shadow-indigo-500/20 z-20 flex items-center justify-center transition-all duration-75"
        >
          {/* Inner Falloff Pressure Ring */}
          <div
            style={{
              width: `${settings.size * 0.4}px`,
              height: `${settings.size * 0.4}px`
            }}
            className="rounded-full border border-indigo-300/40 bg-indigo-400/5"
          />

          {/* Center Focal Crosshair Dot */}
          <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full absolute shadow-sm" />
        </div>
      )}

      {/* Touch Offset Reticle Visual Connector */}
      {reticlePos && (
        <svg className="fixed inset-0 pointer-events-none z-20 w-full h-full">
          {/* Dotted line from touch contact point to offset target */}
          <line
            x1={reticlePos.touchX}
            y1={reticlePos.touchY}
            x2={reticlePos.targetX}
            y2={reticlePos.targetY}
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          {/* Touch Contact Dot */}
          <circle
            cx={reticlePos.touchX}
            cy={reticlePos.touchY}
            r="8"
            fill="rgba(16, 185, 129, 0.2)"
            stroke="#10b981"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
};
