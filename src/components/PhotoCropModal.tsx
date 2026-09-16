"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";

// Square drag/zoom viewport shown to the user, with a circular overlay as a
// guide for how it'll look once rendered small and round (e.g. Devices'
// assignee bubbles). The crop itself is a square - everywhere this photo
// gets displayed already renders it with rounded-full + object-cover, so a
// square crop centered the same way looks identical without needing a true
// circular (alpha-masked) output image.
const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 480;
const MAX_ZOOM_MULTIPLIER = 3;

export default function PhotoCropModal({
  file,
  onCancel,
  onSave,
  saving,
}: {
  file: File;
  onCancel: () => void;
  onSave: (croppedFile: File) => void;
  saving: boolean;
}) {
  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(imgUrl);
  }, [imgUrl]);

  function clampOffset(x: number, y: number, z: number, size: { width: number; height: number }) {
    const scaledW = size.width * z;
    const scaledH = size.height * z;
    const maxX = Math.max(0, (scaledW - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (scaledH - VIEWPORT_SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function handleImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const scale = Math.max(VIEWPORT_SIZE / size.width, VIEWPORT_SIZE / size.height);
    setImgSize(size);
    setMinZoom(scale);
    setZoom(scale);
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
    setIsDragging(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !imgSize) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffsetX + dx, dragRef.current.startOffsetY + dy, zoom, imgSize));
  }

  function handlePointerUp() {
    dragRef.current = null;
    setIsDragging(false);
  }

  function handleZoomChange(z: number) {
    if (!imgSize) return;
    setZoom(z);
    setOffset((prev) => clampOffset(prev.x, prev.y, z, imgSize));
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (!imgSize) return;
    e.preventDefault();
    const next = Math.min(minZoom * MAX_ZOOM_MULTIPLIER, Math.max(minZoom, zoom - e.deltaY * 0.001 * minZoom));
    handleZoomChange(next);
  }

  function handleSave() {
    if (!imgSize || !imgRef.current) return;
    const displayX = VIEWPORT_SIZE / 2 - (imgSize.width * zoom) / 2 + offset.x;
    const displayY = VIEWPORT_SIZE / 2 - (imgSize.height * zoom) / 2 + offset.y;
    const sx = -displayX / zoom;
    const sy = -displayY / zoom;
    const sSize = VIEWPORT_SIZE / zoom;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const baseName = file.name.replace(/\.[^./\\]+$/, "");
        onSave(new File([blob], `${baseName}-cropped.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 dark:bg-neutral-900">
        <div>
          <h2 className="text-lg font-bold">Position Photo</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            Drag to reposition, scroll or use the slider to zoom. The circle shows how it will look in the small
            round spots around the site.
          </p>
        </div>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          className="relative mx-auto touch-none overflow-hidden rounded-md bg-black/10 dark:bg-white/5"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, cursor: isDragging ? "grabbing" : "grab" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            onLoad={handleImgLoad}
            className="absolute select-none"
            style={
              imgSize
                ? {
                    width: imgSize.width * zoom,
                    height: imgSize.height * zoom,
                    left: VIEWPORT_SIZE / 2 - (imgSize.width * zoom) / 2 + offset.x,
                    top: VIEWPORT_SIZE / 2 - (imgSize.height * zoom) / 2 + offset.y,
                    opacity: 1,
                  }
                : { opacity: 0 }
            }
          />
          {/* Darkens everything outside the circle, within the square viewport - pointer-events-none so drag/wheel pass through to the container above. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
          />
        </div>

        {imgSize && (
          <input
            type="range"
            min={minZoom}
            max={minZoom * MAX_ZOOM_MULTIPLIER}
            step={(minZoom * (MAX_ZOOM_MULTIPLIER - 1)) / 100}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full"
          />
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !imgSize}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
