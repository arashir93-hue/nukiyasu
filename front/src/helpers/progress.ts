import {api} from "../api/api";
import {Book, BookProgress} from "../types/book";
import {invalidateProgress} from "../lib/invalidate";
import {deleteBookBookmark} from "./ttu";

export async function createProgress(bookData:Book, page?:number, time?:number, characters?:number, doublePages?:boolean,
    ttuId?:number, keepAlive = false):Promise<void> {
    const paramsString = window.location.search;
    const searchParams = new URLSearchParams(paramsString);

    if (searchParams.has("private")) {
        if (bookData.variant === "novela") {
            await deleteBookBookmark(ttuId);
        }
        return;
    }

    if (((bookData.variant === "manga" || bookData.mokured) && (page && page <= 1)) || (bookData.variant === "novela" && characters === 0)) {
        return;
    }

    let currentPage = page;
    if (currentPage) {
        if (currentPage > bookData.pages || (currentPage === bookData.pages - 1 && doublePages)) {
            currentPage = bookData.pages;
        }
    }

    const newProgress:BookProgress = {
        book:bookData._id,
        time,
        currentPage:currentPage,
        status:"unread",
        characters:characters
    };

    if ((bookData.variant === "manga" || bookData.mokured) && currentPage) {
        if (bookData.pages <= currentPage) {
        // Libro terminado
            newProgress.status = "completed";
            newProgress.endDate = new Date();
        } else if (currentPage > 0) {

            // progreso normal
            newProgress.status = "reading";
        }
    }

    if (bookData.variant === "novela") {
        if ((characters || 0) >= (bookData.characters || 0) * 0.90) {
            newProgress.status = "completed";
            newProgress.endDate = new Date();
            await deleteBookBookmark(ttuId);
        } else if (characters || 0 > 0) {
            newProgress.status = "reading";
        }
    }

    if ((bookData.variant === "manga" || bookData.mokured) && !page) {
        newProgress.status = "reading";
    }

    await api.post<BookProgress, Book>("readprogress", newProgress, keepAlive);

    // El cronómetro guardado por libro representa la sesión en curso. Una
    // vez terminado el volumen, la siguiente apertura debe empezar una nueva
    // lectura y no reutilizar el tiempo histórico de este progreso.
    if (newProgress.status === "completed") {
        window.localStorage.removeItem(bookData._id);
    }

    // Marca como obsoletas las listas que muestran progreso para que se refresquen
    // la próxima vez que se monten (evita refetches continuos mientras se lee)
    invalidateProgress();
}

/**
 * Starts a new active reading session after the latest progress was
 * completed.  The backend keeps an existing reading/unread progress active,
 * so repeating this request is safe and does not create another session.
 */
export async function beginReadingProgress(bookData:Book):Promise<BookProgress | undefined> {
    // El modo incógnito existente no debe crear ni modificar progreso
    // persistente, tampoco al iniciar una relectura.
    if (new URLSearchParams(window.location.search).has("private")) return undefined;

    return api.post<BookProgress, BookProgress>("readprogress", {
        book:bookData._id,
        status:"reading",
        currentPage:1,
        characters:0
    });
}
