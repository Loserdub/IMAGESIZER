/**
 * Client-Side Subject Segmentation Service
 * Supports MediaPipe Vision Tasks with an automated Edge/Saliency fallback
 * ImageSizer - Smart Background Guard
 */

export interface SegmentationResult {
  maskCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  source: 'ai' | 'heuristic';
}

// Feather / Blur helper for soft, natural transitions
function blurMaskCanvas(canvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius <= 0) return canvas;
  const blurred = document.createElement('canvas');
  blurred.width = canvas.width;
  blurred.height = canvas.height;
  const ctx = blurred.getContext('2d')!;

  ctx.filter = `blur(${Math.max(1, radius)}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';

  return blurred;
}

/**
 * High-performance edge & saliency fallback segmenter
 * Used if offline or if CDN model is unavailable
 */
function createHeuristicSubjectMask(img: HTMLImageElement | ImageBitmap | HTMLCanvasElement): SegmentationResult {
  const width = img.width;
  const height = img.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  const maskImgData = maskCtx.createImageData(width, height);
  const mData = maskImgData.data;

  // Compute background reference from the 4 image corners (average background color)
  let bgR = 0, bgG = 0, bgB = 0;
  const sampleCorner = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  const corners = [
    sampleCorner(10, 10),
    sampleCorner(Math.max(0, width - 11), 10),
    sampleCorner(10, Math.max(0, height - 11)),
    sampleCorner(Math.max(0, width - 11), Math.max(0, height - 11))
  ];

  for (const c of corners) {
    bgR += c[0] / 4;
    bgG += c[1] / 4;
    bgB += c[2] / 4;
  }

  // Center prior: fitness & bicep photos have subject centered in the frame
  const cx = width / 2;
  const cy = height * 0.52;
  const maxDist = Math.hypot(width * 0.5, height * 0.5);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Color distance from corner background
      const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
      const normColorDiff = Math.min(1.0, colorDist / 70.0);

      // Radial center weighting (subject is closer to center than perimeter)
      const distFromCenter = Math.hypot(x - cx, y - cy);
      const centerFactor = 1.0 - Math.min(1.0, (distFromCenter / maxDist) * 1.3);

      // Combined subject probability
      let subjectProb = normColorDiff * 0.65 + centerFactor * 0.35;

      // Skin tone boost (YCbCr / HSV warmth)
      if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) >= 15) {
        subjectProb = Math.min(1.0, subjectProb + 0.35);
      }

      // Hard clamp and smoothstep
      const finalAlpha = Math.max(0, Math.min(255, Math.round(subjectProb * 255)));

      mData[idx] = finalAlpha;     // R
      mData[idx + 1] = finalAlpha; // G
      mData[idx + 2] = finalAlpha; // B
      mData[idx + 3] = 255;        // A
    }
  }

  maskCtx.putImageData(maskImgData, 0, 0);
  const smoothed = blurMaskCanvas(maskCanvas, 5);

  return {
    maskCanvas: smoothed,
    width,
    height,
    source: 'heuristic'
  };
}

let segmenterInstance: any = null;
let isInitializingMediaPipe = false;

/**
 * Initialize or reuse MediaPipe Tasks Vision ImageSegmenter
 */
async function getMediaPipeSegmenter(): Promise<any> {
  if (segmenterInstance) return segmenterInstance;
  if (isInitializingMediaPipe) {
    // Wait for in-flight init
    while (isInitializingMediaPipe) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (segmenterInstance) return segmenterInstance;
  }

  isInitializingMediaPipe = true;
  try {
    // Dynamically load Tasks Vision from CDN with 4s timeout
    const visionModule = await Promise.race([
      import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/tasks-vision.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MediaPipe CDN timeout')), 4000))
    ]) as any;

    const { FilesetResolver, ImageSegmenter } = visionModule;

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false
    });

    isInitializingMediaPipe = false;
    return segmenterInstance;
  } catch (err) {
    console.warn('[SegmentationService] MediaPipe load skipped, using heuristic engine:', err);
    isInitializingMediaPipe = false;
    return null;
  }
}

/**
 * Automatically segment subject body from background
 */
export async function segmentSubject(
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  featherRadius = 4
): Promise<SegmentationResult> {
  try {
    const segmenter = await getMediaPipeSegmenter();
    if (segmenter) {
      const result = segmenter.segment(image);
      const categoryMask = result.categoryMask;

      if (categoryMask) {
        const maskWidth = categoryMask.width;
        const maskHeight = categoryMask.height;
        const maskData = categoryMask.getAsUint8Array();

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskWidth;
        maskCanvas.height = maskHeight;
        const ctx = maskCanvas.getContext('2d')!;
        const imgData = ctx.createImageData(maskWidth, maskHeight);
        const data = imgData.data;

        for (let i = 0; i < maskData.length; i++) {
          const val = maskData[i] > 0 ? 255 : 0;
          const idx = i * 4;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);

        // Scale mask to source image dimensions if needed
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = image.width;
        finalCanvas.height = image.height;
        const finalCtx = finalCanvas.getContext('2d')!;
        finalCtx.drawImage(maskCanvas, 0, 0, image.width, image.height);

        const feathered = blurMaskCanvas(finalCanvas, featherRadius);

        return {
          maskCanvas: feathered,
          width: image.width,
          height: image.height,
          source: 'ai'
        };
      }
    }
  } catch (err) {
    console.warn('[SegmentationService] AI segmentation error, falling back to heuristic:', err);
  }

  // Fallback heuristic segmentation
  const res = createHeuristicSubjectMask(image);
  return {
    ...res,
    maskCanvas: blurMaskCanvas(res.maskCanvas, featherRadius)
  };
}
