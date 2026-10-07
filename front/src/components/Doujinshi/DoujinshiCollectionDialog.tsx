import {useMutation} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {toast} from "react-toastify";
import {createDoujinshiCollection, updateDoujinshiCollection} from "../../api/doujinshi";
import {HttpError} from "../../types/error";
import type {DoujinshiCollection} from "../../types/doujinshi";
import {invalidateDoujinshiOrganization} from "../../lib/invalidate";
import {Button} from "../../ui/Button";
import {Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "../../ui/Dialog";
import {Input} from "../../ui/Input";

interface DoujinshiCollectionDialogProps {
  open: boolean;
  onOpenChange: (open:boolean) => void;
  collection?: DoujinshiCollection;
  onSaved?: (collection:DoujinshiCollection) => void;
}

function errorMessage(error:unknown):string {
  if (error instanceof HttpError && error.status === 409) return "Ya existe una colección con ese nombre";
  return "No se pudo guardar la colección";
}

export function DoujinshiCollectionDialog({open, onOpenChange, collection, onSaved}:DoujinshiCollectionDialogProps):React.ReactElement {
  const [name, setName] = useState(collection?.name ?? "");
  const editing = Boolean(collection);

  useEffect(()=>{
    if (open) setName(collection?.name ?? "");
  }, [collection?.name, open]);

  const mutation = useMutation({
    mutationFn: async(value:string)=>{
      const result = editing
        ? await updateDoujinshiCollection(collection!._id, {name:value})
        : await createDoujinshiCollection(value);
      if (!result) throw new Error("No se pudo guardar la colección");
      return result;
    },
    onSuccess:(result)=>{
      invalidateDoujinshiOrganization();
      onSaved?.(result);
      onOpenChange(false);
      toast.success(editing ? "Colección renombrada" : "Colección creada");
    },
    onError:(error)=>toast.error(errorMessage(error)),
  });

  function save():void {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80 || mutation.isPending) return;
    mutation.mutate(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Renombrar colección" : "Nueva colección"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Input
            value={name}
            onChange={(event)=>setName(event.target.value)}
            onKeyDown={(event)=>{if (event.key === "Enter") save();}}
            maxLength={80}
            autoFocus
            aria-label="Nombre de la colección"
          />
          <p className="mt-2 text-xs text-fg-muted">El nombre debe tener entre 1 y 80 caracteres.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>Cancelar</Button>
          <Button loading={mutation.isPending} disabled={!name.trim() || name.trim().length > 80} onClick={save}>
            {editing ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
