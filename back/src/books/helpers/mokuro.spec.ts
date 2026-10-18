import {decideMokuroSync, getReferencedImageFolders} from "./mokuro";

const physical = {
    sourceVersion:"200:40:168",
    pages:168,
    imagesFolder:"v01",
    thumbnailPath:"001.jpg"
};

describe("Mokuro source synchronization", () => {
    it("no conserva como referencia una carpeta cuyo Mokuro está missing", () => {
        const savedBooks = [{
            seriePath:"Serie",
            imagesFolder:"V01",
            format:"mokuro" as const,
            missing:true
        }, {
            seriePath:"Serie",
            imagesFolder:"V02",
            format:"mokuro" as const,
            missing:false
        }];

        const referencedImageFolders = getReferencedImageFolders(savedBooks);

        expect(referencedImageFolders.has("Serie/V01")).toBe(false);
        expect(referencedImageFolders.has("Serie/V02")).toBe(true);
    });

    it("no recalcula un Mokuro sin cambios", () => {
        expect(decideMokuroSync(physical, physical)).toBe("unchanged");
    });

    it("establece una línea base para documentos antiguos con metadatos iguales", () => {
        expect(decideMokuroSync({
            pages:168,
            imagesFolder:"v01",
            thumbnailPath:"001.jpg"
        }, physical)).toBe("baseline");
    });

    it("refresca páginas y OCR cuando cambia el número de imágenes", () => {
        expect(decideMokuroSync({
            ...physical,
            pages:169,
            sourceVersion:"100:40:169"
        }, physical)).toBe("refresh");
    });

    it("refresca OCR aunque el número de imágenes sea igual si cambia el HTML", () => {
        expect(decideMokuroSync({
            ...physical,
            sourceVersion:"100:40:168"
        }, physical)).toBe("refresh");
    });

    it("convierte una copia de imágenes en Mokuro", () => {
        expect(decideMokuroSync({
            ...physical,
            format:"images"
        }, physical)).toBe("refresh");
    });

    it("reactiva un Mokuro missing sin perder su identidad", () => {
        expect(decideMokuroSync({
            ...physical,
            missing:true
        }, physical)).toBe("baseline");
    });
});
