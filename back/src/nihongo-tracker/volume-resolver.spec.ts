import {detectVolumeNumber, resolveVolumeNumber} from "./volume-resolver";

describe("NihongoTracker volume resolver", ()=>{
    it.each([
        ["oshi v01", 1], ["oshi v02", 2], ["oshi v12", 12], ["oshi V03", 3],
        ["manga v04", 4], ["serie vol05", 5], ["serie vol 06", 6],
        ["serie vol. 07", 7], ["serie Volume 08", 8], ["serie volumen 09", 9],
        ["oshi v08.5", 8.5]
    ])("detects %s as %s", (name, expected)=>{
        expect(detectVolumeNumber(name)).toBe(expected);
    });

    it("does not extract title numbers without a volume marker", ()=>{
        expect(detectVolumeNumber("86 Eighty Six")).toBeUndefined();
        expect(detectVolumeNumber("Monogatari 12")).toBeUndefined();
        expect(detectVolumeNumber("86 Eighty Six v03")).toBe(3);
    });

    it("gives manual overrides absolute priority", ()=>{
        expect(resolveVolumeNumber({sortName:"oshi v04", position:3, override:7})).toEqual({volumeNumber:7, source:"manual"});
    });

    it("keeps gaps when marker detection is available", ()=>{
        const books = ["oshi v01", "oshi v02", "oshi v04"];
        expect(books.map((sortName, index)=>resolveVolumeNumber({sortName, position:index + 1}).volumeNumber)).toEqual([1, 2, 4]);
    });

    it("reports position fallback when no marker is reliable", ()=>{
        expect(resolveVolumeNumber({sortName:"oshi primero", position:3})).toEqual({volumeNumber:3, source:"position"});
    });
});
