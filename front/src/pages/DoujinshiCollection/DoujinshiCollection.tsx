import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {ArrowLeft, FolderHeart} from "lucide-react";
import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router";
import {listDoujinshiCollectionItems, listDoujinshiCollections} from "../../api/doujinshi";
import {CoverCard} from "../../components/CoverCard/CoverCard";
import {DoujinshiCollectionMenu} from "../../components/Doujinshi/DoujinshiCollectionMenu";
import {useDoujinshiOrganizationBatch} from "../../lib/useDoujinshiOrganization";
import {keys} from "../../lib/queryKeys";
import {withSerieProgressDefaults} from "../../types/doujinshi";
import {HttpError} from "../../types/error";
import {ErrorState} from "../../ui/ErrorState";
import {IconButton} from "../../ui/IconButton";
import {Pagination} from "../../ui/Pagination";
import {Spinner} from "../../ui/Spinner";
import {useTitle} from "../../lib/useTitle";

const itemLimit = 24;

function DoujinshiCollection():React.ReactElement {
  const {collectionId} = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const collectionsQuery = useQuery({
    queryKey: keys.doujinshiCollections,
    queryFn: listDoujinshiCollections,
  });
  const itemsQuery = useQuery({
    queryKey: keys.doujinshiCollectionItems(collectionId ?? "", page, itemLimit),
    queryFn: ()=>listDoujinshiCollectionItems(collectionId!, page, itemLimit),
    enabled: Boolean(collectionId),
    placeholderData: keepPreviousData,
  });

  const collection = collectionsQuery.data?.find((item)=>item._id === collectionId);
  const notFound = itemsQuery.error instanceof HttpError && itemsQuery.error.status === 404;

  useEffect(()=>{
    if (notFound || (!collectionsQuery.isLoading && collectionsQuery.data && !collection)) {
      navigate("/app/library/doujinshi", {replace:true});
    }
  }, [collection, collectionsQuery.data, collectionsQuery.isLoading, navigate, notFound]);

  const series = (itemsQuery.data?.data ?? []).map(withSerieProgressDefaults);
  const {organizations} = useDoujinshiOrganizationBatch(series);

  useTitle(collection?.name ?? "Colección de doujinshi");

  if (collectionsQuery.isLoading || (itemsQuery.isLoading && !itemsQuery.data)) {
    return <div className="flex h-full items-center justify-center py-24"><Spinner size={28} className="text-fg-muted" /></div>;
  }

  if (itemsQuery.isError && !notFound) {
    return <ErrorState title="No se pudo cargar la colección" onRetry={()=>void itemsQuery.refetch()} className="py-24" />;
  }

  if (!collection) return <div className="flex h-full items-center justify-center"><Spinner size={24} className="text-fg-muted" /></div>;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-20 border-b border-app-border bg-app-sidebar">
        <div className="flex h-14 items-center gap-2 px-3">
          <IconButton label="Volver a doujinshi" onClick={()=>navigate("/app/library/doujinshi")}><ArrowLeft /></IconButton>
          <span className="flex size-8 items-center justify-center rounded-md bg-tint text-primary"><FolderHeart className="size-4" /></span>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{collection.name}</h1>
          <span className="hidden text-xs text-fg-muted sm:inline">{collection.visibleItemCount} doujinshi</span>
          <DoujinshiCollectionMenu collection={collection} onDeleted={()=>navigate("/app/library/doujinshi", {replace:true})} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
        {itemsQuery.isFetching ? <div className="flex items-center gap-2 text-xs text-fg-muted"><Spinner size={14} />Actualizando colección…</div> : null}
        {series.length === 0 ? (
          <p className="rounded-lg border border-dashed border-app-border px-4 py-6 text-center text-sm text-fg-muted">Esta colección está vacía.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-5">
            {series.map((serie)=>(
              <li key={serie._id} className="[content-visibility:auto] [contain-intrinsic-size:auto_260px]">
                <CoverCard kind="serie" serie={serie} noVariantIndicator organization={organizations[serie._id]} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pages={itemsQuery.data?.pages ?? 1} onPageChange={setPage} />
      </div>
    </div>
  );
}

export default DoujinshiCollection;
