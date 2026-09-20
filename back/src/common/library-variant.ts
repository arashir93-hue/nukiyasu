export type ImageVariant = "manga" | "doujinshi";
export type LibraryVariant = ImageVariant | "novela";
export type NihongoTrackerMediaType = "manga" | "light-novel";

export function isImageBasedVariant(variant:LibraryVariant):variant is ImageVariant {
    return variant === "manga" || variant === "doujinshi";
}

export function nihongoTrackerMediaTypeForVariant(variant:LibraryVariant):NihongoTrackerMediaType {
    return variant === "novela" ? "light-novel" : "manga";
}

export function libraryFolderForVariant(variant:LibraryVariant):string {
    return variant === "novela" ? "novelas" : variant === "doujinshi" ? "doujinshi" : "mangas";
}
