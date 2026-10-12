import type {Book, BookWithProgress} from "../types/book";
import type {Serie, SerieWithProgress} from "../types/serie";
import {isImageBasedVariant, libraryFolderForVariant} from "../types/library";

/** URLs de miniaturas y páginas estáticas (unificadas y sin duplicar lógica). */

function versioned(url:string, version?:string):string {
  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

export function bookThumbnail(book: Book): string {
  if (book.mokured) {
    return versioned(`/api/static/novelas/${book.seriePath}/${book.imagesFolder}/${book.thumbnailPath}`, book.thumbnailVersion);
  }

  if (isImageBasedVariant(book.variant)) {
    return versioned(`/api/static/${libraryFolderForVariant(book.variant)}/${book.seriePath}/${book.imagesFolder}/${book.thumbnailPath}`, book.thumbnailVersion);
  }

  return versioned(`/api/static/novelas/${book.seriePath}/${book.thumbnailPath}`, book.thumbnailVersion);
}

export function serieThumbnail(serie: SerieWithProgress | Serie): string {
  const url = isImageBasedVariant(serie.variant)
    ? `/api/static/${libraryFolderForVariant(serie.variant)}/${serie.thumbnailPath}`
    : `/api/static/novelas/${serie.thumbnailPath}`;
  return versioned(url, serie.thumbnailVersion);
}

/** Clave de localStorage donde mokuro persiste el estado del volumen. */
export function mokuroStorageKey(book: Pick<Book, "variant" | "seriePath" | "path">): string {
  return `mokuro_/api/static/${libraryFolderForVariant(book.variant)}/${encodeURI(book.seriePath)}/${encodeURI(book.path)}.html`;
}

/** URL del HTML de mokuro para el modo "abrir HTML directamente". */
export function mokuroHtmlUrl(book: Pick<Book, "variant" | "seriePath" | "path">): string {
  return `/api/static/${libraryFolderForVariant(book.variant)}/${encodeURI(book.seriePath)}/${encodeURI(book.path)}.html`;
}

/** URL de una página de un tomo sin mokuro. */
export function bookPageUrl(
  book: Pick<Book, "variant" | "seriePath" | "imagesFolder">,
  pagePath: string
): string {
  return `/api/static/${libraryFolderForVariant(book.variant)}/${encodeURI(book.seriePath)}/${encodeURI(book.imagesFolder)}/${encodeURI(pagePath)}`;
}

/** URL de descarga directa del EPUB. */
export function bookDownloadUrl(book: Pick<BookWithProgress, "_id">): string {
  return `/api/books/${book._id}/download`;
}

const STATIC_PREFIX = "/api/static/";

/**
 * URL de la miniatura (webp 480px) de una portada estática. El backend la
 * genera en `exterior/thumbnails/` durante el rescan; si aún no existe, quien
 * la use debe caer a la original (ver CoverImage).
 */
export function thumbUrl(originalUrl: string): string {
  if (!originalUrl.startsWith(STATIC_PREFIX)) return originalUrl;

  const queryIndex = originalUrl.indexOf("?", STATIC_PREFIX.length);
  const base = queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? "" : originalUrl.slice(queryIndex);

  const rest = base.slice(STATIC_PREFIX.length);

  if (rest.startsWith("thumbnails/")) return originalUrl;

  const dotIndex = rest.lastIndexOf(".");
  const slashIndex = rest.lastIndexOf("/");

  if (dotIndex <= slashIndex) return originalUrl;

  return `${STATIC_PREFIX}thumbnails/${rest.slice(0, dotIndex)}.webp${suffix}`;
}
