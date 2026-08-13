"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { FileAudio, ImagePlus, Loader2, X } from "lucide-react";

export interface UploadedAsset { url: string; type: string; name: string; size: number; }
const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4";

export function AssetUploader({ value, onChange }: { value: UploadedAsset | null; onChange: (asset: UploadedAsset | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isUploading = progress > 0 && progress < 100;
  async function selectFile(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) return setError("Use a JPG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV, MP3, WAV, OGG, or M4A file.");
    if (file.size > MAX_BYTES) return setError("Files must be 500 MB or smaller.");
    setError(null); setProgress(1);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const blob = await upload(`nft-assets/${safeName}`, file, { access: "public", handleUploadUrl: "/api/uploads", multipart: file.size > 4 * 1024 * 1024, onUploadProgress: ({ percentage }) => setProgress(Math.max(1, Math.round(percentage))) });
      onChange({ url: blob.url, type: file.type, name: file.name, size: file.size }); setProgress(100);
    } catch (uploadError) { setProgress(0); setError(uploadError instanceof Error ? uploadError.message : "Upload failed. Check that Vercel Blob is connected."); }
  }
  if (value) return <div className="rounded-xl overflow-hidden border border-purple-500/40 bg-black/30"><div className="aspect-square max-h-80 grid place-items-center bg-black">{value.type.startsWith("video/") ? <video src={value.url} controls className="w-full h-full object-contain" /> : value.type.startsWith("audio/") ? <div className="w-full px-8"><FileAudio className="w-12 h-12 text-purple-300 mx-auto mb-5" /><audio src={value.url} controls className="w-full" /></div> : <img src={value.url} alt="NFT preview" className="w-full h-full object-contain" />}</div><div className="flex items-center justify-between gap-3 p-3 text-xs text-white/60"><span className="truncate">{value.name}</span><button type="button" onClick={() => { onChange(null); setProgress(0); }} className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button></div></div>;
  return <div><input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])} /><button type="button" onClick={() => input.current?.click()} disabled={isUploading} className="w-full min-h-56 rounded-xl border-2 border-dashed border-white/15 hover:border-purple-500/60 bg-white/[0.02] transition grid place-items-center p-6 text-center"><span>{isUploading ? <Loader2 className="w-8 h-8 text-purple-300 animate-spin mx-auto mb-3" /> : <ImagePlus className="w-8 h-8 text-purple-300 mx-auto mb-3" />}<span className="block text-sm font-semibold text-white">{isUploading ? `Uploading ${progress}%` : "Upload your NFT asset"}</span><span className="block text-xs text-white/45 mt-1">Image, GIF, video, or audio · up to 500 MB</span><span className="block text-[11px] text-white/30 mt-2">Stored securely in Durchex media storage</span></span></button>{error && <p className="text-xs text-danger mt-2">{error}</p>}{isUploading && <div className="h-1 bg-white/10 rounded-full mt-3 overflow-hidden"><div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} /></div>}</div>;
}
