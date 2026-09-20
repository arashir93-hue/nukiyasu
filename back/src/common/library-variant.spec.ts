import {isImageBasedVariant, libraryFolderForVariant} from "./library-variant";

describe("library variants", () => {
    it.each([
        ["manga", "mangas", true],
        ["novela", "novelas", false],
        ["doujinshi", "doujinshi", true]
    ] as const)("resuelve %s como %s", (variant, folder, imageBased) => {
        expect(libraryFolderForVariant(variant)).toBe(folder);
        expect(isImageBasedVariant(variant)).toBe(imageBased);
    });

    it("mantiene doujinshi separado de manga aunque ambos sean de imágenes", () => {
        expect(libraryFolderForVariant("manga")).not.toBe(libraryFolderForVariant("doujinshi"));
    });
});
