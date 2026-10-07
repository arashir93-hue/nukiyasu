import {api} from "./api";
import type {DoujinshiCollection, DoujinshiFavoritePage, DoujinshiFavoriteStatus, DoujinshiOrganizationBatch} from "../types/doujinshi";

export function listDoujinshiFavorites(page = 1, limit = 24): Promise<DoujinshiFavoritePage | undefined> {
    return api.get<DoujinshiFavoritePage>(`doujinshi/favorites?page=${page}&limit=${limit}`);
}

export function addDoujinshiFavorite(serieId: string): Promise<DoujinshiFavoriteStatus | undefined> {
    return api.put<Record<string, never>, DoujinshiFavoriteStatus>(`doujinshi/series/${serieId}/favorite`, {});
}

export function removeDoujinshiFavorite(serieId: string): Promise<DoujinshiFavoriteStatus | undefined> {
    return api.delete<DoujinshiFavoriteStatus>(`doujinshi/series/${serieId}/favorite`);
}

export function listDoujinshiCollections(): Promise<DoujinshiCollection[] | undefined> {
    return api.get<DoujinshiCollection[]>("doujinshi/collections");
}

export function createDoujinshiCollection(name: string): Promise<DoujinshiCollection | undefined> {
    return api.post<{name:string}, DoujinshiCollection>("doujinshi/collections", {name});
}

export function addDoujinshiToCollection(collectionId: string, serieId: string): Promise<unknown> {
    return api.put<Record<string, never>, unknown>(`doujinshi/collections/${collectionId}/items/${serieId}`, {});
}

export function removeDoujinshiFromCollection(collectionId: string, serieId: string): Promise<unknown> {
    return api.delete<unknown>(`doujinshi/collections/${collectionId}/items/${serieId}`);
}

export function getDoujinshiOrganization(serieIds: string[]): Promise<DoujinshiOrganizationBatch | undefined> {
    return api.post<{serieIds:string[]}, DoujinshiOrganizationBatch>("doujinshi/organization/batch", {serieIds});
}
