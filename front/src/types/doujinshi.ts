import type {Serie, SerieWithProgress} from "./serie";

export interface DoujinshiCollection {
    _id: string;
    name: string;
    isFavorite: boolean;
    sortOrder: number;
    visibleItemCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface DoujinshiOrganization {
    isFavorite: boolean;
    collectionIds: string[];
}

export interface DoujinshiFavoriteStatus {
    isFavorite: boolean;
}

export interface DoujinshiOrganizationBatch {
    items: Record<string, DoujinshiOrganization>;
}

export interface DoujinshiFavoritePage {
    data: Serie[];
    pages: number;
}

export interface DoujinshiCollectionPage {
    data: Serie[];
    pages: number;
}

/** Los endpoints de organización devuelven series sin estado de progreso. */
export function withSerieProgressDefaults(serie: Serie): SerieWithProgress {
    return {
        ...serie,
        unreadBooks: 0,
        type: "serie",
        readlist: false,
        paused: false,
    };
}
