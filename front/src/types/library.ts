export type ImageVariant = "manga" | "doujinshi";
export type LibraryVariant = ImageVariant | "novela";

export function isImageBasedVariant(variant:LibraryVariant):variant is ImageVariant {
  return variant === "manga" || variant === "doujinshi";
}

export function libraryRouteForVariant(variant:LibraryVariant):string {
  return variant === "novela" ? "novels" : variant;
}

export function libraryFolderForVariant(variant:LibraryVariant):string {
  return variant === "novela" ? "novelas" : variant === "doujinshi" ? "doujinshi" : "mangas";
}
