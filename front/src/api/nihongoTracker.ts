import {api} from "./api";
import type {
  NihongoTrackerLink,
  NihongoTrackerMedia,
  NihongoTrackerMediaType,
  NihongoTrackerSearchResponse,
  NihongoTrackerStatus,
  NihongoTrackerBookStatus
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
  const params = new URLSearchParams({search, type, page:"1", perPage:"10"});
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

export function getNihongoTrackerBookStatus(bookId:string):Promise<NihongoTrackerBookStatus | undefined> {
  return api.get<NihongoTrackerBookStatus>(`nihongo-tracker/books/${bookId}/status`);
}

export function setNihongoTrackerBookVolume(bookId:string, volumeNumber:number):Promise<unknown | undefined> {
  return api.put<{volumeNumber:number}, unknown>(`nihongo-tracker/books/${bookId}/volume`, {volumeNumber});
}

export function clearNihongoTrackerBookVolume(bookId:string):Promise<{cleared:boolean} | undefined> {
  return api.delete<{cleared:boolean}>(`nihongo-tracker/books/${bookId}/volume`);
}

export function logBookInNihongoTracker(bookId:string, volumeNumber?:number):Promise<{status:"logged" | "already_logged"; externalLogId?:string} | undefined> {
  return api.post<{volumeNumber?:number}, {status:"logged" | "already_logged"; externalLogId?:string}>(
    `nihongo-tracker/books/${bookId}/log`,
    volumeNumber === undefined ? {} : {volumeNumber}
  );
}
