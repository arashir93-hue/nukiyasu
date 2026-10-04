import {parseLibraryStaticPath} from "./staticFiles";

describe("parseLibraryStaticPath artbooks", () => {
    it("resuelve portadas y páginas del árbol de artbooks", () => {
        expect(parseLibraryStaticPath("/artbooks/Artbook A/Vol 01/001.jpg")).toEqual({
            relativePath:"/artbooks/Artbook A/Vol 01/001.jpg",
            variant:"artbook",
            seriePath:"Artbook A"
        });
    });

    it("mantiene el rechazo de rutas peligrosas", () => {
        expect(parseLibraryStaticPath("/artbooks/Artbook A/../secret.jpg")).toBeNull();
    });
});
