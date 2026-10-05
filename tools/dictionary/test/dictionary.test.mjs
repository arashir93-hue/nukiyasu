import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {generateDictionary} from "../generate.mjs";
import {lookupEntries, lookupRows, metadataMap, openReadOnly, readEntry} from "../lib.mjs";

const DIRECTORY = fileURLToPath(new URL("../dist/", import.meta.url));
const SQLITE = join(DIRECTORY, "nukiyasu-dictionary.sqlite");
const MANIFEST = join(DIRECTORY, "nukiyasu-dictionary.json");
const SOURCE = fileURLToPath(new URL("../../../dicts/jmdict-eng-3.5.0.json", import.meta.url));

function open() {
    return openReadOnly(SQLITE);
}

test("el artefacto generado conserva metadata y recuentos JMDict", async() => {
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
    const db = open();
    const metadata = metadataMap(db);
    assert.equal(metadata.schemaVersion, String(manifest.schemaVersion));
    assert.equal(metadata.dictionaryVersion, manifest.dictionaryVersion);
    assert.equal(Number(metadata.entryCount), 218840);
    assert.equal(Number(metadata.kanjiCount), 233551);
    assert.equal(Number(metadata.readingCount), 265734);
    assert.equal(Number(metadata.senseCount), 253693);
    assert.equal(Number(metadata.glossCount), 443485);
    assert.equal(metadata.frequency, "false");
    assert.equal(metadata.pitch, "false");
    assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
    db.close();
});

test("incorpora frequency y pitch cuando los ficheros opcionales existen", async() => {
    const directory = await mkdtemp(join(process.env.TEMP ?? process.cwd(), "nukiyasu-dictionary-test-"));
    try {
        const sourcePath = join(directory, "jmdict.json");
        const frequencyPath = join(directory, "frequency.json");
        const pitchPath = join(directory, "pitch.json");
        await writeFile(sourcePath, JSON.stringify({
            version: "test",
            dictDate: "2026-01-01",
            words: [{
                id: "1",
                kanji: [{common: true, text: "食べる", tags: []}],
                kana: [{common: true, text: "たべる", tags: [], appliesToKanji: ["*"]}],
                sense: [{
                    partOfSpeech: ["v1"], appliesToKanji: ["*"], appliesToKana: ["*"],
                    related: [], antonym: [], field: [], dialect: [], misc: [], info: [],
                    languageSource: [], gloss: [{lang: "eng", gender: null, type: null, text: "to eat"}],
                }],
            }],
        }), "utf8");
        await writeFile(frequencyPath, JSON.stringify({"食べる": [{reading: "たべる", freq: "10"}]}), "utf8");
        await writeFile(pitchPath, JSON.stringify({"食べる": {reading: "たべる", pitches: [{position: 2}]}}), "utf8");
        const manifest = await generateDictionary({source: sourcePath, frequency: frequencyPath, pitch: pitchPath, outputDir: directory});
        assert.equal(manifest.features.frequency, true);
        assert.equal(manifest.features.pitch, true);
        const db = openReadOnly(join(directory, "nukiyasu-dictionary.sqlite"));
        try {
            const entry = readEntry(db, "1");
            assert.equal(entry.frequency, "10");
            assert.deepEqual(entry.pitches, [{position: 2}]);
        } finally {
            db.close();
        }
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test("las búsquedas kanji y kana usan el índice de prefijo", () => {
    const db = open();
    const cases = [
        ["kanji", "食べる", "1358280"],
        ["kana", "たべる", "1358280"],
        ["kanji", "行く", "1578850"],
        ["kanji", "私", "1311110"],
        ["kanji", "昨日", "1579260"],
        ["kanji", "寿司", "1595650"],
    ];
    for (const [kind, query, expectedId] of cases) {
        assert.ok(lookupRows(db, kind, query, 3).some((row) => String(row.entry_id) === expectedId), `${kind} ${query}`);
    }
    const plan = db.prepare(`EXPLAIN QUERY PLAN
        SELECT entry_id FROM lookup INDEXED BY lookup_prefix_idx
        WHERE kind = ? AND term >= ? AND term < ?
        ORDER BY term, entry_id, source_id LIMIT ?
    `).all("kanji", "食べる", "食べる\u{10ffff}", 3);
    assert.ok(plan.some((row) => /lookup_prefix_idx/i.test(row.detail)));
    db.close();
});

test("conserva la semántica de prefijo del backend", () => {
    const db = open();
    const entries = lookupEntries(db, "kanji", "食べる", 3);
    assert.ok(entries.some((entry) => entry.id === "1358280"));
    assert.ok(entries.some((entry) => entry.id === "2847337"));
    db.close();
});

test("las entradas representativas conservan campos JMDict relevantes", async() => {
    const source = JSON.parse(await readFile(SOURCE, "utf8"));
    const db = open();
    for (const id of ["1358280", "1578850", "1595650"]) {
        const expected = source.words.find((word) => word.id === id);
        const actual = db.prepare("SELECT id FROM entries WHERE id = ?").get(id);
        assert.ok(expected && actual);
        const entry = lookupEntries(db, "kanji", expected.kanji[0]?.text ?? expected.kana[0].text, 3)
            .find((candidate) => candidate.id === id);
        assert.deepEqual(entry.kanji, expected.kanji);
        assert.deepEqual(entry.kana, expected.kana);
        assert.deepEqual(entry.sense, expected.sense);
    }
    db.close();
});
