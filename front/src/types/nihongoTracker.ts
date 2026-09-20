export type NihongoTrackerMediaType = "manga" | "light-novel";

export interface NihongoTrackerStatus {
  connected:boolean;
  keyPrefix?:string;
  linkedSeries:number;
}

export interface NihongoTrackerLink {
  mediaType:NihongoTrackerMediaType;
  mediaId:string;
  mediaTitle?:string;
}

/** La API externa no expone una forma única en todas sus versiones. */
export interface NihongoTrackerMedia {
  id?:string | number;
  contentId?:string | number;
  mediaId?:string | number;
  title?:string | {native?:string; romaji?:string; english?:string};
  name?:string;
  [key:string]:unknown;
}

export interface NihongoTrackerSearchResponse {
  results?:NihongoTrackerMedia[];
  items?:NihongoTrackerMedia[];
  data?:NihongoTrackerMedia[] | {results?:NihongoTrackerMedia[]; items?:NihongoTrackerMedia[]};
}
