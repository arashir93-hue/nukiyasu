import {useMutation} from "@tanstack/react-query";
import {Heart, MoreVertical, Pencil, Star, Trash2} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "react-toastify";
import {deleteDoujinshiCollection, updateDoujinshiCollection} from "../../api/doujinshi";
import {HttpError} from "../../types/error";
import type {DoujinshiCollection} from "../../types/doujinshi";
import {invalidateDoujinshiCollectionItems, invalidateDoujinshiOrganization} from "../../lib/invalidate";
import {confirmDialog} from "../../stores/ConfirmStore";
import {IconButton} from "../../ui/IconButton";
import {Menu, MenuContent, MenuItem, MenuTrigger} from "../../ui/Menu";
import {DoujinshiCollectionDialog} from "./DoujinshiCollectionDialog";

interface DoujinshiCollectionMenuProps {
  collection: DoujinshiCollection;
  onDeleted?: () => void;
}

export function DoujinshiCollectionMenu({collection, onDeleted}:DoujinshiCollectionMenuProps):React.ReactElement {
  const [editOpen, setEditOpen] = useState(false);
  const [favorite, setFavorite] = useState(collection.isFavorite === true);

  useEffect(()=>{
    setFavorite(collection.isFavorite === true);
  }, [collection.isFavorite]);

  const favoriteMutation = useMutation({
    mutationFn: ()=>updateDoujinshiCollection(collection._id, {isFavorite:!favorite}),
    onMutate:()=>{
      const previous = favorite;
      setFavorite(!previous);
      return previous;
    },
    onSuccess:()=>invalidateDoujinshiOrganization(),
    onError:(_error, _variables, previous)=>{
      if (previous !== undefined) setFavorite(previous);
      toast.error("No se pudo actualizar la colección");
    },
  });

  const deleteMutation = useMutation({
    mutationFn:()=>deleteDoujinshiCollection(collection._id),
    onSuccess:()=>{
      invalidateDoujinshiOrganization();
      invalidateDoujinshiCollectionItems(collection._id);
      onDeleted?.();
      toast.success("Colección eliminada");
    },
    onError:(error)=>{
      const message = error instanceof HttpError && error.status === 404
        ? "La colección ya no existe"
        : "No se pudo eliminar la colección";
      toast.error(message);
    },
  });

  async function remove():Promise<void> {
    if (favoriteMutation.isPending || deleteMutation.isPending) return;
    const confirmed = await confirmDialog(`Eliminar la colección «${collection.name}». Se eliminará la colección, pero no los doujinshi ni sus favoritos.`);
    if (confirmed) deleteMutation.mutate();
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="Acciones de colección" size="sm" variant="ghost" onClick={(event)=>event.stopPropagation()}>
            <MoreVertical />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={()=>setEditOpen(true)}>
            <Pencil />
            Renombrar
          </MenuItem>
          <MenuItem disabled={favoriteMutation.isPending} onSelect={()=>favoriteMutation.mutate()}>
            {favorite ? <Heart fill="currentColor" /> : <Star />}
            {favorite ? "Quitar de favoritas" : "Marcar como favorita"}
          </MenuItem>
          <MenuItem danger disabled={deleteMutation.isPending} onSelect={()=>void remove()}>
            <Trash2 />
            Eliminar
          </MenuItem>
        </MenuContent>
      </Menu>
      <DoujinshiCollectionDialog collection={collection} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
