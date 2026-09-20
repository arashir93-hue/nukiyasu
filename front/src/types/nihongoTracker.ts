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
  _id?:string | number;
  contentId?:string | number;
  mediaId?:string | number;
  title?:string | {
    native?:string;
    romaji?:string;
    english?:string;
    default?:string;
    contentTitleNative?:string;
    contentTitleRomaji?:string;
    contentTitleEnglish?:string;
    [key:string]:unknown;
  };
  mediaTitle?:string;
  titleEnglish?:string;
  titleNative?:string;
  titleRomaji?:string;
  originalTitle?:string;
  englishTitle?:string;
  nativeTitle?:string;
  romajiTitle?:string;
  name?:string;
  media?:NihongoTrackerMedia;
  [key:string]:unknown;
}

export interface NihongoTrackerSearchResponse {
  results?:NihongoTrackerMedia[];
  items?:NihongoTrackerMedia[];
  data?:NihongoTrackerMedia[] | {results?:NihongoTrackerMedia[]; items?:NihongoTrackerMedia[]};
}
