import {promises as fs} from "fs";
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
});
