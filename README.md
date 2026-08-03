# 🎨 ImageSizer Liquify & Distortion Engine

> High-performance WebGL Liquify, body contour sculpting, and image distortion web application.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-4f46e5?style=for-the-badge&logo=github)](https://loserdub.github.io/IMAGESIZER/)
[![TrustNodeLogic](https://img.shields.io/badge/Developed%20By-TrustNodeLogic-06b6d4?style=for-the-badge)](https://trustnodelogic.com)
[![Author](https://img.shields.io/badge/Creator-Justin%20Ray-8b5cf6?style=for-the-badge)](https://trustnodelogic.com)

---

## 👁️ Overview

**ImageSizer Liquify** is a dedicated, real-time WebGL image manipulation tool engineered for smooth, high-precision body contouring, muscle expanding/slimming, and visual warping on both desktop computers and mobile devices.

Powered by a hardware-accelerated **WebGL 2D Deformable Grid Mesh**, ImageSizer renders deformations at 60 FPS even on large 4K source images without memory lag or pixel artifacts.

Developed by **[Justin Ray](https://trustnodelogic.com)** (`jray` / `loserdub`) for **[TrustNodeLogic](https://trustnodelogic.com)**.

---

## 🚀 Core Features

### 1. WebGL Liquify Brush Engine
- 🖐️ **Push / Drag Tool (Primary)**: Smoothly shifts target pixels in the direction of the swipe/drag stroke (ideal for pulling muscle contours, lats, and waistlines).
- 🏋️ **Swell / Bloat Tool**: Expands pixels radially outward from the center of the brush (ideal for expanding biceps, deltoids, and glutes).
- 🤏 **Pinch / Shrink Tool**: Pulls pixels radially inward toward the brush center (ideal for slimming waistlines and smoothing contours).
- ✨ **Reconstruct / Eraser Tool**: Paints back over modified areas to restore the original un-distorted image coordinates.
- ⭕ **Smooth Radial Falloff**: Cosine/cubic polynomial falloff feathering prevents blocky or jagged edge artifacts.

### 2. Mobile Ergonomics & Precision Touch
- 🎯 **Touch Offset Reticle**: Adjustable focal offset (30–50px above finger contact point) so the user's thumb never covers the editing region in real time.
- 🤏 **Two-Finger Pan & Pinch-Zoom**: Native multi-touch 2-finger gestures reserve single-finger swipes for warping while letting users zoom (0.2x to 6x) and pan seamlessly.
- 📱 **Sticky Bottom Thumb-Zone Bar**: Anchors key brush controls, size/strength sliders, tool selectors, and offset toggles within easy thumb reach.
- ⭕ **Visual Brush Cursor**: Translucent circular guide displaying active radius, pressure falloff core ring, and central crosshair target.

### 3. Precision Visualization & Workflow
- 🌐 **Wireframe Mesh Grid Overlay**: Render a visual wireframe grid (`gl.LINES`) over the image to visualize vector warp fields.
- ↩️ **Multi-Level Undo / Redo**: Lightweight `Float32Array` UV history stack (up to 40 steps, supporting `Ctrl+Z` / `Ctrl+Y` and UI touch buttons).
- 👁️ **Hold-to-Compare**: Hold spacebar or the UI compare button to temporarily view the original un-edited image.
- 💾 **High-Resolution Export**: Offscreen WebGL rendering exports output images at their full native source pixel resolution (PNG, JPEG, WebP).

### 4. SEO & JSON-LD `@graph` Schema
- Connected Schema.org JSON-LD `@graph` linking:
  - `WebApplication` schema with **Free Offer ($0.00 USD)** and **AggregateRating (4.9/5.0)**.
  - Creator: **[Justin Ray](https://trustnodelogic.com)** (`jray` / `loserdub`).
  - Publisher: **[TrustNodeLogic](https://trustnodelogic.com)**.

---

## 🛠️ Technical Stack

- **Core**: React 19, TypeScript
- **Graphics Engine**: Custom WebGL 2D Deformable Grid Mesh (`WebGLRenderingContext` / `WebGL2RenderingContext`)
- **Styling**: Tailwind CSS v4, Glassmorphic Dark UI System
- **Icons**: Lucide React
- **Build System**: Vite 6

---

## 📥 Local Development Setup

```bash
# Clone the repository
git clone https://github.com/loserdub/IMAGESIZER.git

# Navigate to directory
cd IMAGESIZER

# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build
```

---

## 🔗 Links & Ecosystem

- **Live Application**: [https://loserdub.github.io/IMAGESIZER/](https://loserdub.github.io/IMAGESIZER/)
- **Official Hub**: [TrustNodeLogic](https://trustnodelogic.com)
- **Developer**: [Justin Ray](https://trustnodelogic.com) (`jray` / `loserdub`)
- **GitHub Repository**: [loserdub/IMAGESIZER](https://github.com/loserdub/IMAGESIZER)

---

## ⚖️ License

© 2026 **Justin Ray** / **TrustNodeLogic**. Released under the [MIT License](LICENSE).
