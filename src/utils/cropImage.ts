export type CroppedAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = url;
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(blob);
  });

export async function getCroppedImg(
  imageSrc: string,
  croppedAreaPixels: CroppedAreaPixels,
  options: { maxSize?: number; quality?: number } = {},
) {
  const image = await createImage(imageSrc);
  const maxSize = options.maxSize ?? 1024;
  const quality = options.quality ?? 0.86;
  const outputSize = Math.min(maxSize, Math.max(1, Math.round(croppedAreaPixels.width)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas is not supported");

  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Could not crop image"));
    }, "image/jpeg", quality);
  });

  return blobToDataUrl(blob);
}
