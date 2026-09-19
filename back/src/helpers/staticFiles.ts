import {existsSync} from "fs";
import {join} from "path";
import {Response} from "express";

const THUMBNAILS_PREFIX = "/thumbnails/";
const ORIGINAL_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

export interface LibraryStaticPath {
    relativePath:string;
    variant:"manga" | "novela";
    seriePath:string;
}

/**
 * Valida una ruta de /api/static y extrae la serie a la que pertenece.
 * También reconoce el árbol paralelo de miniaturas. No normaliza segmentos
 * peligrosos: los rechaza para que nunca puedan cambiar el archivo objetivo.
 */
export function parseLibraryStaticPath(relativePath:string):LibraryStaticPath | null {
    if (!relativePath || relativePath.includes("\\") || relativePath.includes("\0")) return null;

    const normalized = relativePath.replace(/^\/+/, "");
    const segments = normalized.split("/");

    if (
        segments.length < 3 ||
        segments.some(segment => !segment || segment === "." || segment === "..")
    ) return null;

    if (segments[0] === "thumbnails") segments.shift();

    if (segments.length < 3) return null;

    const [folder, seriePath] = segments;

    if (folder !== "mangas" && folder !== "novelas") return null;

    return {
        relativePath:`/${normalized}`,
        variant:folder === "mangas" ? "manga" : "novela",
        seriePath
    };
}

/**
 * Portada original asociada a una miniatura, o null si la ruta no es una
 * miniatura o no hay ninguna portada con ese nombre.
 */
export function originalPathForThumbnail(relativePath: string, root: string): string | null {
    if (!relativePath.startsWith(THUMBNAILS_PREFIX)) return null;

    const base = relativePath.slice(THUMBNAILS_PREFIX.length).replace(/\.webp$/i, "");

    const candidates = ORIGINAL_EXTENSIONS.map((extension) => `/${base}${extension}`);

    return candidates.find((candidate) => existsSync(join(root, candidate))) ?? null;
}

/**
 * Sirve un archivo estático. Si es una miniatura que todavía no se ha
 * generado, responde con la portada original en lugar de un 404: así los
 * clientes no reciben un error (ni gastan una segunda petición) por
 * miniaturas pendientes de generar. La respuesta de respaldo va sin caché
 * para que, en cuanto el rescan genere la miniatura, se pida de nuevo.
 */
export function sendStaticFile(
    res: Response,
    root: string,
    relativePath: string,
    alreadyFellBack = false
): void {
    res.sendFile(relativePath, {root}, (err?: Error) => {
        if (!err) return;

        if (res.headersSent) {
            res.end();
            return;
        }

        const fallback = alreadyFellBack ? null : originalPathForThumbnail(relativePath, root);

        if (fallback) {
            res.setHeader("Cache-Control", "no-cache");
            sendStaticFile(res, root, fallback, true);
            return;
        }

        res.sendStatus(404);
    });
}
