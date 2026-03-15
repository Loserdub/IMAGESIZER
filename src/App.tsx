import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Undo, Redo, Download, Upload, Image as ImageIcon, Move, Maximize, Minimize, ArrowUpDown, ArrowLeftRight, Lasso, PanelLeftClose, PanelLeftOpen, Hand, ZoomIn, ZoomOut, Plus, Minus, Droplet } from 'lucide-react';

type ToolMode = 'push' | 'expand' | 'pinch' | 'stretch-v' | 'stretch-h' | 'lasso' | 'pan' | 'blend';

function renderFullImage(uMap: Float32Array, originalData: ImageData, currentData: ImageData) {
  const width = originalData.width;
  const height = originalData.height;
  const src = originalData.data;
  const dst = currentData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 2;
      const origX = uMap[idx];
      const origY = uMap[idx + 1];
      
      const x0 = Math.floor(origX);
      const x1 = x0 + 1;
      const y0 = Math.floor(origY);
      const y1 = y0 + 1;
      
      const wx1 = origX - x0;
      const wx0 = 1 - wx1;
      const wy1 = origY - y0;
      const wy0 = 1 - wy1;
      
      const safeX0 = Math.max(0, Math.min(width - 1, x0));
      const safeX1 = Math.max(0, Math.min(width - 1, x1));
      const safeY0 = Math.max(0, Math.min(height - 1, y0));
      const safeY1 = Math.max(0, Math.min(height - 1, y1));
      
      const idx00 = (safeY0 * width + safeX0) * 4;
      const idx10 = (safeY0 * width + safeX1) * 4;
      const idx01 = (safeY1 * width + safeX0) * 4;
      const idx11 = (safeY1 * width + safeX1) * 4;
      
      const dstIdx = (y * width + x) * 4;
      
      for (let c = 0; c < 4; c++) {
        const val00 = src[idx00 + c];
        const val10 = src[idx10 + c];
        const val01 = src[idx01 + c];
        const val11 = src[idx11 + c];
        
        const val0 = val00 * wx0 + val10 * wx1;
        const val1 = val01 * wx0 + val11 * wx1;
        dst[dstIdx + c] = val0 * wy0 + val1 * wy1;
      }
    }
  }
}

