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

const createPortraitSample = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1400;
  const ctx = canvas.getContext('2d')!;

  // Studio portrait background
  const bgGrad = ctx.createRadialGradient(600, 550, 80, 600, 700, 900);
  bgGrad.addColorStop(0, '#222831');
  bgGrad.addColorStop(0.5, '#15191f');
  bgGrad.addColorStop(1, '#0b0d10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 1400);

  // Hair & Silhouette base
  ctx.save();
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(600, 620, 360, 480, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck & Shoulders
  ctx.fillStyle = '#c89578';
  ctx.beginPath();
  ctx.moveTo(480, 900);
  ctx.quadraticCurveTo(350, 1100, 200, 1350);
  ctx.lineTo(1000, 1350);
  ctx.quadraticCurveTo(850, 1100, 720, 900);
  ctx.closePath();
  ctx.fill();

  // Face oval
  const skinGrad = ctx.createRadialGradient(580, 560, 50, 600, 650, 350);
  skinGrad.addColorStop(0, '#f2ceb8');
  skinGrad.addColorStop(0.4, '#e4b69b');
  skinGrad.addColorStop(0.8, '#cb9678');
  skinGrad.addColorStop(1, '#a67253');
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.ellipse(600, 640, 270, 370, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheek warm blush
  const blushLeft = ctx.createRadialGradient(440, 720, 10, 440, 720, 120);
  blushLeft.addColorStop(0, 'rgba(215, 105, 95, 0.28)');
  blushLeft.addColorStop(1, 'rgba(215, 105, 95, 0)');
  ctx.fillStyle = blushLeft;
  ctx.beginPath();
  ctx.arc(440, 720, 120, 0, Math.PI * 2);
  ctx.fill();

  const blushRight = ctx.createRadialGradient(760, 720, 10, 760, 720, 120);
  blushRight.addColorStop(0, 'rgba(215, 105, 95, 0.28)');
  blushRight.addColorStop(1, 'rgba(215, 105, 95, 0)');
  ctx.fillStyle = blushRight;
  ctx.beginPath();
  ctx.arc(760, 720, 120, 0, Math.PI * 2);
  ctx.fill();

  // Forehead highlight
  const foreHighlight = ctx.createRadialGradient(600, 440, 10, 600, 440, 140);
  foreHighlight.addColorStop(0, 'rgba(255, 245, 235, 0.35)');
  foreHighlight.addColorStop(1, 'rgba(255, 245, 235, 0)');
  ctx.fillStyle = foreHighlight;
  ctx.beginPath();
  ctx.arc(600, 440, 140, 0, Math.PI * 2);
  ctx.fill();

  // --- Natural Skin Wrinkles (Targeted for Smoothing test) ---
  const drawWrinkle = (x1: number, y1: number, cpX: number, cpY: number, x2: number, y2: number, width: number, opacity: number) => {
    // Subtle shadow crease
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cpX, cpY, x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(100, 60, 40, ${opacity})`;
    ctx.stroke();

    // Subtle highlight rim directly below crease
    ctx.beginPath();
    ctx.moveTo(x1, y1 + width * 0.8);
    ctx.quadraticCurveTo(cpX, cpY + width * 0.8, x2, y2 + width * 0.8);
    ctx.lineWidth = width * 0.8;
    ctx.strokeStyle = `rgba(255, 240, 230, ${opacity * 0.6})`;
    ctx.stroke();
  };

  // Forehead expression lines
  drawWrinkle(430, 410, 600, 395, 770, 412, 2.5, 0.45);
  drawWrinkle(410, 440, 600, 424, 790, 442, 3.0, 0.55);
  drawWrinkle(435, 472, 600, 458, 765, 474, 2.8, 0.50);
  drawWrinkle(470, 505, 600, 495, 730, 506, 2.0, 0.40);

  // Frown lines between brows
  drawWrinkle(585, 530, 583, 560, 584, 580, 2.2, 0.50);
  drawWrinkle(615, 530, 617, 560, 616, 580, 2.2, 0.50);

  // Crow's feet (Eye outer wrinkles)
  drawWrinkle(350, 610, 385, 620, 420, 630, 2.0, 0.48);
  drawWrinkle(340, 635, 380, 635, 420, 636, 2.2, 0.52);
  drawWrinkle(355, 660, 385, 650, 420, 642, 2.0, 0.48);

  drawWrinkle(780, 630, 815, 620, 850, 610, 2.0, 0.48);
  drawWrinkle(780, 636, 820, 635, 860, 635, 2.2, 0.52);
  drawWrinkle(780, 642, 815, 650, 845, 660, 2.0, 0.48);

  // Laugh lines (Nasolabial folds)
  drawWrinkle(525, 740, 510, 790, 515, 850, 2.8, 0.45);
  drawWrinkle(675, 740, 690, 790, 685, 850, 2.8, 0.45);

  // Neck creases
  drawWrinkle(470, 1010, 600, 1030, 730, 1012, 3.2, 0.45);
  drawWrinkle(450, 1060, 600, 1085, 750, 1062, 3.0, 0.40);

  // Eyebrows
  ctx.strokeStyle = '#2d1f19';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(430, 570);
  ctx.quadraticCurveTo(490, 545, 555, 565);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(645, 565);
  ctx.quadraticCurveTo(710, 545, 770, 570);
  ctx.stroke();

  // Eyes
  const drawEye = (cx: number, cy: number) => {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 46, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.stroke();

    const irisGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 22);
    irisGrad.addColorStop(0, '#10b981');
    irisGrad.addColorStop(0.6, '#047857');
    irisGrad.addColorStop(1, '#064e3b');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 6, cy - 6, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 46, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  };

  drawEye(485, 625);
  drawEye(715, 625);

  // Nose
  ctx.strokeStyle = 'rgba(120, 75, 55, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(590, 625);
  ctx.lineTo(585, 730);
  ctx.quadraticCurveTo(600, 750, 615, 730);
  ctx.stroke();

  ctx.fillStyle = 'rgba(90, 50, 35, 0.6)';
  ctx.beginPath();
  ctx.ellipse(575, 738, 8, 4, -0.3, 0, Math.PI * 2);
  ctx.ellipse(625, 738, 8, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Lips
  const lipGrad = ctx.createRadialGradient(600, 835, 5, 600, 835, 80);
  lipGrad.addColorStop(0, '#c75a68');
  lipGrad.addColorStop(0.7, '#b24454');
  lipGrad.addColorStop(1, '#8f2f3d');
  ctx.fillStyle = lipGrad;
  ctx.beginPath();
  ctx.moveTo(530, 830);
  ctx.quadraticCurveTo(570, 812, 600, 822);
  ctx.quadraticCurveTo(630, 812, 670, 830);
  ctx.quadraticCurveTo(600, 838, 530, 830);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(535, 830);
  ctx.quadraticCurveTo(600, 875, 665, 830);
  ctx.quadraticCurveTo(600, 838, 535, 830);
  ctx.fill();

  // Subtle skin pores / micro-texture
  const imgData = ctx.getImageData(350, 380, 500, 550);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 100) {
      const noise = (Math.random() - 0.5) * 6;
      data[i]     = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i] + noise));
    }
  }
  ctx.putImageData(imgData, 350, 380);

  // Overlay Header Banner
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.fillText('PORTRAIT RETOUCH & SKIN SMOOTHING LAB', 600, 60);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('Select Smooth [4] to soften forehead lines, crow\'s feet & neck wrinkles', 600, 85);

  return canvas.toDataURL('image/png');
};

export const getSampleImages = (): SampleImage[] => {
  return [
    {
      id: 'portrait-retouch',
      name: 'Portrait & Wrinkle Retouch Demo',
      url: createPortraitSample(),
      description: 'Face portrait with forehead expression lines, crow\'s feet, and skin texture for testing the Smooth ability.'
    },
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
