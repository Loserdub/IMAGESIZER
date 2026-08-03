import { SampleImage } from '../types/liquify';

// High-quality SVG data URIs for sample images (Fitness Bicep model, Portrait silhouette, Abstract grid)
// These allow immediate testing without requiring external network requests.

const createFitnessSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d')!;

  // Dark studio background
  const bgGrad = ctx.createRadialGradient(600, 800, 100, 600, 800, 1000);
  bgGrad.addColorStop(0, '#1e293b');
  bgGrad.addColorStop(0.6, '#0f172a');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 1600);

  // Soft rim lighting
  ctx.save();
  const rimGrad = ctx.createLinearGradient(0, 0, 1200, 0);
  rimGrad.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
  rimGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  rimGrad.addColorStop(1, 'rgba(168, 85, 247, 0.15)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, 1200, 1600);
  ctx.restore();

  // Torso / Arm Silhouette & Contour Model
  // Shoulder / Deltoid
  ctx.beginPath();
  ctx.fillStyle = '#e2e8f0';
  
  // Chest and arm silhouette
  ctx.moveTo(350, 1600);
  ctx.lineTo(350, 1100);
  // Waist curve
  ctx.bezierCurveTo(370, 950, 420, 850, 400, 700); // Waist to ribs
  ctx.bezierCurveTo(390, 600, 320, 500, 250, 450); // Lats to shoulder
  ctx.bezierCurveTo(230, 350, 280, 250, 400, 200); // Traps/neck
  ctx.bezierCurveTo(550, 160, 650, 160, 800, 200); // Neck to right shoulder
  // Right Arm (Bicep/Deltoid focus)
  ctx.bezierCurveTo(920, 240, 1050, 350, 1020, 520); // Delt bulge
  ctx.bezierCurveTo(1000, 620, 960, 720, 930, 820);  // Bicep / Tricep contour
  ctx.bezierCurveTo(900, 920, 880, 1050, 870, 1600); // Forearm down
  ctx.closePath();

  // Gradient fill for body model
  const bodyGrad = ctx.createLinearGradient(300, 200, 900, 1200);
  bodyGrad.addColorStop(0, '#f8fafc');
  bodyGrad.addColorStop(0.3, '#cbd5e1');
  bodyGrad.addColorStop(0.7, '#64748b');
  bodyGrad.addColorStop(1, '#334155');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Muscle definition shading
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineCap = 'round';

  // Bicep contour line
  ctx.beginPath();
  ctx.moveTo(850, 450);
  ctx.bezierCurveTo(920, 520, 910, 650, 840, 720);
  ctx.stroke();

  // Deltoid cap contour
  ctx.beginPath();
  ctx.moveTo(800, 220);
  ctx.bezierCurveTo(900, 300, 940, 400, 860, 460);
  ctx.stroke();

  // Abdominal grid lines for waist / core distortion testing
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.3)';
  for (let y = 650; y <= 1100; y += 120) {
    ctx.beginPath();
    ctx.moveTo(500, y);
    ctx.quadraticCurveTo(600, y + 25, 700, y);
    ctx.stroke();
  }

  // Vertical abs center line
  ctx.beginPath();
  ctx.moveTo(600, 550);
  ctx.lineTo(600, 1150);
  ctx.stroke();

  // Reference grid overlay background dots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  for (let x = 50; x < 1200; x += 100) {
    for (let y = 50; y < 1600; y += 100) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toDataURL('image/png');
};

const createGridSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1200, 1200);

  // Rainbow checkerboard & grid pattern
  const tileSize = 100;
  for (let x = 0; x < 1200; x += tileSize) {
    for (let y = 0; y < 1200; y += tileSize) {
      const isEven = (x / tileSize + y / tileSize) % 2 === 0;
      if (isEven) {
        const hue = (x + y) / 10;
        ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.75)`;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // Concentric calibration circles
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
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
      id: 'fitness-model',
      name: 'Fitness Contour Model',
      url: createFitnessSample(),
      description: 'Ideal for testing muscle expansion (biceps/delts) and waist slimming.'
    },
    {
      id: 'calibration-grid',
      name: 'Calibration Grid & Circles',
      url: createGridSample(),
      description: 'Ideal for visualizing vector distortion dynamics and falloff precision.'
    }
  ];
};
