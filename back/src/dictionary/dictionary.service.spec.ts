import {promises as fs} from "fs";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {kanjiBeginning, readingBeginning, setup as setupJmdict} from "jmdict-simplified-node";
import {DictionaryService} from "./dictionary.service";

jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn()
    }
}));

jest.mock("jmdict-simplified-node", () => ({
    setup: jest.fn(),
    readingBeginning: jest.fn(),
    kanjiBeginning: jest.fn()
}));

describe("DictionaryService", () => {
    const readFileMock = fs.readFile as jest.Mock;
    const setupMock = setupJmdict as jest.MockedFunction<typeof setupJmdict>;
    const readingBeginningMock = readingBeginning as jest.MockedFunction<typeof readingBeginning>;
    const kanjiBeginningMock = kanjiBeginning as jest.MockedFunction<typeof kanjiBeginning>;
    const db = {} as never;

    beforeEach(() => {
        jest.clearAllMocks();
        readFileMock.mockResolvedValue("{}");
        setupMock.mockResolvedValue({db, dictDate:"", version:""});
        readingBeginningMock.mockResolvedValue([]);
        kanjiBeginningMock.mockResolvedValue([]);
    });

    it("espera a que JMDict termine de cargarse en la primera consulta", async() => {
        const service = new DictionaryService();

        await expect(service.getDb()).resolves.toBe(db);
        expect(setupMock).toHaveBeenCalledTimes(1);
    });

    it("funciona sin los diccionarios auxiliares de frecuencia y tono", async() => {
        readFileMock.mockRejectedValue(Object.assign(new Error("missing"), {code:"ENOENT"}));
        const service = new DictionaryService();

        await expect(service.getDb()).resolves.toBe(db);
    });

    it("devuelve una lista vacía cuando no encuentra ninguna definición", async() => {
        const service = new DictionaryService();

        await expect(service.searchByWord("未登録語")).resolves.toEqual([]);
    });

    it("mantiene la deconjugación histórica al usar las reglas compartidas", () => {
        const service = new DictionaryService();
        const expected = new Map([
            ["食べました", "食べる"],
            ["食べない", "食べる"],
            ["行った", "行く"],
            ["飲んでいる", "飲むうる"],
            ["食べさせられました", "食べるいせるられる"],
            ["見ました", "見る"],
            ["しない", "する"],
            ["した", "する"],
            ["来た", "来る"],
            ["食べさせる", "食べるする"],
            ["行きます", "行くる"]
        ]);

        expected.forEach((output, input) => {
            expect(service.convertKana(input)).toBe(output);
        });
    });

    it("usa la fuente compartida ordenada de 568 reglas", () => {
        const resource = JSON.parse(
            readFileSync(join(__dirname, "../utils/deinflection-rules.json"), "utf8"),
        ) as {version:number; rules:unknown[]};

        expect(resource.version).toBe(1);
        expect(resource.rules).toHaveLength(568);
    });
});
