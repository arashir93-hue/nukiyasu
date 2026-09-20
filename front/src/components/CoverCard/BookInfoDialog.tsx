import dayjs from "../../lib/dayjs";
import {useEffect, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "react-toastify";
import {clearNihongoTrackerBookVolume, getNihongoTrackerBookStatus, setNihongoTrackerBookVolume} from "../../api/nihongoTracker";
import type {BookWithProgress} from "../../types/book";
import {Button} from "../../ui/Button";
import {Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "../../ui/Dialog";
import {Input} from "../../ui/Input";

interface BookInfoDialogProps {
  book: BookWithProgress;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookInfoDialog({book, open, onOpenChange}:BookInfoDialogProps):React.ReactElement {
  const queryClient = useQueryClient();
  const [volumeInput, setVolumeInput] = useState("");
  const [savingVolume, setSavingVolume] = useState(false);
  const {data:trackerStatus} = useQuery({
    queryKey:["nihongo-tracker-book-status", book._id],
    queryFn:()=>getNihongoTrackerBookStatus(book._id),
    enabled:open,
    retry:false,
    staleTime:60_000
  });

  useEffect(()=>{
    if (trackerStatus) setVolumeInput(String(trackerStatus.volumeNumber));
  }, [trackerStatus]);

  async function saveVolumeOverride():Promise<void> {
    const volume = Number(volumeInput);
    if (!Number.isFinite(volume) || volume <= 0) {
      toast.error("Introduce un número de volumen válido");
      return;
    }
    setSavingVolume(true);
    try {
      await setNihongoTrackerBookVolume(book._id, volume);
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status", book._id]});
      toast.success("Número de volumen guardado");
    } catch {
      toast.error("No se pudo guardar el número de volumen");
    } finally {
      setSavingVolume(false);
    }
  }

  async function clearVolumeOverride():Promise<void> {
    setSavingVolume(true);
    try {
      await clearNihongoTrackerBookVolume(book._id);
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status", book._id]});
      toast.success("Override de volumen eliminado");
    } catch {
      toast.error("No se pudo eliminar el override");
    } finally {
      setSavingVolume(false);
    }
  }
  const rows: Array<[string, string]> = [
    ["Nombre visible", book.visibleName],
    ["Nombre de ordenación", book.sortName],
    ["Ruta", book.path],
    ["Serie", book.seriePath],
    ["Páginas", String(book.pages)],
    ...(book.format === "images"
      ? []
      : [["Caracteres", String(book.characters ?? 0)] as [string, string]]),
    ["Variante", book.variant === "manga" ? "Manga" : book.variant === "doujinshi" ? "Doujinshi" : "Novela"],
    ["Formato", book.format === "images" ? "Imágenes (sin mokuro)" : "Mokuro"],
    ["Mokuro", book.mokured ? "Sí" : "No"],
    ["Añadido", book.createdDate ? dayjs(book.createdDate).format("DD/MM/YYYY HH:mm") : "—"],
    ["Modificado", book.lastModifiedDate ? dayjs(book.lastModifiedDate).format("DD/MM/YYYY HH:mm") : "—"],
    ["Existe?", book.missing ? "No" : "Sí"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Más información</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <dl className="flex flex-col gap-2 text-sm">
            {rows.map(([label, value])=>(
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-app-border/60 pb-2 last:border-0">
                <dt className="shrink-0 text-fg-muted">{label}</dt>
                <dd className="truncate text-right font-medium text-fg" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          {trackerStatus?.connected && trackerStatus.linked ? (
            <div className="mt-5 flex flex-col gap-2 border-t border-app-border/60 pt-4 text-sm">
              <p className="font-medium text-fg">NihongoTracker</p>
              <p className="text-xs text-fg-muted">
                {(() => {
                  const count = trackerStatus.logCount ?? (trackerStatus.alreadyLogged ? 1 : 0);
                  return `${count} ${count === 1 ? "lectura registrada" : "lecturas registradas"}`;
                })()}
              </p>
              <p className="text-xs text-fg-muted">Volumen resuelto: {trackerStatus.volumeNumber} ({trackerStatus.volumeSource === "position" ? "por posición" : trackerStatus.volumeSource === "manual" ? "manual" : "por nombre"})</p>
              <div className="flex items-center gap-2">
                <Input type="number" min="0.01" step="0.01" value={volumeInput} onChange={(event)=>setVolumeInput(event.target.value)} aria-label="Número de volumen de NihongoTracker" />
                <Button size="sm" onClick={()=>void saveVolumeOverride()} loading={savingVolume}>Guardar</Button>
                {trackerStatus.volumeSource === "manual" ? <Button size="sm" variant="ghost" onClick={()=>void clearVolumeOverride()} disabled={savingVolume}>Usar detección</Button> : null}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
