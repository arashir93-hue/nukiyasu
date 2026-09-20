import {isImageBasedVariant, libraryFolderForVariant, nihongoTrackerMediaTypeForVariant} from "./library-variant";

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

    it("mapea variantes locales al tipo externo de NihongoTracker", () => {
        expect(nihongoTrackerMediaTypeForVariant("manga")).toBe("manga");
        expect(nihongoTrackerMediaTypeForVariant("doujinshi")).toBe("manga");
        expect(nihongoTrackerMediaTypeForVariant("novela")).toBe("light-novel");
    });
});