function applyWarp(
  uMap: Float32Array,
  tempUMap: Float32Array,
  originalData: ImageData,
  currentData: ImageData,
  centerX: number,
  centerY: number,
  moveX: number,
  moveY: number,
  radius: number,
  strength: number,
  mode: ToolMode
) {
  const width = originalData.width;
  const height = originalData.height;
  const r2 = radius * radius;
  
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  
  for (let y = minY; y <= maxY; y++) {
    const rowStart = (y * width + minX) * 2;
    const rowEnd = (y * width + maxX + 1) * 2;
    tempUMap.set(uMap.subarray(rowStart, rowEnd), rowStart);
  }
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist2 = dx * dx + dy * dy;
      
      if (dist2 < r2) {
        const falloff = Math.pow(1 - dist2 / r2, 2);
        
        if (mode === 'blend') {
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          const blurRadius = 2;
          for (let by = -blurRadius; by <= blurRadius; by++) {
            for (let bx = -blurRadius; bx <= blurRadius; bx++) {
              const sx = Math.max(0, Math.min(width - 1, x + bx));
              const sy = Math.max(0, Math.min(height - 1, y + by));
              const sIdx = (sy * width + sx) * 2;
              sumX += uMap[sIdx];
              sumY += uMap[sIdx + 1];
              count++;
            }
          }
          const avgX = sumX / count;
          const avgY = sumY / count;
          
          const currentIdx = (y * width + x) * 2;
          const currentOrigX = uMap[currentIdx];
          const currentOrigY = uMap[currentIdx + 1];
          
          const blendAmount = falloff * strength * 0.5;
          
          const origX = currentOrigX + (avgX - currentOrigX) * blendAmount;
          const origY = currentOrigY + (avgY - currentOrigY) * blendAmount;
          
          const dstIdx = (y * width + x) * 2;
          tempUMap[dstIdx] = origX;
          tempUMap[dstIdx + 1] = origY;
          continue;
        }
        
        let srcX = x;
        let srcY = y;
        
        if (mode === 'push') {
          srcX = x - moveX * falloff * strength;
          srcY = y - moveY * falloff * strength;
        } else if (mode === 'expand') {
          srcX = x - dx * falloff * strength * 0.05;
          srcY = y - dy * falloff * strength * 0.05;
        } else if (mode === 'pinch') {
          srcX = x + dx * falloff * strength * 0.05;
          srcY = y + dy * falloff * strength * 0.05;
        } else if (mode === 'stretch-v') {
          srcX = x;
          srcY = y - dy * falloff * strength * 0.05;
        } else if (mode === 'stretch-h') {
          srcX = x - dx * falloff * strength * 0.05;
          srcY = y;
        }
        
        const x0 = Math.floor(srcX);
        const x1 = x0 + 1;
        const y0 = Math.floor(srcY);
        const y1 = y0 + 1;
        
        const wx1 = srcX - x0;
        const wx0 = 1 - wx1;
        const wy1 = srcY - y0;
        const wy0 = 1 - wy1;
        
        const safeX0 = Math.max(0, Math.min(width - 1, x0));
        const safeX1 = Math.max(0, Math.min(width - 1, x1));
        const safeY0 = Math.max(0, Math.min(height - 1, y0));
        const safeY1 = Math.max(0, Math.min(height - 1, y1));
        
        const idx00 = (safeY0 * width + safeX0) * 2;
        const idx10 = (safeY0 * width + safeX1) * 2;
        const idx01 = (safeY1 * width + safeX0) * 2;
        const idx11 = (safeY1 * width + safeX1) * 2;
        
        const origX = 
          (uMap[idx00] * wx0 + uMap[idx10] * wx1) * wy0 +
          (uMap[idx01] * wx0 + uMap[idx11] * wx1) * wy1;
          
        const origY = 
          (uMap[idx00 + 1] * wx0 + uMap[idx10 + 1] * wx1) * wy0 +
          (uMap[idx01 + 1] * wx0 + uMap[idx11 + 1] * wx1) * wy1;
          
        const dstIdx = (y * width + x) * 2;
        tempUMap[dstIdx] = origX;
        tempUMap[dstIdx + 1] = origY;
      }
    }
  }
  
  const src = originalData.data;
  const dst = currentData.data;
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 2;
      const origX = tempUMap[idx];
      const origY = tempUMap[idx + 1];
      
      uMap[idx] = origX;
      uMap[idx + 1] = origY;
      
      const x0 = Math.floor(origX);
      const x1 = x0 + 1;
      const y0 = Math.floor(origY);
      const y1 = y0 + 1;
      
      const wx1 = origX - x0;
      const wx0 = 1 - wx1;
      const wy1 = origY - y0;
      const wy0 = 1 - wy1;
      
      const safeX0 = Math.max(0, Math.min(width - 1, x0));
      const safeX1 = Math.max(0, Math.min(width - 1, x1));
      const safeY0 = Math.max(0, Math.min(height - 1, y0));
      const safeY1 = Math.max(0, Math.min(height - 1, y1));
      
      const idx00 = (safeY0 * width + safeX0) * 4;
      const idx10 = (safeY0 * width + safeX1) * 4;
      const idx01 = (safeY1 * width + safeX0) * 4;
      const idx11 = (safeY1 * width + safeX1) * 4;
      
      const dstIdx = (y * width + x) * 4;
      
      for (let c = 0; c < 4; c++) {
        const val00 = src[idx00 + c];
        const val10 = src[idx10 + c];
        const val01 = src[idx01 + c];
        const val11 = src[idx11 + c];
        
        const val0 = val00 * wx0 + val10 * wx1;
        const val1 = val01 * wx0 + val11 * wx1;
        dst[dstIdx + c] = val0 * wy0 + val1 * wy1;
      }
    }
  }
}

