import type {SerieWithProgress} from "./serie";

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
    data: SerieWithProgress[];
    pages: number;
}
