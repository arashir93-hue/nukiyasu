export type ImageVariant = "manga" | "doujinshi" | "artbook";
export type LibraryVariant = ImageVariant | "novela";

export function isImageBasedVariant(variant:LibraryVariant):variant is ImageVariant {
  return variant === "manga" || variant === "doujinshi" || variant === "artbook";
}

export function libraryRouteForVariant(variant:LibraryVariant):string {
  return variant === "novela" ? "novels" : variant === "artbook" ? "artbooks" : variant;
}

export function libraryFolderForVariant(variant:LibraryVariant):string {
  return variant === "novela" ? "novelas" : variant === "doujinshi" ? "doujinshi" : variant === "artbook" ? "artbooks" : "mangas";
}