function applyLassoScale(
  uMap: Float32Array,
  baseUMap: Float32Array,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  centroidX: number,
  centroidY: number,
  bbox: {minX: number, minY: number, maxX: number, maxY: number},
  scale: number
) {
  const { minX, minY, maxX, maxY } = bbox;
  
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const maskIdx = (y * width + x) * 4;
      const weight = mask[maskIdx] / 255;
      
      if (weight > 0) {
        const dx = x - centroidX;
        const dy = y - centroidY;
        
        const sampleX = centroidX + dx / scale;
        const sampleY = centroidY + dy / scale;
        
        const finalX = x + (sampleX - x) * weight;
        const finalY = y + (sampleY - y) * weight;
        
        const x0 = Math.floor(finalX);
        const x1 = x0 + 1;
        const y0 = Math.floor(finalY);
        const y1 = y0 + 1;
        
        const wx1 = finalX - x0;
        const wx0 = 1 - wx1;
        const wy1 = finalY - y0;
        const wy0 = 1 - wy1;
        
        const safeX0 = Math.max(0, Math.min(width - 1, x0));
        const safeX1 = Math.max(0, Math.min(width - 1, x1));
        const safeY0 = Math.max(0, Math.min(height - 1, y0));
        const safeY1 = Math.max(0, Math.min(height - 1, y1));
        
        const idx00 = (safeY0 * width + safeX0) * 2;
        const idx10 = (safeY0 * width + safeX1) * 2;
        const idx01 = (safeY1 * width + safeX0) * 2;
        const idx11 = (safeY1 * width + safeX1) * 2;
        
        const origX = 
          (baseUMap[idx00] * wx0 + baseUMap[idx10] * wx1) * wy0 +
          (baseUMap[idx01] * wx0 + baseUMap[idx11] * wx1) * wy1;
          
        const origY = 
          (baseUMap[idx00 + 1] * wx0 + baseUMap[idx10 + 1] * wx1) * wy0 +
          (baseUMap[idx01 + 1] * wx0 + baseUMap[idx11 + 1] * wx1) * wy1;
          
        const dstIdx = (y * width + x) * 2;
        uMap[dstIdx] = origX;
        uMap[dstIdx + 1] = origY;
      }
    }
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const [toolMode, setToolMode] = useState<ToolMode>('push');
  const [brushSize, setBrushSize] = useState(80);
  const [brushStrength, setBrushStrength] = useState(0.5);
  
  const [lassoPoints, setLassoPoints] = useState<{x: number, y: number}[]>([]);
  const [isLassoClosed, setIsLassoClosed] = useState(false);
  const [lassoScale, setLassoScale] = useState(1);
  const [lassoFeather, setLassoFeather] = useState(20);
  const [lassoInvert, setLassoInvert] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const lassoPointsRef = useRef<{x: number, y: number}[]>([]);
  const lassoBaseUMapRef = useRef<Float32Array | null>(null);
  const lassoMaskRef = useRef<Uint8ClampedArray | null>(null);
  const lassoCentroidRef = useRef<{x: number, y: number} | null>(null);
  const lassoBBoxRef = useRef<{minX: number, minY: number, maxX: number, maxY: number} | null>(null);
  const lastMaskSettingsRef = useRef({ feather: -1, invert: false });
  
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const toolModeRef = useRef<ToolMode>('push');
  const brushSizeRef = useRef(80);
  const brushStrengthRef = useRef(0.5);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  
  useEffect(() => { toolModeRef.current = toolMode; }, [toolMode]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushStrengthRef.current = brushStrength; }, [brushStrength]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  
  const undoStackRef = useRef<Float32Array[]>([]);
  const redoStackRef = useRef<Float32Array[]>([]);
  
  const originalDataRef = useRef<ImageData | null>(null);
  const currentDataRef = useRef<ImageData | null>(null);
  const uMapRef = useRef<Float32Array | null>(null);
  const tempUMapRef = useRef<Float32Array | null>(null);
  
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{x: number, y: number} | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const activePointersRef = useRef<Map<number, {x: number, y: number}>>(new Map());
  const initialPinchRef = useRef<{dist: number, center: {x: number, y: number}, zoom: number, pan: {x: number, y: number}} | null>(null);
  const lastPanPosRef = useRef<{x: number, y: number} | null>(null);
  
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  useEffect(() => {
    const main = document.getElementById('main-canvas-container');
    if (!main) return;
    
    const handleWheel = (e: WheelEvent) => {
      if (!imageLoaded) return;
      e.preventDefault();
      
      if (e.ctrlKey || e.metaKey) {
        const zoomDelta = -e.deltaY * 0.01;
        setZoom(z => Math.max(0.1, Math.min(10, z + (z * zoomDelta))));
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    
    main.addEventListener('wheel', handleWheel, { passive: false });
    return () => main.removeEventListener('wheel', handleWheel);
  }, [imageLoaded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventScroll = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
      }
    };
    canvas.addEventListener('touchmove', preventScroll, { passive: false });
    return () => canvas.removeEventListener('touchmove', preventScroll);
  }, [imageLoaded]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !currentDataRef.current) return;
    canvas.width = currentDataRef.current.width;
    canvas.height = currentDataRef.current.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (toolMode === 'lasso' && lassoPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (isLassoClosed) ctx.closePath();
      
      ctx.strokeStyle = 'white';
      const rect = canvas.getBoundingClientRect();
      ctx.lineWidth = rect.width > 0 ? 2 / (rect.width / canvas.width) : 2;
      if (!isLassoClosed) ctx.setLineDash([5, 5]);
      ctx.stroke();
      
      if (isLassoClosed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        if (lassoInvert) {
          ctx.rect(0, 0, canvas.width, canvas.height);
          ctx.fill('evenodd');
        } else {
          ctx.fill();
        }
      }
    }
  }, [lassoPoints, isLassoClosed, toolMode, lassoInvert]);

  useEffect(() => {
    if (toolMode === 'lasso' && isLassoClosed && lassoBaseUMapRef.current && uMapRef.current && originalDataRef.current && currentDataRef.current && lassoCentroidRef.current) {
      const width = currentDataRef.current.width;
      const height = currentDataRef.current.height;
      
      if (lastMaskSettingsRef.current.feather !== lassoFeather || lastMaskSettingsRef.current.invert !== lassoInvert || !lassoMaskRef.current) {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const mCtx = maskCanvas.getContext('2d')!;
        
        mCtx.fillStyle = lassoInvert ? 'white' : 'black';
        mCtx.fillRect(0, 0, width, height);
        mCtx.filter = `blur(${lassoFeather}px)`;
        mCtx.beginPath();
        if (lassoPointsRef.current.length > 0) {
          mCtx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);
          let minX = width, minY = height, maxX = 0, maxY = 0;
          for (const p of lassoPointsRef.current) {
            mCtx.lineTo(p.x, p.y);
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
          }
          mCtx.closePath();
          mCtx.fillStyle = lassoInvert ? 'black' : 'white';
          mCtx.fill();
          
          lassoMaskRef.current = mCtx.getImageData(0, 0, width, height).data;
          
          if (lassoInvert) {
            lassoBBoxRef.current = { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
          } else {
            const blurPad = lassoFeather * 2;
            lassoBBoxRef.current = {
              minX: Math.max(0, Math.floor(minX - blurPad)),
              minY: Math.max(0, Math.floor(minY - blurPad)),
              maxX: Math.min(width - 1, Math.ceil(maxX + blurPad)),
              maxY: Math.min(height - 1, Math.ceil(maxY + blurPad))
            };
          }
        }
        lastMaskSettingsRef.current = { feather: lassoFeather, invert: lassoInvert };
      }

      if (lassoMaskRef.current && lassoBBoxRef.current) {
        uMapRef.current.set(lassoBaseUMapRef.current);
        applyLassoScale(
          uMapRef.current,
          lassoBaseUMapRef.current,
          lassoMaskRef.current,
          width,
          height,
          lassoCentroidRef.current.x,
          lassoCentroidRef.current.y,
          lassoBBoxRef.current,
          lassoScale
        );
        renderFullImage(uMapRef.current, originalDataRef.current, currentDataRef.current);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.putImageData(currentDataRef.current, 0, 0);
      }
    }
  }, [lassoScale, lassoFeather, lassoInvert, isLassoClosed, toolMode]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        
        originalDataRef.current = imageData;
        currentDataRef.current = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
        
        const uMap = new Float32Array(width * height * 2);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 2;
            uMap[idx] = x;
            uMap[idx + 1] = y;
          }
        }
        uMapRef.current = uMap;
        tempUMapRef.current = new Float32Array(uMap);
        
        undoStackRef.current = [new Float32Array(uMap)];
        redoStackRef.current = [];
        
        setImageLoaded(true);
        forceUpdate();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const getMousePos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const applyContinuousWarp = () => {
    if (!isDraggingRef.current || !lastPosRef.current || !currentDataRef.current || !originalDataRef.current || !uMapRef.current || !tempUMapRef.current) return;
    if (toolModeRef.current === 'push') return;

    applyWarp(
      uMapRef.current,
      tempUMapRef.current,
      originalDataRef.current,
      currentDataRef.current,
      lastPosRef.current.x,
      lastPosRef.current.y,
      0,
      0,
      brushSizeRef.current,
      brushStrengthRef.current,
      toolModeRef.current
    );

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const minX = Math.max(0, Math.floor(lastPosRef.current.x - brushSizeRef.current));
      const minY = Math.max(0, Math.floor(lastPosRef.current.y - brushSizeRef.current));
      const maxX = Math.min(currentDataRef.current.width - 1, Math.ceil(lastPosRef.current.x + brushSizeRef.current));
      const maxY = Math.min(currentDataRef.current.height - 1, Math.ceil(lastPosRef.current.y + brushSizeRef.current));
      
      const safeMinX = Math.max(0, minX);
      const safeMinY = Math.max(0, minY);
      const safeMaxX = Math.min(currentDataRef.current.width - 1, maxX);
      const safeMaxY = Math.min(currentDataRef.current.height - 1, maxY);
      
      ctx.putImageData(
        currentDataRef.current, 
        0, 0, 
        safeMinX, safeMinY, 
        safeMaxX - safeMinX + 1, safeMaxY - safeMinY + 1
      );
    }

    animationFrameRef.current = requestAnimationFrame(applyContinuousWarp);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageLoaded) return;
    
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointersRef.current.size === 2) {
      const pointers = Array.from(activePointersRef.current.values()) as {x: number, y: number}[];
      const dist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      const center = {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2
      };
      initialPinchRef.current = { dist, center, zoom: zoomRef.current, pan: { ...panRef.current } };
      isDraggingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    if (activePointersRef.current.size > 2) return;

    if (toolModeRef.current === 'pan' || e.button === 1 || e.button === 2) {
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    if (e.button !== 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    isDraggingRef.current = true;
    lastPosRef.current = getMousePos(e);
    
    if (toolModeRef.current === 'lasso') {
      if (isLassoClosed) {
        setIsLassoClosed(false);
        setLassoScale(1);
        lassoPointsRef.current = [];
        setLassoPoints([]);
        if (uMapRef.current) {
          undoStackRef.current.push(new Float32Array(uMapRef.current));
          if (undoStackRef.current.length > 20) undoStackRef.current.shift();
          redoStackRef.current = [];
        }
      } else {
        lassoPointsRef.current = [getMousePos(e)];
        setLassoPoints([...lassoPointsRef.current]);
      }
      return;
    }
    
    if (toolModeRef.current !== 'push') {
      applyContinuousWarp();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
    
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    
    if (activePointersRef.current.size === 2 && initialPinchRef.current) {
      const pointers = Array.from(activePointersRef.current.values()) as {x: number, y: number}[];
      const dist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      const center = {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2
      };
      
      const scale = dist / initialPinchRef.current.dist;
      const newZoom = Math.max(0.1, Math.min(10, initialPinchRef.current.zoom * scale));
      
      const deltaX = center.x - initialPinchRef.current.center.x;
      const deltaY = center.y - initialPinchRef.current.center.y;
      
      setZoom(newZoom);
      setPan({
        x: initialPinchRef.current.pan.x + deltaX,
        y: initialPinchRef.current.pan.y + deltaY
      });
      return;
    }
    
    if (activePointersRef.current.size > 1) return;

    if (lastPanPosRef.current) {
      const dx = e.clientX - lastPanPosRef.current.x;
      const dy = e.clientY - lastPanPosRef.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    if (toolModeRef.current === 'lasso') {
      if (isDraggingRef.current && !isLassoClosed) {
        lassoPointsRef.current.push(getMousePos(e));
        setLassoPoints([...lassoPointsRef.current]);
      }
      return;
    }
    
    if (!isDraggingRef.current || !lastPosRef.current || !currentDataRef.current || !originalDataRef.current || !uMapRef.current || !tempUMapRef.current) return;
    
    const currentPos = getMousePos(e);
    
    if (toolModeRef.current === 'push') {
      const moveX = currentPos.x - lastPosRef.current.x;
      const moveY = currentPos.y - lastPosRef.current.y;
      
      if (Math.abs(moveX) < 0.1 && Math.abs(moveY) < 0.1) return;
      
      const distance = Math.sqrt(moveX * moveX + moveY * moveY);
      const steps = Math.max(1, Math.ceil(distance / (brushSizeRef.current / 4)));
      
      const stepX = moveX / steps;
      const stepY = moveY / steps;
      
      let minDirtyX = currentDataRef.current.width;
      let minDirtyY = currentDataRef.current.height;
      let maxDirtyX = 0;
      let maxDirtyY = 0;
      
      for (let i = 1; i <= steps; i++) {
        const stepCenterX = lastPosRef.current.x + stepX * i;
        const stepCenterY = lastPosRef.current.y + stepY * i;
        
        applyWarp(
          uMapRef.current,
          tempUMapRef.current,
          originalDataRef.current,
          currentDataRef.current,
          stepCenterX,
          stepCenterY,
          stepX,
          stepY,
          brushSizeRef.current,
          brushStrengthRef.current,
          'push'
        );
        
        minDirtyX = Math.min(minDirtyX, Math.floor(stepCenterX - brushSizeRef.current));
        minDirtyY = Math.min(minDirtyY, Math.floor(stepCenterY - brushSizeRef.current));
        maxDirtyX = Math.max(maxDirtyX, Math.ceil(stepCenterX + brushSizeRef.current));
        maxDirtyY = Math.max(maxDirtyY, Math.ceil(stepCenterY + brushSizeRef.current));
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const safeMinX = Math.max(0, minDirtyX);
        const safeMinY = Math.max(0, minDirtyY);
        const safeMaxX = Math.min(currentDataRef.current.width - 1, maxDirtyX);
        const safeMaxY = Math.min(currentDataRef.current.height - 1, maxDirtyY);
        
        ctx.putImageData(
          currentDataRef.current, 
          0, 0, 
          safeMinX, safeMinY, 
          safeMaxX - safeMinX + 1, safeMaxY - safeMinY + 1
        );
      }
    }
    
    lastPosRef.current = currentPos;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) initialPinchRef.current = null;
    if (activePointersRef.current.size === 0) lastPanPosRef.current = null;
    
    if (toolModeRef.current === 'lasso' && !isLassoClosed && isDraggingRef.current) {
      isDraggingRef.current = false;
      if (lassoPointsRef.current.length > 2) {
        setIsLassoClosed(true);
        setLassoScale(1);
        
        let sumX = 0, sumY = 0;
        for (const p of lassoPointsRef.current) {
          sumX += p.x; sumY += p.y;
        }
        lassoCentroidRef.current = { x: sumX / lassoPointsRef.current.length, y: sumY / lassoPointsRef.current.length };
        
        lassoBaseUMapRef.current = new Float32Array(uMapRef.current!);
        lastMaskSettingsRef.current = { feather: -1, invert: false };
      } else {
        lassoPointsRef.current = [];
        setLassoPoints([]);
      }
      return;
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      lastPosRef.current = null;
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (uMapRef.current) {
        undoStackRef.current.push(new Float32Array(uMapRef.current));
        if (undoStackRef.current.length > 20) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        forceUpdate();
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) initialPinchRef.current = null;
    if (activePointersRef.current.size === 0) lastPanPosRef.current = null;
    
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      lastPosRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  };

  const undo = () => {
    if (undoStackRef.current.length <= 1) return;
    
    const current = undoStackRef.current.pop()!;
    redoStackRef.current.push(current);
    
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    
    uMapRef.current = new Float32Array(previous);
    tempUMapRef.current = new Float32Array(previous);
    
    if (originalDataRef.current && currentDataRef.current) {
      renderFullImage(uMapRef.current, originalDataRef.current, currentDataRef.current);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.putImageData(currentDataRef.current, 0, 0);
    }
    
    forceUpdate();
  };

  const redo = () => {
    if (redoStackRef.current.length === 0) return;
    
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(next);
    
    uMapRef.current = new Float32Array(next);
    tempUMapRef.current = new Float32Array(next);
    
    if (originalDataRef.current && currentDataRef.current) {
      renderFullImage(uMapRef.current, originalDataRef.current, currentDataRef.current);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.putImageData(currentDataRef.current, 0, 0);
    }
    
    forceUpdate();
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = 'liquify-edit.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const getCssBrushSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return brushSize;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    return brushSize * scaleX * 2;
  };

  const tools = [
    { id: 'push', icon: Move, label: 'Push' },
    { id: 'expand', icon: Maximize, label: 'Expand' },
    { id: 'pinch', icon: Minimize, label: 'Pinch' },
    { id: 'stretch-v', icon: ArrowUpDown, label: 'Stretch Vertically' },
    { id: 'stretch-h', icon: ArrowLeftRight, label: 'Stretch Horizontally' },
    { id: 'blend', icon: Droplet, label: 'Blend Edges' },
    { id: 'lasso', icon: Lasso, label: 'Lasso Scale' },
    { id: 'pan', icon: Hand, label: 'Pan' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0a1a12] text-emerald-50 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-white/5 backdrop-blur-md z-30 relative shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-emerald-200/70 hover:text-emerald-50 hover:bg-white/10 rounded-xl transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/5"
            title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <a href="https://www.jray.me" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50 border border-emerald-300/30">
              <Sparkles className="w-5 h-5 text-emerald-50" />
            </div>
            <h1 className="font-semibold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-100 to-emerald-300">jray.me</h1>
          </a>
        </div>

        {/* Artsy Liquified Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center">
          <svg width="0" height="0" className="absolute">
            <filter id="liquify-title-filter">
              <feTurbulence type="fractalNoise" baseFrequency="0.015 0.03" numOctaves="2" result="noise">
                <animate attributeName="baseFrequency" values="0.015 0.03;0.025 0.04;0.015 0.03" dur="10s" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
          <h2 
            className="text-2xl md:text-3xl font-serif italic tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-100 to-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]" 
            style={{ 
              fontFamily: "'Playfair Display', 'Georgia', serif", 
              filter: 'url(#liquify-title-filter)' 
            }}
          >
            Liquify
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black/20 rounded-xl p-1 border border-white/5 shadow-inner">
            <button onClick={undo} disabled={undoStackRef.current.length <= 1} className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-emerald-200/70 hover:text-emerald-50">
              <Undo className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={redo} disabled={redoStackRef.current.length === 0} className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all text-emerald-200/70 hover:text-emerald-50">
              <Redo className="w-4 h-4" />
            </button>
          </div>
          <button onClick={download} disabled={!imageLoaded} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-emerald-900/50 disabled:to-emerald-900/50 disabled:text-emerald-500/50 rounded-xl text-sm font-semibold transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_10px_rgba(16,185,129,0.2)] border border-emerald-400/30 ml-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Background ambient glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/20 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-800/10 blur-[120px]" />
        </div>

        <aside 
          className={`flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden z-20 relative ${
            isSidebarOpen ? 'w-80' : 'w-0'
          }`}
        >
          <div className="w-80 p-6 flex flex-col gap-4 h-full overflow-y-auto hide-scrollbar">
            {!imageLoaded ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col items-center justify-center w-full h-40 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl cursor-pointer hover:bg-white/10 hover:border-emerald-500/50 transition-all shadow-xl shadow-black/20 group">
                  <div className="w-12 h-12 bg-black/30 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-inner border border-white/5">
                    <Upload className="w-6 h-6 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-emerald-200/70 group-hover:text-emerald-100">Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Bento Block: Tools */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-4 shadow-xl shadow-black/20">
                  <label className="text-xs font-bold tracking-wider text-emerald-500/70 uppercase mb-3 block px-1">Tools</label>
                  <div className="grid grid-cols-2 gap-2">
                    {tools.map((tool) => {
                      const Icon = tool.icon;
                      const isActive = toolMode === tool.id;
                      return (
                        <button
                          key={tool.id}
                          onClick={() => setToolMode(tool.id as ToolMode)}
                          title={tool.label}
                          className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all ${
                            isActive 
                              ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' 
                              : 'bg-black/20 border-white/5 text-emerald-200/50 hover:bg-white/5 hover:text-emerald-100 shadow-inner'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider">{tool.label.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bento Block: Brush Settings */}
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-5 shadow-xl shadow-black/20 flex flex-col gap-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold tracking-wider text-emerald-500/70 uppercase">Size</label>
                      <span className="text-xs font-mono font-medium text-emerald-200 bg-black/30 px-2 py-1 rounded-lg border border-white/5 shadow-inner">{brushSize}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="5" 
                      max="100" 
                      value={brushSize} 
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-2 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(52,211,153,0.5)] cursor-pointer"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold tracking-wider text-emerald-500/70 uppercase">Strength</label>
                      <span className="text-xs font-mono font-medium text-emerald-200 bg-black/30 px-2 py-1 rounded-lg border border-white/5 shadow-inner">{Math.round(brushStrength * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="1" 
                      step="0.05"
                      value={brushStrength} 
                      onChange={(e) => setBrushStrength(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-2 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(52,211,153,0.5)] cursor-pointer"
                    />
                  </div>
                </div>
                
                {toolMode === 'lasso' && isLassoClosed && (
                  <div className="bg-emerald-900/20 backdrop-blur-md border border-emerald-500/30 rounded-3xl p-5 shadow-xl shadow-emerald-900/20 flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-bold tracking-wider text-emerald-400 uppercase">Lasso Scale</label>
                        <span className="text-xs font-mono font-medium text-emerald-200 bg-black/30 px-2 py-1 rounded-lg border border-emerald-500/20 shadow-inner">{lassoScale.toFixed(2)}x</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.01"
                        value={lassoScale} 
                        onChange={(e) => setLassoScale(Number(e.target.value))}
                        className="w-full accent-emerald-400 h-2 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-bold tracking-wider text-emerald-400 uppercase">Feather</label>
                        <span className="text-xs font-mono font-medium text-emerald-200 bg-black/30 px-2 py-1 rounded-lg border border-emerald-500/20 shadow-inner">{lassoFeather}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="1"
                        value={lassoFeather} 
                        onChange={(e) => setLassoFeather(Number(e.target.value))}
                        className="w-full accent-emerald-400 h-2 bg-black/40 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                      />
                    </div>

                    <label className="flex items-center gap-3 mt-1 cursor-pointer px-1 group">
                      <div className="relative flex items-center justify-center w-5 h-5">
                        <input 
                          type="checkbox" 
                          checked={lassoInvert}
                          onChange={(e) => setLassoInvert(e.target.checked)}
                          className="peer appearance-none w-5 h-5 border border-emerald-500/50 rounded-md bg-black/30 checked:bg-emerald-500 checked:border-emerald-400 transition-all shadow-inner"
                        />
                        <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-sm font-medium text-emerald-200 group-hover:text-emerald-100 transition-colors">Invert Selection</span>
                    </label>

                    <button 
                      onClick={() => {
                        setIsLassoClosed(false);
                        setLassoPoints([]);
                        lassoPointsRef.current = [];
                        if (uMapRef.current) {
                          undoStackRef.current.push(new Float32Array(uMapRef.current));
                          if (undoStackRef.current.length > 20) undoStackRef.current.shift();
                          redoStackRef.current = [];
                        }
                      }}
                      className="w-full py-2.5 mt-2 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 rounded-xl text-sm font-semibold text-white transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_10px_rgba(16,185,129,0.2)] border border-emerald-400/30"
                    >
                      Apply & Clear
                    </button>
                  </div>
                )}
                
                {/* Bento Block: Actions */}
                <div className="mt-auto flex flex-col gap-2 pt-4">
                  <button 
                    onClick={() => {
                      if (undoStackRef.current.length > 0) {
                        const original = undoStackRef.current[0];
                        uMapRef.current = new Float32Array(original);
                        tempUMapRef.current = new Float32Array(original);
                        
                        if (originalDataRef.current && currentDataRef.current) {
                          renderFullImage(uMapRef.current, originalDataRef.current, currentDataRef.current);
                          const ctx = canvasRef.current?.getContext('2d');
                          if (ctx) ctx.putImageData(currentDataRef.current, 0, 0);
                        }
                        
                        undoStackRef.current = [original];
                        redoStackRef.current = [];
                        forceUpdate();
                      }
                    }}
                    className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-semibold text-emerald-200/80 hover:text-emerald-50 transition-all shadow-sm"
                  >
                    Reset Image
                  </button>
                  <label className="w-full px-4 py-3 bg-black/20 hover:bg-black/40 border border-white/5 rounded-2xl text-sm font-semibold text-emerald-200/80 hover:text-emerald-50 transition-all text-center cursor-pointer shadow-inner">
                    Upload New
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main 
          id="main-canvas-container"
          className="flex-1 relative bg-transparent flex items-center justify-center overflow-hidden p-8 z-10"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={(e) => {
            setCursorPos(null);
            handlePointerCancel(e);
          }}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Canvas container with glassmorphic frame if image loaded */}
          <div 
            className={`relative flex items-center justify-center ${!imageLoaded ? 'hidden' : ''}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              transition: activePointersRef.current.size >= 2 ? 'none' : 'transform 0.1s ease-out'
            }}
          >
            <div className="relative rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 bg-black/20 p-1 backdrop-blur-sm">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain cursor-crosshair rounded-md"
                style={{ touchAction: 'none' }}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] pointer-events-none object-contain rounded-md"
              />
            </div>
          </div>
          
          {cursorPos && !isDraggingRef.current && imageLoaded && toolMode !== 'lasso' && toolMode !== 'pan' && (
            <div 
              className="fixed pointer-events-none border border-emerald-400/50 rounded-full bg-emerald-400/10 mix-blend-screen z-50 shadow-[0_0_15px_rgba(52,211,153,0.3)] backdrop-blur-[1px]"
              style={{
                width: getCssBrushSize(),
                height: getCssBrushSize(),
                left: cursorPos.x,
                top: cursorPos.y,
                transform: 'translate(-50%, -50%)'
              }}
            />
          )}
          
          {!imageLoaded && (
            <div className="text-emerald-200/50 flex flex-col items-center gap-6 bg-white/5 backdrop-blur-md border border-white/10 p-12 rounded-3xl shadow-2xl">
              <div className="w-24 h-24 bg-black/20 rounded-full flex items-center justify-center shadow-inner border border-white/5">
                <ImageIcon className="w-10 h-10 text-emerald-500/50" />
              </div>
              <p className="text-base font-medium tracking-wide">Upload an image to start editing</p>
            </div>
          )}
          
          {imageLoaded && (
            <div 
              className="absolute bottom-8 right-8 flex items-center gap-1 bg-white/10 backdrop-blur-xl border border-white/10 p-2 rounded-2xl z-30 shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
              onPointerDown={e => e.stopPropagation()}
            >
              <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-2.5 hover:bg-white/10 rounded-xl text-emerald-200/70 hover:text-emerald-50 transition-all shadow-sm">
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-medium w-14 text-center text-emerald-100">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(10, z + 0.1))} className="p-2.5 hover:bg-white/10 rounded-xl text-emerald-200/70 hover:text-emerald-50 transition-all shadow-sm">
                <Plus className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }} className="p-2.5 hover:bg-white/10 rounded-xl text-emerald-200/70 hover:text-emerald-50 transition-all shadow-sm" title="Reset View">
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
