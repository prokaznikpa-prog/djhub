import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { X } from "lucide-react";
import { toast } from "sonner";
import { getCroppedImg } from "@/utils/cropImage";

interface PhotoCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onSave: (croppedImage: string) => void;
}

const PhotoCropModal = ({ imageSrc, onCancel, onSave }: PhotoCropModalProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || saving) return;

    try {
      setSaving(true);
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      onSave(croppedImage);
    } catch (error) {
      console.error(error);
      toast.error("Не удалось обрезать фото");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
      <div className="premium-surface w-full max-w-xl overflow-hidden p-0 shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Позиция фото</h2>
            <p className="text-xs text-muted-foreground">Перетащите фото и настройте масштаб</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-background/45 p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative h-[320px] bg-black sm:h-[380px]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            minZoom={1}
            maxZoom={3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="space-y-4 border-t border-white/10 bg-[#171a20] px-4 py-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-muted-foreground">Масштаб</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-glow rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoCropModal;
