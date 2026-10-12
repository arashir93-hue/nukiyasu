import {mkdtemp, mkdir, rm, stat, writeFile} from "fs/promises";
import {tmpdir} from "os";
import {join} from "path";
import {getThumbnailVersion, thumbnailRelativePath} from "./thumbnail";

describe("thumbnail versions", () => {
    let root:string;

    beforeEach(async() => {
        root = await mkdtemp(join(tmpdir(), "nukiyasu-thumbnail-"));
    });

    afterEach(async() => {
        await rm(root, {recursive:true, force:true});
    });

    it("returns null while the generated thumbnail does not exist", async() => {
        await expect(getThumbnailVersion(root, "mangas/AIR/AIRV01/001.jpg")).resolves.toBeNull();
    });

    it("changes when the generated thumbnail changes", async() => {
        const source = "mangas/AIR/AIRV01/001.jpg";
        const target = join(root, thumbnailRelativePath(source));
        await mkdir(join(target, ".."), {recursive:true});
        await writeFile(target, "old");

        const first = await getThumbnailVersion(root, source);
        expect(first).not.toBeNull();
        await expect(getThumbnailVersion(root, source)).resolves.toBe(first);

        await new Promise((resolve) => setTimeout(resolve, 5));
        await writeFile(target, "new-content");

        const second = await getThumbnailVersion(root, source);
        expect(second).not.toBe(first);
        expect((await stat(target)).size).toBeGreaterThan(3);
    });
});
