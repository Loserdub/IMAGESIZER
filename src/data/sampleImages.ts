import { SampleImage } from '../types/liquify';

/**
 * Generate clean blank canvas with subtle emerald grid and sleek typography
 */
const createBlankCanvasSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;

  // Deep dark neutral background
  const bgGrad = ctx.createRadialGradient(800, 500, 100, 800, 500, 1000);
  bgGrad.addColorStop(0, '#0a0f0a');
  bgGrad.addColorStop(0.6, '#050a05');
  bgGrad.addColorStop(1, '#020502');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1600, 1000);

  // Subtle emerald grid lines for visual warp feedback
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.06)';
  const gridSize = 50;
  for (let x = 0; x <= 1600; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1000);
    ctx.stroke();
  }
  for (let y = 0; y <= 1000; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1600, y);
    ctx.stroke();
  }

  // Clean centered typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Subtitle above
  ctx.font = '500 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#34d399';
  ctx.fillText('HPS-1.0 ATTESTATION ENGINE', 800, 420);

  // Main title
  ctx.font = '800 76px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const textGrad = ctx.createLinearGradient(350, 0, 1250, 0);
  textGrad.addColorStop(0, '#e5e5e5');
  textGrad.addColorStop(0.5, '#a7f3d0');
  textGrad.addColorStop(1, '#10b981');
  ctx.fillStyle = textGrad;

  ctx.shadowColor = 'rgba(16, 185, 129, 0.25)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 2;
  ctx.fillText('TRUST NODE LOGIC', 800, 500);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subtitle below
  ctx.font = '400 17px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#525252';
  ctx.fillText('WebGL Liquify & Image Distortion Engine', 800, 570);

  return canvas.toDataURL('image/png');
};

const createGridSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, 1200, 1200);

  // Emerald checkerboard
  const tileSize = 100;
  for (let x = 0; x < 1200; x += tileSize) {
    for (let y = 0; y < 1200; y += tileSize) {
      const isEven = (x / tileSize + y / tileSize) % 2 === 0;
      if (isEven) {
        const hue = 140 + ((x + y) / 24);
        ctx.fillStyle = `hsla(${hue}, 50%, 35%, 0.6)`;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // Concentric calibration circles
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
  for (let r = 100; r <= 500; r += 100) {
    ctx.beginPath();
    ctx.arc(600, 600, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas.toDataURL('image/png');
};

export const getSampleImages = (): SampleImage[] => {
  return [
    {
      id: 'blank-canvas',
      name: 'Blank Canvas',
      url: createBlankCanvasSample(),
      description: 'Clean dark studio canvas with grid lines for immediate warp sculpting.'
    },
    {
      id: 'calibration-grid',
      name: 'Calibration Grid',
      url: createGridSample(),
      description: 'Ideal for visualizing vector distortion dynamics and falloff precision.'
    }
  ];
};
