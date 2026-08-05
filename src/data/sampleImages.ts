import { SampleImage } from '../types/liquify';

/**
 * Generate high-resolution canvas sample image for Trust Node Logic
 */
const createTrustNodeLogicSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;

  // Deep dark modern studio background gradient
  const bgGrad = ctx.createRadialGradient(800, 500, 100, 800, 500, 1000);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#090d16');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1600, 1000);

  // Tech grid lines for warp visual feedback
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
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

  // Glowing center ambient halo
  const glowGrad = ctx.createRadialGradient(800, 500, 50, 800, 500, 450);
  glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
  glowGrad.addColorStop(0.6, 'rgba(139, 92, 246, 0.08)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, 1600, 1000);

  // Connected Node network background
  const nodes = [
    { x: 300, y: 250 }, { x: 500, y: 200 }, { x: 800, y: 180 }, { x: 1100, y: 200 }, { x: 1300, y: 250 },
    { x: 250, y: 500 }, { x: 1350, y: 500 },
    { x: 300, y: 750 }, { x: 500, y: 800 }, { x: 800, y: 820 }, { x: 1100, y: 800 }, { x: 1300, y: 750 }
  ];

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      if (Math.hypot(dx, dy) < 400) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#818cf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c084fc';
    ctx.stroke();
  }

  // Text alignment setup
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Subtitle / Tagline above
  ctx.font = '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('HPS-1.0 ATTESTATION ENGINE', 800, 400);

  // Text gradient for TRUST NODE LOGIC
  ctx.font = '900 92px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const textGrad = ctx.createLinearGradient(200, 0, 1400, 0);
  textGrad.addColorStop(0, '#ffffff');
  textGrad.addColorStop(0.3, '#e0e7ff');
  textGrad.addColorStop(0.7, '#818cf8');
  textGrad.addColorStop(1, '#c084fc');
  ctx.fillStyle = textGrad;

  // Subtle text glow & shadow
  ctx.shadowColor = 'rgba(99, 102, 241, 0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 4;
  ctx.fillText('TRUST NODE LOGIC', 800, 500);

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subtitle below
  ctx.font = '500 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('REAL-TIME WEBGL LIQUIFY & WARP DISTORTION ENGINE', 800, 580);

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
      id: 'trust-node-logic',
      name: 'Trust Node Logic',
      url: createTrustNodeLogicSample(),
      description: 'Official Trust Node Logic typography & node grid model.'
    },
    {
      id: 'calibration-grid',
      name: 'Calibration Grid & Circles',
      url: createGridSample(),
      description: 'Ideal for visualizing vector distortion dynamics and falloff precision.'
    }
  ];
};
