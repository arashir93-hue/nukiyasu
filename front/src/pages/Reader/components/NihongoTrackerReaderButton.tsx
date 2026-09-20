import {Check, ListChecks} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {toast} from "react-toastify";
import {
  getNihongoTrackerBookStatus,
  logBookInNihongoTracker,
  setNihongoTrackerBookVolume
} from "../../../api/nihongoTracker";
import type {NihongoTrackerBookStatus} from "../../../types/nihongoTracker";
import type {Book} from "../../../types/book";
import {useReaderTimerStore} from "../../../stores/ReaderStore";
import {Button} from "../../../ui/Button";
import {Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "../../../ui/Dialog";
import {Input} from "../../../ui/Input";
import {ReaderNavButton} from "./ReaderChrome";

interface NihongoTrackerReaderButtonProps {
  book:Book;
  currentPage:number;
  atLastPage?:boolean;
  saveProgress:(keepAlive?:boolean)=>Promise<void>;
}

function formatReadingTime(seconds:number):string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function NihongoTrackerReaderButton({book, currentPage, atLastPage, saveProgress}:NihongoTrackerReaderButtonProps):React.ReactElement | null {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [volumeInput, setVolumeInput] = useState("");
  const registering = useRef(false);
  const currentReadingSeconds = useReaderTimerStore((state)=>state.timer);
  const {data:status, refetch} = useQuery({
    queryKey:["nihongo-tracker-book-status", book._id],
    queryFn:()=>getNihongoTrackerBookStatus(book._id),
    staleTime:60_000,
    retry:false,
    enabled:!!book._id
  });

  useEffect(()=>{
    if (open && status) setVolumeInput(String(status.volumeNumber));
  }, [open, status]);

  if (!(atLastPage ?? currentPage >= book.pages) || !status?.connected || !status.linked) return null;

  const logCount = status.logCount ?? (status.alreadyLogged ? 1 : 0);
  const alreadyLogged = logCount > 0 || status.hasPreviousLogs === true;

  async function register():Promise<void> {
    if (registering.current) return;
    const volume = Number(volumeInput);
    if (!Number.isFinite(volume) || volume <= 0) {
      toast.error("Introduce un número de volumen válido");
      return;
    }

    registering.current = true;
    setSaving(true);
    try {
      await saveProgress();
      const refreshed = await refetch();
      const current:NihongoTrackerBookStatus | undefined = refreshed.data;
      if (!current?.completed) {
        toast.error("No se pudo guardar el progreso terminado del volumen");
        return;
      }

      if (volume !== current.volumeNumber) {
        await setNihongoTrackerBookVolume(book._id, volume);
      }

      const response = await logBookInNihongoTracker(book._id);
      if (response?.status === "already_logged") {
        toast.info("Esta lectura ya estaba registrada en NihongoTracker");
      } else {
        toast.success(alreadyLogged ? "Otra lectura registrada en NihongoTracker" : "Volumen registrado en NihongoTracker");
      }
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status", book._id]});
      setOpen(false);
    } catch {
      toast.error("No se pudo registrar el volumen en NihongoTracker");
    } finally {
      registering.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <ReaderNavButton
        tooltip={alreadyLogged ? "Ya registrado en NihongoTracker" : "Registrar volumen en NihongoTracker"}
        onClick={()=>{
          setOpen(true);
        }}
      >
        {alreadyLogged ? <Check /> : <ListChecks />}
      </ReaderNavButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Registrar en NihongoTracker</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3 text-sm">
            <p className="font-medium text-fg">{status.serieName}</p>
            <label className="flex items-center justify-between gap-4">
              <span className="text-fg-muted">Volumen</span>
              <Input
                className="max-w-28 text-right"
                type="number"
                min="0.01"
                step="0.01"
                value={volumeInput}
                onChange={(event)=>setVolumeInput(event.target.value)}
              />
            </label>
            {status.volumeSource === "position" ? (
              <p className="text-xs text-fg-muted">El número se ha inferido por la posición del volumen. Puedes corregirlo antes de registrar.</p>
            ) : null}
            {status.pages !== undefined ? <p>Páginas: {status.pages}</p> : null}
            <p>Tiempo de lectura: {formatReadingTime(currentReadingSeconds || status.timeSeconds)}</p>
            {alreadyLogged ? (
              <p className="rounded-md border border-app-border bg-tint p-2 text-xs text-fg-muted">
                ✓ Este volumen ya fue registrado anteriormente.<br />
                {logCount} {logCount === 1 ? "lectura registrada" : "lecturas registradas"}. Puedes registrar otra lectura.
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={()=>void register()} loading={saving}>{alreadyLogged ? "Registrar otra lectura" : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
