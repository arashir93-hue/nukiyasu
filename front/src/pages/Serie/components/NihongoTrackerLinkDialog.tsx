import {Link2, Search} from "lucide-react";
import {useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {toast} from "react-toastify";
import {
  getNihongoTrackerLink,
  getNihongoTrackerStatus,
  linkNihongoTrackerSerie,
  unlinkNihongoTrackerSerie,
  searchNihongoTracker
} from "../../../api/nihongoTracker";
import type {NihongoTrackerLink, NihongoTrackerLinkMode, NihongoTrackerMedia, NihongoTrackerMediaType, NihongoTrackerSearchResponse} from "../../../types/nihongoTracker";
import type {Serie} from "../../../types/serie";
import {Button} from "../../../ui/Button";
import {Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "../../../ui/Dialog";
import {Field} from "../../../ui/Field";
import {Input} from "../../../ui/Input";
import {Spinner} from "../../../ui/Spinner";

interface NihongoTrackerLinkDialogProps {
  serie:Serie;
  open:boolean;
  onOpenChange:(open:boolean)=>void;
}

function mediaItems(response:NihongoTrackerSearchResponse | NihongoTrackerMedia[] | undefined):NihongoTrackerMedia[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.results)) return response.results;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && !Array.isArray(response.data)) {
    return Array.isArray(response.data.results) ? response.data.results : response.data.items ?? [];
  }
  return [];
}

function mediaId(media:NihongoTrackerMedia):string | undefined {
  const value = media.contentId ?? media.mediaId ?? media.id ?? media._id
    ?? media.media?.contentId ?? media.media?.mediaId ?? media.media?.id ?? media.media?._id;
  return value === undefined || value === null ? undefined : String(value);
}

function mediaTitle(media:NihongoTrackerMedia):string {
  if (media.mediaTitle) return media.mediaTitle;
  if (typeof media.title === "string") return media.title;
  if (media.title && typeof media.title === "object") {
    return media.title.contentTitleNative
      || media.title.contentTitleRomaji
      || media.title.contentTitleEnglish
      || media.title.native
      || media.title.english
      || media.title.romaji
      || media.title.default
      || "Sin título";
  }
  const nestedTitle = media.media && media.media !== media ? mediaTitle(media.media) : undefined;
  return (nestedTitle && nestedTitle !== "Sin título" ? nestedTitle : undefined)
    || media.titleNative
    || media.titleEnglish
    || media.titleRomaji
    || media.nativeTitle
    || media.englishTitle
    || media.romajiTitle
    || media.originalTitle
    || media.name
    || "Sin título";
}

