import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {Heart, Plus} from "lucide-react";
import {useState} from "react";
import {listDoujinshiCollections, listDoujinshiFavorites} from "../../../api/doujinshi";
import {CoverCard} from "../../../components/CoverCard/CoverCard";
import {DoujinshiCollectionCard} from "../../../components/Doujinshi/DoujinshiCollectionCard";
import {DoujinshiCollectionDialog} from "../../../components/Doujinshi/DoujinshiCollectionDialog";
import {useDoujinshiOrganizationBatch} from "../../../lib/useDoujinshiOrganization";
import {keys} from "../../../lib/queryKeys";
import {withSerieProgressDefaults} from "../../../types/doujinshi";
import {Button} from "../../../ui/Button";
import {ErrorState} from "../../../ui/ErrorState";
import {Pagination} from "../../../ui/Pagination";
import {Spinner} from "../../../ui/Spinner";

const favoriteLimit = 24;

export function DoujinshiLibrarySections():React.ReactElement {
  const [favoritePage, setFavoritePage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const favoritesQuery = useQuery({
    queryKey: keys.doujinshiFavorites(favoritePage, favoriteLimit),
    queryFn: ()=>listDoujinshiFavorites(favoritePage, favoriteLimit),
    placeholderData: keepPreviousData,
  });
  const collectionsQuery = useQuery({
    queryKey: keys.doujinshiCollections,
    queryFn: listDoujinshiCollections,
  });

  const favoriteSeries = (favoritesQuery.data?.data ?? []).map(withSerieProgressDefaults);
  const {organizations} = useDoujinshiOrganizationBatch(favoriteSeries);
  const collections = collectionsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-8 px-4 pt-5 lg:px-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg"><Heart className="size-4 text-accent" fill="currentColor" />Favoritos</h2>
          {favoritesQuery.isFetching && !favoritesQuery.isLoading ? <Spinner size={14} className="text-fg-muted" /> : null}
        </div>
        {favoritesQuery.isLoading ? <div className="flex justify-center py-4"><Spinner size={22} className="text-fg-muted" /></div> : null}
        {favoritesQuery.isError ? <ErrorState title="No se pudieron cargar los favoritos" onRetry={()=>void favoritesQuery.refetch()} className="py-5" /> : null}
        {!favoritesQuery.isLoading && !favoritesQuery.isError && favoriteSeries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-app-border px-4 py-3 text-sm text-fg-muted">Aún no tienes doujinshi favoritos.</p>
        ) : null}
        {!favoritesQuery.isLoading && !favoritesQuery.isError && favoriteSeries.length > 0 ? (
          <>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-5">
              {favoriteSeries.map((serie)=>(
                <li key={serie._id} className="[content-visibility:auto] [contain-intrinsic-size:auto_260px]">
                  <CoverCard kind="serie" serie={serie} noVariantIndicator organization={organizations[serie._id]} />
                </li>
              ))}
            </ul>
            <Pagination page={favoritePage} pages={favoritesQuery.data?.pages ?? 1} onPageChange={setFavoritePage} />
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg">Colecciones</h2>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={()=>setCreateOpen(true)}>Nueva colección</Button>
        </div>
        {collectionsQuery.isLoading ? <div className="flex justify-center py-4"><Spinner size={22} className="text-fg-muted" /></div> : null}
        {collectionsQuery.isError ? <ErrorState title="No se pudieron cargar las colecciones" onRetry={()=>void collectionsQuery.refetch()} className="py-5" /> : null}
        {!collectionsQuery.isLoading && !collectionsQuery.isError && collections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-app-border px-4 py-3 text-sm text-fg-muted">Aún no tienes colecciones.</p>
        ) : null}
        {!collectionsQuery.isLoading && !collectionsQuery.isError && collections.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection)=><DoujinshiCollectionCard key={collection._id} collection={collection} />)}
          </div>
        ) : null}
      </section>

      <DoujinshiCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
