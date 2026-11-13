import type { EditorialSnapshot } from "./editorial-snapshot";

function eventOnce(target: HTMLMediaElement | HTMLImageElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Media took too long to load. Check the upload and try again.")), 15000);
    const success = () => finish();
    const failure = () => finish(new Error("Visual evidence could not be read. Use a completed Inspora upload."));
    function finish(error?: Error) {
      clearTimeout(timer); target.removeEventListener(event, success); target.removeEventListener("error", failure);
      if (error) reject(error); else resolve();
    }
    target.addEventListener(event, success, { once: true });
    target.addEventListener("error", failure, { once: true });
  });
}

function sample(source: HTMLImageElement | HTMLVideoElement, width: number, height: number) {
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image preparation is unavailable in this browser.");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
  canvas.width = 0; canvas.height = 0;
  if (dataUrl.length > 600000) throw new Error("A sample is too large. Try a smaller upload.");
  return dataUrl;
}

export async function prepareEditorialEvidence(snapshot: EditorialSnapshot) {
  const images: { dataUrl: string; frameSeconds: number | null }[] = [];
  const media = snapshot.media.filter(m => m.url && m.type !== "favicon" && m.type !== "full_page");
  for (const item of media.slice(0, 6)) {
    if (images.length >= 6) break;
    if (["recording", "video"].includes(item.type)) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous"; video.preload = "auto"; video.muted = true; video.playsInline = true;
      try {
        const loaded = eventOnce(video, "loadeddata"); video.src = item.url; video.load(); await loaded;
        if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("The recording is not ready for sampling.");
        for (const fraction of [0.1, 0.5, 0.85]) {
          if (images.length >= 6) break;
          const at = video.duration * fraction;
          const sought = eventOnce(video, "seeked"); video.currentTime = at; await sought;
          images.push({ dataUrl: sample(video, video.videoWidth, video.videoHeight), frameSeconds: Math.round(at * 1000) / 1000 });
        }
      } finally { video.pause(); video.removeAttribute("src"); video.load(); }
    } else {
      const image = new Image(); image.crossOrigin = "anonymous";
      const loaded = eventOnce(image, "load"); image.src = item.url; await loaded;
      images.push({ dataUrl: sample(image, image.naturalWidth, image.naturalHeight), frameSeconds: null });
    }
  }
  if (!images.length) throw new Error("Upload the work's images or recording first.");
  return images;
}