export function NihongoTrackerLinkDialog({serie, open, onOpenChange}:NihongoTrackerLinkDialogProps):React.ReactElement {
  const type:NihongoTrackerMediaType = serie.variant === "novela" ? "light-novel" : "manga";
  const [query, setQuery] = useState(serie.visibleName);
  const [results, setResults] = useState<NihongoTrackerMedia[]>([]);
  const [currentLink, setCurrentLink] = useState<NihongoTrackerLink | null>(null);
  const [connected, setConnected] = useState<boolean | undefined>();
  const [mode, setMode] = useState<NihongoTrackerLinkMode>("linked");
  const [manualTitle, setManualTitle] = useState(serie.visibleName);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string>();
  const queryClient = useQueryClient();

  useEffect(()=>{
    if (!open) return;
    setQuery(serie.visibleName);
    setResults([]);
    setConnected(undefined);
    setCurrentLink(null);
    setMode("linked");
    setManualTitle(serie.visibleName);
    setLoading(true);
    void getNihongoTrackerStatus()
      .then(async(status)=>{
        const isConnected = status?.connected === true;
        setConnected(isConnected);

        if (!isConnected) return;

        try {
          const link = await getNihongoTrackerLink(serie._id);
          setCurrentLink(link ?? null);
          setMode(link?.mode === "manual" ? "manual" : "linked");
          setManualTitle(link?.mediaTitle || serie.visibleName);
        } catch {
          // La conexión sigue siendo válida aunque esta serie aún no tenga
          // vínculo o la consulta del vínculo falle.
          setCurrentLink(null);
        }
      })
      .catch(()=>setConnected(false))
      .finally(()=>setLoading(false));
  }, [open, serie._id, serie.visibleName]);

  async function search():Promise<void> {
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const response = await searchNihongoTracker(query.trim(), type);
      setResults(mediaItems(response));
      if (mediaItems(response).length === 0) toast.info("No se encontraron resultados");
    } catch {
      toast.error("No se pudo buscar en NihongoTracker");
    } finally {
      setLoading(false);
    }
  }

  async function selectMedia(media:NihongoTrackerMedia):Promise<void> {
    const id = mediaId(media);
    if (!id || linkingId) return;
    setLinkingId(id);
    try {
      const link = await linkNihongoTrackerSerie(serie._id, {mode:"linked", mediaType:type, mediaId:id, mediaTitle:mediaTitle(media)});
      if (!link) throw new Error("Respuesta vacía");
      setCurrentLink(link);
      setMode("linked");
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-status"]});
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status"]});
      toast.success("Serie vinculada con NihongoTracker");
    } catch {
      toast.error("No se pudo vincular la serie");
    } finally {
      setLinkingId(undefined);
    }
  }

  async function saveManual():Promise<void> {
    const title = manualTitle.trim();
    if (!title || linkingId) {
      if (!title) toast.error("Introduce un título válido");
      return;
    }

    setLinkingId("manual");
    try {
      const link = await linkNihongoTrackerSerie(serie._id, {
        mode:"manual",
        mediaType:type,
        mediaTitle:title
      });
      if (!link) throw new Error("Respuesta vacía");
      setCurrentLink(link);
      setMode("manual");
      setManualTitle(link.mediaTitle || title);
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-status"]});
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status"]});
      toast.success("Registro manual configurado");
    } catch {
      toast.error("No se pudo guardar la configuración manual");
    } finally {
      setLinkingId(undefined);
    }
  }

  async function unlink():Promise<void> {
    if (linkingId) return;
    setLinkingId("unlink");
    try {
      await unlinkNihongoTrackerSerie(serie._id);
      setCurrentLink(null);
      setMode("linked");
      setManualTitle(serie.visibleName);
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-status"]});
      await queryClient.invalidateQueries({queryKey:["nihongo-tracker-book-status"]});
      toast.success("Serie desvinculada de NihongoTracker");
    } catch {
      toast.error("No se pudo desvincular la serie");
    } finally {
      setLinkingId(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Vincular con NihongoTracker</DialogTitle>
          <DialogDescription>
            Busca el registro correcto para que los volúmenes terminados se guarden en tu cuenta.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {loading && connected === undefined ? <Spinner className="self-center" /> : null}
          {connected === false ? (
            <p className="rounded-lg border border-app-border bg-tint p-3 text-sm text-fg-muted">
              Primero conecta tu cuenta de NihongoTracker desde Ajustes.
            </p>
          ) : null}
          {connected ? (
            <>
              {currentLink ? (
                <p className="rounded-lg border border-app-border bg-tint p-3 text-sm text-fg">
                  {currentLink.mode === "manual" ? "Configurada sin coincidencia como " : "Vinculada actualmente a "}
                  <strong>{currentLink.mediaTitle || currentLink.mediaId || serie.visibleName}</strong>.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant={mode === "linked" ? "primary" : "secondary"} onClick={()=>setMode("linked")}>Buscar obra existente</Button>
                <Button variant={mode === "manual" ? "primary" : "secondary"} onClick={()=>setMode("manual")}>Registrar sin coincidencia</Button>
              </div>
              {mode === "manual" ? (
                <div className="flex flex-col gap-3">
                  <Field label="Título en NihongoTracker" hint="Se usará para todos los volúmenes de esta serie.">
                    <Input value={manualTitle} onChange={(event)=>setManualTitle(event.target.value)} />
                  </Field>
                  <div className="flex justify-end gap-2">
                    {currentLink ? <Button variant="ghost" onClick={()=>void unlink()} loading={linkingId === "unlink"}>Desvincular</Button> : null}
                    <Button onClick={()=>void saveManual()} loading={linkingId === "manual"}>Guardar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(event)=>{
                      event.preventDefault();
                      void search();
                    }}
                  >
                    <Field label="Título" className="flex-1">
                      <Input value={query} onChange={(event)=>setQuery(event.target.value)} />
                    </Field>
                    <Button type="submit" icon={<Search />} loading={loading}>Buscar</Button>
                  </form>
                  <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {results.map((media, index)=>{
                      const id = mediaId(media);
                      return id ? (
                        <button
                          key={`${id}-${index}`}
                          type="button"
                          className="flex items-center justify-between rounded-md border border-app-border px-3 py-2 text-left text-sm text-fg hover:bg-tint"
                          onClick={()=>void selectMedia(media)}
                          disabled={!!linkingId}
                        >
                          <span>{mediaTitle(media)}</span>
                          <span className="ml-3 shrink-0 text-xs text-fg-muted">{id}</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                  {currentLink ? <div className="flex justify-end"><Button variant="ghost" onClick={()=>void unlink()} loading={linkingId === "unlink"}>Desvincular</Button></div> : null}
                </>
              )}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={()=>onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NihongoTrackerLinkButton({onClick}:{onClick:()=>void}):React.ReactElement {
  return <Button size="sm" variant="secondary" icon={<Link2 />} onClick={onClick}>Vincular NihongoTracker</Button>;
}
