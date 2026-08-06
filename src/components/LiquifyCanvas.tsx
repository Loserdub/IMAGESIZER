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
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  // Viewport Transform (Zoom & Pan)
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });

  // FIX #9: Mirror transform into a ref so event handlers always read the
  // current value without stale closure capture.
  const transformRef = useRef<ViewTransform>({ scale: 1, panX: 0, panY: 0 });
  const syncTransform = useCallback((t: ViewTransform) => {
    transformRef.current = t;
    setTransform(t);
  }, []);

  // Cursor & Reticle state
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: -1000, y: -1000, visible: false
  });
  const [reticlePos, setReticlePos] = useState<{
    touchX: number; touchY: number; targetX: number; targetY: number;
  } | null>(null);

  // Interaction tracking
  const isDraggingRef      = useRef(false);
  const lastPointRef       = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef  = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchStartMidRef   = useRef<{ x: number; y: number } | null>(null);

  // FIX #8: Track active pointer IDs to reliably detect multi-touch on PointerEvents
  const activePointerIdsRef = useRef<Set<number>>(new Set());

  // Image dimensions ref (read in event handlers without closure lag)
  const imageDimsRef = useRef<ImageDimensions>({ width: 800, height: 600 });

  // Settings ref (always current inside event handlers)
  const settingsRef  = useRef<BrushSettings>(settings);
  const toolModeRef  = useRef<ToolMode>(toolMode);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { toolModeRef.current = toolMode; }, [toolMode]);

  // ---------------------------------------------------------------------------
  // FIX #1: Merge engine init + image load into a single effect.
  // Previously two separate effects would race on the first render, leaving
  // engineRef.current === null when the image-load effect fired.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !imageSrc) return;

    // Create engine once (or reuse if already exists)
    if (!engineRef.current) {
      engineRef.current = new LiquifyEngine(canvasRef.current);
    }

    const engine = engineRef.current;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!canvasRef.current || !containerRef.current) return;

      const dims: ImageDimensions = { width: img.width, height: img.height };
      imageDimsRef.current = dims;
      onImageLoaded(dims);

      // FIX #2: Size canvas backing buffer at physical pixels (DPR-aware).
      // CSS layout stays at 100%/100% via className.
      const dpr = window.devicePixelRatio || 1;
      const container = containerRef.current;
      canvasRef.current.width  = Math.round(dims.width  * dpr);
      canvasRef.current.height = Math.round(dims.height * dpr);

      engine.loadImage(img);
      fitImageToViewport(dims, container.clientWidth, container.clientHeight);
      onHistoryChange();
    };
    img.onerror = () => {
      console.error('[LiquifyCanvas] Failed to load image:', imageSrc);
    };
    img.src = imageSrc;

    return () => {
      // On unmount, destroy the engine to stop animation frames and clear WebGL resources
      if (engineRef.current) {
          engineRef.current.destroy();
          engineRef.current = null;
      }
    };
  }, [imageSrc]); // eslint-disable-line react-hooks/exhaustive-deps



  // Clear touch reticle offset if offset is disabled in settings
  useEffect(() => {
    if (!settings.enableOffset) {
      setReticlePos(null);
    }
  }, [settings.enableOffset]);

  // ---------------------------------------------------------------------------
  // FIX #10: Passive wheel listener — attach via useEffect with { passive: false }
  // so e.preventDefault() actually works and the page doesn't scroll.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const t = transformRef.current;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale   = Math.max(0.2, Math.min(6, t.scale * zoomFactor));

      // FIX #3: Use container-relative coordinates for zoom pivot.
      // e.clientX/Y is viewport-relative; subtract the container's bounding rect
      // so the pivot is correct regardless of header height or sidebar width.
      const rect  = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - t.panX) * (newScale / t.scale);
      const newPanY = mouseY - (mouseY - t.panY) * (newScale / t.scale);

      syncTransform({ scale: newScale, panX: newPanX, panY: newPanY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [syncTransform]);

  // Resize listener — re-size canvas backing buffer on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current || !engineRef.current) return;
      const dpr = window.devicePixelRatio || 1;
      const dims = imageDimsRef.current;
      if (dims) {
        canvasRef.current.width  = Math.round(dims.width  * dpr);
        canvasRef.current.height = Math.round(dims.height * dpr);
      }
      engineRef.current.render();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---------------------------------------------------------------------------
  // Coordinate helpers — read from refs to avoid stale closures (FIX #9)
  // ---------------------------------------------------------------------------

  const screenToNormImage = useCallback((screenX: number, screenY: number) => {
    const t    = transformRef.current;
    const dims = imageDimsRef.current;
    const imgW = dims.width  * t.scale;
    const imgH = dims.height * t.scale;
    return {
      normX: (screenX - t.panX) / imgW,
      normY: (screenY - t.panY) / imgH
    };
  }, []);

  const screenRadiusToNorm = useCallback((screenRadius: number) => {
    const t    = transformRef.current;
    const dims = imageDimsRef.current;
    return screenRadius / (dims.height * t.scale);
  }, []);

  const fitImageToViewport = (dims: ImageDimensions, containerW: number, containerH: number) => {
    const padding = 40;
    const scaleX  = (containerW - padding) / dims.width;
    const scaleY  = (containerH - padding) / dims.height;
    const scale   = Math.min(scaleX, scaleY, 1.5);
    const panX    = (containerW - dims.width  * scale) / 2;
    const panY    = (containerH - dims.height * scale) / 2;
    syncTransform({ scale, panX, panY });
  };

  // ---------------------------------------------------------------------------
  // Pointer Events
  // ---------------------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent) => {
    // FIX #8: Register this pointer ID so we can detect multi-touch reliably
    activePointerIdsRef.current.add(e.pointerId);

    // If two or more touch pointers are active, do not start/continue a warp stroke
    if (e.pointerType === 'touch' && activePointerIdsRef.current.size > 1) {
      // Cancel any in-progress stroke when the second finger lands
      isDraggingRef.current = false;
      lastPointRef.current  = null;
      return;
    }

    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Container-relative coords (consistent with zoom pivot fix #3)
    const rect = containerRef.current?.getBoundingClientRect();
    let screenX = e.clientX - (rect?.left ?? 0);
    let screenY = e.clientY - (rect?.top  ?? 0);

    const s = settingsRef.current;
    const isTouch = e.pointerType === 'touch';

    if (isTouch && s.enableOffset) {
      const offsetY = screenY - s.touchOffset;
      setReticlePos({ touchX: screenX, touchY: screenY, targetX: screenX, targetY: offsetY });
      setCursorPos({ x: screenX, y: offsetY, visible: true });
      screenY = offsetY;
    } else {
      setReticlePos(null);
      setCursorPos({ x: screenX, y: screenY, visible: true });
    }

    lastPointRef.current = { x: screenX, y: screenY };

    const mode = toolModeRef.current;
    if (mode !== 'pan' && engineRef.current) {
      const { normX, normY }   = screenToNormImage(screenX, screenY);
      const normRadius         = screenRadiusToNorm(s.size / 2);
      const aspect             = (canvasRef.current?.width || 1) / (canvasRef.current?.height || 1);
      engineRef.current.applyWarp(normX, normY, 0, 0, normRadius, s.strength, mode, aspect);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // FIX #8: Ignore move events from non-primary touch pointers during multi-touch
    if (e.pointerType === 'touch' && activePointerIdsRef.current.size > 1) return;

    const rect = containerRef.current?.getBoundingClientRect();
    let screenX = e.clientX - (rect?.left ?? 0);
    let screenY = e.clientY - (rect?.top  ?? 0);

    const s       = settingsRef.current;
    const isTouch = e.pointerType === 'touch';

    if (isTouch && s.enableOffset) {
      const offsetY = screenY - s.touchOffset;
      setReticlePos({ touchX: screenX, touchY: screenY, targetX: screenX, targetY: offsetY });
      setCursorPos({ x: screenX, y: offsetY, visible: true });
      screenY = offsetY;
    } else {
      setReticlePos(null);
      setCursorPos({ x: screenX, y: screenY, visible: true });
    }

    if (!isDraggingRef.current || !lastPointRef.current) return;

    const dx = screenX - lastPointRef.current.x;
    const dy = screenY - lastPointRef.current.y;
    const mode = toolModeRef.current;

    if (mode === 'pan') {
      const t = transformRef.current;
      syncTransform({ ...t, panX: t.panX + dx, panY: t.panY + dy });
    } else if (engineRef.current) {
      const t = transformRef.current;
      const dims = imageDimsRef.current;
      const { normX, normY } = screenToNormImage(screenX, screenY);
      const normDragX  = dx / (dims.width  * t.scale);
      const normDragY  = dy / (dims.height * t.scale);
      const normRadius = screenRadiusToNorm(s.size / 2);
      const aspect     = (canvasRef.current?.width || 1) / (canvasRef.current?.height || 1);
      engineRef.current.applyWarp(normX, normY, normDragX, normDragY, normRadius, s.strength, mode, aspect);
    }

    lastPointRef.current = { x: screenX, y: screenY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // FIX #8: Unregister this pointer ID
    activePointerIdsRef.current.delete(e.pointerId);

    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    lastPointRef.current  = null;
    setReticlePos(null);

    // Hide cursor if pointer released outside canvas container
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        setCursorPos(prev => ({ ...prev, visible: false }));
      }
    }

    const mode = toolModeRef.current;
    if (mode !== 'pan' && engineRef.current) {
      engineRef.current.saveHistoryState();
      onHistoryChange();
    }
  };

  // ---------------------------------------------------------------------------
  // Multi-Touch Pinch Zoom & Pan (TouchEvents)
  // ---------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Cancel any active warp stroke when second finger appears
      isDraggingRef.current = false;
      lastPointRef.current  = null;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const rect = containerRef.current?.getBoundingClientRect();
      const ox = rect?.left ?? 0;
      const oy = rect?.top  ?? 0;

      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartDistRef.current  = dist;
      pinchStartScaleRef.current = transformRef.current.scale;
      pinchStartMidRef.current   = {
        x: (t1.clientX + t2.clientX) / 2 - ox,
        y: (t1.clientY + t2.clientY) / 2 - oy
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current && pinchStartMidRef.current) {
      e.preventDefault(); // Prevent native browser pan during pinch
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const rect = containerRef.current?.getBoundingClientRect();
      const ox = rect?.left ?? 0;
      const oy = rect?.top  ?? 0;

      const dist        = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scaleFactor = dist / pinchStartDistRef.current;
      const newScale    = Math.max(0.2, Math.min(6, pinchStartScaleRef.current * scaleFactor));

      const midX = (t1.clientX + t2.clientX) / 2 - ox;
      const midY = (t1.clientY + t2.clientY) / 2 - oy;

      const dx = midX - pinchStartMidRef.current.x;
      const dy = midY - pinchStartMidRef.current.y;
      const t  = transformRef.current;

      syncTransform({ scale: newScale, panX: t.panX + dx, panY: t.panY + dy });

      pinchStartMidRef.current = { x: midX, y: midY };
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
    pinchStartMidRef.current  = null;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerLeave={() => {
        if (!isDraggingRef.current) {
          setCursorPos(prev => ({ ...prev, visible: false }));
        }
      }}
      className={`relative w-full h-full bg-neutral-950 overflow-hidden select-none touch-none ${
        toolMode === 'pan' ? (isDraggingRef.current ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'
      }`}
    >
      {/* WebGL Canvas — CSS fills container, backing buffer is DPR-scaled (FIX #2) */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: imageDimsRef.current ? `${imageDimsRef.current.width}px` : '100%',
          height: imageDimsRef.current ? `${imageDimsRef.current.height}px` : '100%',
          transform: `translate3d(${transform.panX}px, ${transform.panY}px, 0px) scale(${transform.scale})`,
          transformOrigin: '0 0'
        }}
        className="absolute top-0 left-0"
      />

      {/* Visual Brush Cursor Ring & Precision Crosshair */}
      {cursorPos.visible && toolMode !== 'pan' && (
        <div
          style={{
            transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0) translate(-50%, -50%)`,
            width:  `${settings.size}px`,
            height: `${settings.size}px`
          }}
          className="pointer-events-none absolute top-0 left-0 rounded-full border border-emerald-400/60 bg-emerald-500/8 z-20 flex items-center justify-center transition-[width,height] duration-75"
        >
          {/* Inner falloff pressure ring */}
          <div
            style={{ width: `${settings.size * 0.5}px`, height: `${settings.size * 0.5}px` }}
            className="rounded-full border border-emerald-400/25 bg-emerald-400/5"
          />
          {/* Precision crosshair guides */}
          <div className="absolute w-full h-[1px] bg-emerald-400/20" />
          <div className="absolute h-full w-[1px] bg-emerald-400/20" />
          {/* Center focal dot */}
          <div className="w-1 h-1 bg-emerald-300 rounded-full absolute" />
        </div>
      )}

      {/* Touch Offset Reticle — dotted line from finger to offset target */}
      {reticlePos && (
        <svg className="absolute inset-0 pointer-events-none z-20 w-full h-full">
          <line
            x1={reticlePos.touchX}
            y1={reticlePos.touchY}
            x2={reticlePos.targetX}
            y2={reticlePos.targetY}
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <circle
            cx={reticlePos.touchX}
            cy={reticlePos.touchY}
            r="10"
            fill="rgba(16, 185, 129, 0.2)"
            stroke="#10b981"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
};
