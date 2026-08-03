import React from 'react';
import { 
  Sparkles, 
  Undo2, 
  Redo2, 
  Eye, 
  Grid, 
  Download, 
  Upload, 
  Image as ImageIcon,
  Sliders,
  RotateCcw
} from 'lucide-react';
import { SampleImage } from '../types/liquify';

interface HeaderProps {
  sampleImages: SampleImage[];
  onSelectSample: (sample: SampleImage) => void;
  onUploadImage: (file: File) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  isComparing: boolean;
  onCompareStart: () => void;
  onCompareEnd: () => void;
  showMesh: boolean;
  onToggleMesh: () => void;
  onOpenExport: () => void;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  sampleImages,
  onSelectSample,
  onUploadImage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  isComparing,
  onCompareStart,
  onCompareEnd,
  showMesh,
  onToggleMesh,
  onOpenExport,
  onToggleSidebar
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
    }
  };

  return (
    <header className="h-16 px-4 md:px-6 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-lg flex items-center justify-between z-30 shrink-0 select-none">
      {/* Left: Branding & Upload */}
      <div className="flex items-center gap-3 md:gap-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base md:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              ImageSizer <span className="text-indigo-400 font-medium text-xs md:text-sm">Liquify</span>
            </h1>
            <p className="hidden md:block text-[11px] text-slate-400 -mt-1">
              Real-time WebGL Warp & Distortion Engine
            </p>
          </div>
        </div>

        {/* Upload & Sample Selector */}
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-800">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload Image</span>
          </button>

          {/* Sample selector */}
          <select
            onChange={(e) => {
              const selected = sampleImages.find(s => s.id === e.target.value);
              if (selected) onSelectSample(selected);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60 focus:outline-none focus:border-indigo-500 cursor-pointer"
            defaultValue=""
          >
            <option value="" disabled>Load Demo Image...</option>
            {sampleImages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center: History & Hold to Compare */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 disabled:opacity-40 disabled:hover:bg-slate-800/60 transition-all cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo */}
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 disabled:opacity-40 disabled:hover:bg-slate-800/60 transition-all cursor-pointer"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          title="Reset to Original Image"
          className="p-2 rounded-xl text-slate-300 hover:text-rose-400 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="h-5 w-[1px] bg-slate-800 mx-1" />

        {/* Hold to Compare */}
        <button
          onMouseDown={onCompareStart}
          onMouseUp={onCompareEnd}
          onMouseLeave={onCompareEnd}
          onTouchStart={onCompareStart}
          onTouchEnd={onCompareEnd}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            isComparing
              ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
              : 'bg-slate-800/80 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
          }`}
          title="Hold Spacebar or mouse to compare with original image"
        >
          <Eye className="w-4 h-4" />
          <span className="hidden sm:inline">Hold Compare</span>
        </button>
      </div>

      {/* Right: Mesh Toggle, Export, Mobile Upload/Sidebar */}
      <div className="flex items-center gap-2">
        {/* Mesh Grid Overlay Toggle */}
        <button
          onClick={onToggleMesh}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            showMesh
              ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/80 shadow-md shadow-indigo-950/40'
              : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700 hover:text-slate-200'
          }`}
          title="Toggle Wireframe Mesh Grid Overlay"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden md:inline">Mesh Grid</span>
        </button>

        {/* High-Res Export */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>

        {/* Desktop Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 bg-slate-800/60 border border-slate-700/50 md:flex hidden"
          title="Settings Sidebar"
        >
          <Sliders className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
