import {api} from "./api";
import type {
  NihongoTrackerLink,
  NihongoTrackerMedia,
  NihongoTrackerMediaType,
  NihongoTrackerSearchResponse,
  NihongoTrackerStatus
} from "../types/nihongoTracker";

export function getNihongoTrackerStatus():Promise<NihongoTrackerStatus | undefined> {
  return api.get<NihongoTrackerStatus>("nihongo-tracker/status");
}

export function connectNihongoTracker(apiKey:string):Promise<NihongoTrackerStatus | undefined> {
  return api.patch<{apiKey:string}, NihongoTrackerStatus>("nihongo-tracker/connection", {apiKey});
}

export function disconnectNihongoTracker():Promise<{connected:boolean} | undefined> {
  return api.delete<{connected:boolean}>("nihongo-tracker/connection");
}

export function searchNihongoTracker(
  search:string,
  type:NihongoTrackerMediaType
):Promise<NihongoTrackerSearchResponse | NihongoTrackerMedia[] | undefined> {
  const params = new URLSearchParams({search, type, perPage:"20"});
  return api.get<NihongoTrackerSearchResponse | NihongoTrackerMedia[]>(`nihongo-tracker/media/search?${params.toString()}`);
}

export function getNihongoTrackerLink(serieId:string):Promise<NihongoTrackerLink | null | undefined> {
  return api.get<NihongoTrackerLink | null>(`nihongo-tracker/series/${serieId}`);
}

export function linkNihongoTrackerSerie(
  serieId:string,
  link:{mediaType:NihongoTrackerMediaType; mediaId:string; mediaTitle?:string}
):Promise<NihongoTrackerLink | undefined> {
  return api.put<{mediaType:NihongoTrackerMediaType; mediaId:string; mediaTitle?:string}, NihongoTrackerLink>(
    `nihongo-tracker/series/${serieId}`,
    link
  );
}

export function logBookInNihongoTracker(bookId:string):Promise<{status:"logged" | "already_logged"; externalLogId?:string} | undefined> {
  return api.post<void, {status:"logged" | "already_logged"; externalLogId?:string}>(`nihongo-tracker/books/${bookId}/log`);
}
