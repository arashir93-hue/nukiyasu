export interface MokuroStoredMetadata {
    format?: "mokuro" | "images";
    sourceVersion?: string;
    missing?: boolean;
    pages?: number;
    imagesFolder?: string;
    thumbnailPath?: string;
}

export interface MokuroPhysicalMetadata {
    sourceVersion:string;
    pages:number;
    imagesFolder:string;
    thumbnailPath:string;
}

export type MokuroSyncAction = "unchanged" | "baseline" | "refresh";

export interface MokuroReferenceMetadata {
    seriePath?:string;
    imagesFolder?:string;
    format?:"mokuro" | "images";
    missing?:boolean;
}

/** Carpetas que pertenecen a Mokuro actualmente disponible en la biblioteca. */
export function getReferencedImageFolders(books:MokuroReferenceMetadata[]):Set<string> {
    return new Set(
        books
            .filter((book) => book.missing !== true && book.format !== "images" && book.seriePath && book.imagesFolder)
            .map((book) => `${book.seriePath}/${book.imagesFolder}`)
    );
}

/** Decide qué trabajo necesita un HTML Mokuro ya conocido por la base de datos. */
export function decideMokuroSync(
    stored:MokuroStoredMetadata,
    physical:MokuroPhysicalMetadata
):MokuroSyncAction {
    // Una carpeta de imágenes que ahora tiene HTML debe convertirse y contar OCR.
    if (stored.format === "images") return "refresh";

    const physicalMetadataMatches = stored.pages === physical.pages
        && stored.imagesFolder === physical.imagesFolder
        && stored.thumbnailPath === physical.thumbnailPath;

    if (stored.sourceVersion === physical.sourceVersion && physicalMetadataMatches) {
        return stored.missing ? "baseline" : "unchanged";
    }

    // Documentos históricos sin firma pueden establecer una línea base si sus
    // metadatos físicos ya coinciden, sin repetir el conteo OCR costoso.
    if (!stored.sourceVersion && physicalMetadataMatches) return "baseline";

    return "refresh";
}
