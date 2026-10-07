import {FolderHeart, Star} from "lucide-react";
import {Link} from "react-router";
import type {DoujinshiCollection} from "../../types/doujinshi";
import {DoujinshiCollectionMenu} from "./DoujinshiCollectionMenu";

interface DoujinshiCollectionCardProps {
  collection: DoujinshiCollection;
  onDeleted?: () => void;
}

export function DoujinshiCollectionCard({collection, onDeleted}:DoujinshiCollectionCardProps):React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-app-border bg-app-surface p-3 transition-colors hover:border-primary/50 hover:bg-tint">
      <Link to={`/app/library/doujinshi/collections/${collection._id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:no-underline">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint text-primary">
          {collection.isFavorite ? <Star className="size-5" fill="currentColor" /> : <FolderHeart className="size-5" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-fg">{collection.name}</span>
          <span className="block text-xs text-fg-muted">{collection.visibleItemCount} doujinshi</span>
        </span>
      </Link>
      <DoujinshiCollectionMenu collection={collection} onDeleted={onDeleted} />
    </div>
  );
}
