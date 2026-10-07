import {useMutation, useQuery} from "@tanstack/react-query";
import {Check, LoaderCircle, Plus} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "react-toastify";
import {
  addDoujinshiToCollection,
  getDoujinshiOrganization,
  listDoujinshiCollections,
  removeDoujinshiFromCollection,
} from "../../api/doujinshi";
import {HttpError} from "../../types/error";
import type {DoujinshiCollection, DoujinshiOrganization} from "../../types/doujinshi";
import {invalidateDoujinshiCollectionItems, invalidateDoujinshiOrganization} from "../../lib/invalidate";
import {keys} from "../../lib/queryKeys";
import {Button} from "../../ui/Button";
import {Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "../../ui/Dialog";
import {DoujinshiCollectionDialog} from "./DoujinshiCollectionDialog";

interface DoujinshiOrganizationDialogProps {
  serieId: string;
  serieName: string;
  organization?: DoujinshiOrganization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof HttpError && error.status === 409) return "Ya existe una colección con ese nombre";
  return fallback;
}

export function DoujinshiOrganizationDialog({serieId, serieName, organization, open, onOpenChange}:DoujinshiOrganizationDialogProps):React.ReactElement {
  const [selectedIds, setSelectedIds] = useState<string[]>(organization?.collectionIds ?? []);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const organizationQuery = useQuery({
    queryKey: keys.doujinshiOrganization([serieId]),
    queryFn: ()=>getDoujinshiOrganization([serieId]),
    enabled: open && !organization,
  });
  const currentOrganization = organization ?? organizationQuery.data?.items[serieId];

  const collectionsQuery = useQuery({
    queryKey: keys.doujinshiCollections,
    queryFn: listDoujinshiCollections,
    enabled: open,
  });

  useEffect(()=>{
    setSelectedIds(currentOrganization?.collectionIds ?? []);
  }, [currentOrganization?.collectionIds]);

  const collectionMutation = useMutation({
    mutationFn: async({collectionId, add}:{collectionId:string; add:boolean})=>{
      setPendingId(collectionId);
      return add
        ? addDoujinshiToCollection(collectionId, serieId)
        : removeDoujinshiFromCollection(collectionId, serieId);
    },
    onSuccess:(_, variables)=>{
      setSelectedIds((current)=>variables.add
        ? [...new Set([...current, variables.collectionId])]
        : current.filter((id)=>id !== variables.collectionId));
      invalidateDoujinshiOrganization();
      invalidateDoujinshiCollectionItems(variables.collectionId);
    },
    onError:(error, variables)=>{
      setSelectedIds((current)=>variables.add
        ? current.filter((id)=>id !== variables.collectionId)
        : [...new Set([...current, variables.collectionId])]);
      toast.error(errorText(error, "No se pudo actualizar la colección"));
    },
    onSettled:()=>setPendingId(null),
  });

  function toggleCollection(collectionId:string):void {
    const add = !selectedIds.includes(collectionId);
    setSelectedIds((current)=>add
      ? [...new Set([...current, collectionId])]
      : current.filter((id)=>id !== collectionId));
    collectionMutation.mutate({collectionId, add});
  }

  async function addCreatedCollection(collection:DoujinshiCollection):Promise<void> {
    setSelectedIds((current)=>[...new Set([...current, collection._id])]);
    try {
      await addDoujinshiToCollection(collection._id, serieId);
      invalidateDoujinshiOrganization();
      invalidateDoujinshiCollectionItems(collection._id);
    } catch (error) {
      setSelectedIds((current)=>current.filter((id)=>id !== collection._id));
      toast.error(errorText(error, "La colección se creó, pero no se pudo añadir la serie"));
    }
  }

  const collections = collectionsQuery.data ?? [];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Organizar doujinshi</DialogTitle>
          <DialogDescription>{serieName}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {collectionsQuery.isLoading || organizationQuery.isLoading ? (
            <div className="flex justify-center py-8"><LoaderCircle className="size-5 animate-spin text-fg-muted" /></div>
          ) : collections.length === 0 ? (
            <p className="py-3 text-sm text-fg-muted">Todavía no tienes colecciones.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {collections.map((collection)=>{
                const selected = selectedIds.includes(collection._id);
                const pending = pendingId === collection._id;
                return (
                  <button
                    key={collection._id}
                    type="button"
                    disabled={collectionMutation.isPending}
                    onClick={()=>toggleCollection(collection._id)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-tint disabled:opacity-60"
                  >
                    <span className={`flex size-5 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-white" : "border-app-border"}`}>
                      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : selected ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                    <span className="text-xs text-fg-muted">{collection.visibleItemCount}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Button className="mt-5" variant="secondary" icon={<Plus className="size-4" />} onClick={()=>setCreateOpen(true)}>
            Nueva colección
          </Button>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <DoujinshiCollectionDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onSaved={(collection)=>{void addCreatedCollection(collection)}}
    />
    </>
  );
}
