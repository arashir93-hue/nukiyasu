export type ImageVariant = "manga" | "doujinshi" | "artbook";
export type LibraryVariant = ImageVariant | "novela";
export type NihongoTrackerMediaType = "manga" | "light-novel";

export function isImageBasedVariant(variant:LibraryVariant):variant is ImageVariant {
    return variant === "manga" || variant === "doujinshi" || variant === "artbook";
}

export function nihongoTrackerMediaTypeForVariant(variant:LibraryVariant):NihongoTrackerMediaType {
    return variant === "novela" ? "light-novel" : "manga";
}

export function libraryFolderForVariant(variant:LibraryVariant):string {
    return variant === "novela" ? "novelas" : variant === "doujinshi" ? "doujinshi" : variant === "artbook" ? "artbooks" : "mangas";
}
