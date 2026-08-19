"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2, X } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A single profile image (avatar, cover, or ID document).
 *
 * Uploads go through the same signed Blob route as NFT media but under a
 * profile-assets/ prefix, so profile art and artwork stay separable in
 * storage. Smaller cap than NFT media — nobody needs a 500 MB avatar.
 */
export function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  aspect = "square",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: "square" | "wide";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress > 0 && progress < 100;

  async function selectFile(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) {
      return setError("Use a JPG, PNG, WebP, GIF, or AVIF image.");
    }
    if (file.size > MAX_BYTES) return setError("Images must be 10 MB or smaller.");
    setError(null);
    setProgress(1);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const blob = await upload(`profile-assets/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/uploads",
        onUploadProgress: ({ percentage }) => setProgress(Math.max(1, Math.round(percentage))),
      });
      onChange(blob.url);
      setProgress(100);
    } catch (err) {
      setProgress(0);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div>
      <label className="text-xs font-medium text-white/50 mb-1.5 block">{label}</label>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])}
      />
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30">
          <img
            src={value}
            alt=""
            className={`w-full object-cover ${aspect === "wide" ? "h-32" : "h-40"}`}
          />
          <div className="flex items-center justify-between gap-3 p-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="text-xs text-white/50 hover:text-white transition"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-white/40 hover:text-danger transition"
              aria-label={`Remove ${label}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className={`w-full rounded-xl border-2 border-dashed border-white/15 hover:border-purple-500/60 bg-white/[0.02] transition grid place-items-center text-center p-5 ${
            aspect === "wide" ? "h-28" : "h-36"
          }`}
        >
          <span>
            {uploading ? (
              <Loader2 className="w-6 h-6 text-purple-300 animate-spin mx-auto mb-2" />
            ) : (
              <ImagePlus className="w-6 h-6 text-purple-300 mx-auto mb-2" />
            )}
            <span className="block text-xs font-medium text-white">
              {uploading ? `Uploading ${progress}%` : `Upload ${label.toLowerCase()}`}
            </span>
            {hint && <span className="block text-[11px] text-white/35 mt-0.5">{hint}</span>}
          </span>
        </button>
      )}
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
