import {createHash} from "node:crypto";
import {createReadStream, createWriteStream} from "node:fs";
import {access, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createGzip, createGunzip} from "node:zlib";
import {pipeline} from "node:stream/promises";
import {Writable} from "node:stream";
import {DatabaseSync} from "node:sqlite";
import {
    DDL,
    GENERATOR_VERSION,
    SCHEMA_VERSION,
    jsonValue,
} from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SOURCE = join(ROOT, "dicts", "jmdict-eng-3.5.0.json");
const DEFAULT_FREQUENCY = join(ROOT, "dicts", "frequency.json");
const DEFAULT_PITCH = join(ROOT, "dicts", "pitch.json");
const DEFAULT_OUTPUT = join(ROOT, "tools", "dictionary", "dist");
const OUTPUT_NAMES = [
    "nukiyasu-dictionary.sqlite",
    "nukiyasu-dictionary.sqlite.gz",
    "nukiyasu-dictionary.json",
];

function usage() {
    console.log(`Usage: node tools/dictionary/generate.mjs [options]

Options:
  --source <path>       JMDict-Simplified JSON (default: dicts/jmdict-eng-3.5.0.json)
  --frequency <path>    Optional frequency.json
  --pitch <path>        Optional pitch.json
  --output-dir <path>  Output directory (default: tools/dictionary/dist)
  --help                Show this help

Requires Node.js 22.5 or newer for node:sqlite.`);
}

function parseOptions(argv) {
    const options = {source: DEFAULT_SOURCE, outputDir: DEFAULT_OUTPUT, frequency: null, pitch: null};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--help") return {help: true};
        if (!["--source", "--frequency", "--pitch", "--output-dir"].includes(argument)) {
            throw new Error(`Argumento desconocido: ${argument}`);
        }
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}`);
        const resolved = isAbsolute(value) ? value : resolve(process.cwd(), value);
        if (argument === "--source") options.source = resolved;
        if (argument === "--frequency") options.frequency = resolved;
        if (argument === "--pitch") options.pitch = resolved;
        if (argument === "--output-dir") options.outputDir = resolved;
        index += 1;
    }
    return options;
}

async function optionalJson(path, label) {
    if (!path) return null;
    try {
        await access(path);
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        throw new Error(`No se pudo leer ${label} (${path}): ${error.message}`);
    }
}

function countsOf(dictionary) {
    return dictionary.words.reduce((counts, word) => {
        counts.kanjiCount += word.kanji.length;
        counts.readingCount += word.kana.length;
        counts.senseCount += word.sense.length;
        counts.glossCount += word.sense.reduce((sum, sense) => sum + sense.gloss.length, 0);
        return counts;
    }, {
        entryCount: dictionary.words.length,
        kanjiCount: 0,
        readingCount: 0,
        senseCount: 0,
        glossCount: 0,
    });
}

async function gzipFile(inputPath, outputPath) {
    const output = createWriteStream(outputPath);
    await pipeline(
        createReadStream(inputPath),
        createGzip({level: 9, mtime: 0}),
        output,
    );
    const hash = createHash("sha256");
    let bytes = 0;
    await pipeline(
        createReadStream(outputPath),
        new Writable({write(chunk, encoding, callback) {
            hash.update(chunk);
            bytes += chunk.length;
            callback();
        }}),
    );
    return {bytes, sha256: hash.digest("hex")};
}

async function validateGzip(path, expectedBytes) {
    let bytes = 0;
    await pipeline(
        createReadStream(path),
        createGunzip(),
        new Writable({write(chunk, encoding, callback) {
            bytes += chunk.length;
            callback();
        }}),
    );
    if (bytes !== expectedBytes) {
        throw new Error(`El gzip se descomprime a ${bytes} bytes, se esperaban ${expectedBytes}`);
    }
}

function setMetadata(db, values) {
    const statement = db.prepare("INSERT INTO metadata(key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(values)) statement.run(key, String(value));
}

function optionalRowsForWord(data, headword, word) {
    const value = data?.[headword];
    if (!value) return [];
    const rows = Array.isArray(value) ? value : [value];
    if (rows.length === 1) return rows;
    return rows.filter((row) => row.reading === word.kana[0]?.text);
}

function insertOptionalData(db, dictionary, frequency, pitch, idsByHeadword) {
    let frequencyId = 1;
    let pitchId = 1;
    const insertFrequency = db.prepare("INSERT INTO frequency(id, entry_id, reading, rank) VALUES (?, ?, ?, ?)");
    const insertPitch = db.prepare("INSERT INTO pitch(id, entry_id, reading, position) VALUES (?, ?, ?, ?)");

    for (const word of dictionary.words) {
        const headword = word.kanji[0]?.text ?? word.kana[0]?.text;
        if (!headword) continue;
        const entries = (idsByHeadword.get(headword) ?? []).filter((entry) => entry.id === String(word.id));
        for (const row of optionalRowsForWord(frequency, headword, word)) {
            for (const entry of entries) insertFrequency.run(frequencyId++, entry.id, entry.word.kana[0]?.text ?? "", String(row.freq));
        }
        for (const row of optionalRowsForWord(pitch, headword, word)) {
            for (const entry of entries) {
                for (const pitchValue of row.pitches ?? []) insertPitch.run(pitchId++, entry.id, entry.word.kana[0]?.text ?? "", Number(pitchValue.position));
            }
        }
    }
}

function createSchema(db) {
    db.exec(DDL);
    db.exec("BEGIN");
}

function insertDictionary(db, dictionary) {
    const insertEntry = db.prepare("INSERT INTO entries(id) VALUES (?)");
    const insertKanji = db.prepare("INSERT INTO kanji(id, entry_id, ordinal, text, common, tags_json) VALUES (?, ?, ?, ?, ?, ?)");
    const insertReading = db.prepare("INSERT INTO readings(id, entry_id, ordinal, text, common, tags_json, applies_to_kanji_json) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertSense = db.prepare(`INSERT INTO senses(
        id, entry_id, ordinal, part_of_speech_json, applies_to_kanji_json,
        applies_to_kana_json, related_json, antonym_json, field_json,
        dialect_json, misc_json, info_json, language_source_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertGloss = db.prepare("INSERT INTO glosses(id, sense_id, ordinal, lang, type, gender, text) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insertLookup = db.prepare("INSERT INTO lookup(id, kind, term, entry_id, source_id) VALUES (?, ?, ?, ?, ?)");
    const idsByHeadword = new Map();
    let kanjiId = 1;
    let readingId = 1;
    let senseId = 1;
    let glossId = 1;
    let lookupId = 1;

    for (const word of dictionary.words) {
        const entryId = String(word.id);
        insertEntry.run(entryId);
        for (const [ordinal, item] of word.kanji.entries()) {
            insertKanji.run(kanjiId, entryId, ordinal, item.text, item.common ? 1 : 0, jsonValue(item.tags));
            insertLookup.run(lookupId++, "kanji", item.text, entryId, kanjiId);
            kanjiId += 1;
        }
        for (const [ordinal, item] of word.kana.entries()) {
            insertReading.run(readingId, entryId, ordinal, item.text, item.common ? 1 : 0, jsonValue(item.tags), jsonValue(item.appliesToKanji));
            insertLookup.run(lookupId++, "kana", item.text, entryId, readingId);
            readingId += 1;
        }
        for (const [ordinal, sense] of word.sense.entries()) {
            insertSense.run(
                senseId,
                entryId,
                ordinal,
                jsonValue(sense.partOfSpeech),
                jsonValue(sense.appliesToKanji),
                jsonValue(sense.appliesToKana),
                jsonValue(sense.related),
                jsonValue(sense.antonym),
                jsonValue(sense.field),
                jsonValue(sense.dialect),
                jsonValue(sense.misc),
                jsonValue(sense.info),
                jsonValue(sense.languageSource),
            );
            for (const [glossOrdinal, gloss] of sense.gloss.entries()) {
                insertGloss.run(glossId++, senseId, glossOrdinal, gloss.lang, gloss.type ?? null, gloss.gender ?? null, gloss.text);
            }
            senseId += 1;
        }
        const headword = word.kanji[0]?.text ?? word.kana[0]?.text;
        if (headword) {
            if (!idsByHeadword.has(headword)) idsByHeadword.set(headword, []);
            idsByHeadword.get(headword).push({id: entryId, word});
        }
    }
    db.exec("COMMIT");
    return idsByHeadword;
}

async function replaceOutputs(staging, outputDir) {
    await mkdir(outputDir, {recursive: true});
    const backup = join(outputDir, `.backup-${process.pid}-${Date.now()}`);
    await mkdir(backup);
    const movedOld = [];
    const movedNew = [];
    try {
        for (const name of OUTPUT_NAMES) {
            const target = join(outputDir, name);
            try {
                await rename(target, join(backup, name));
                movedOld.push(name);
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
        for (const name of OUTPUT_NAMES) {
            await rename(join(staging, name), join(outputDir, name));
            movedNew.push(name);
        }
        await rm(backup, {recursive: true, force: true});
        await rm(staging, {recursive: true, force: true});
    } catch (error) {
        for (const name of movedNew) await rm(join(outputDir, name), {force: true});
        for (const name of movedOld) {
            try { await rename(join(backup, name), join(outputDir, name)); } catch { /* best effort restore */ }
        }
        await rm(backup, {recursive: true, force: true});
        throw error;
    }
}

export async function generateDictionary({source = DEFAULT_SOURCE, frequency = null, pitch = null, outputDir = DEFAULT_OUTPUT} = {}) {
    const started = performance.now();
    const sourceData = JSON.parse(await readFile(source, "utf8"));
    if (!sourceData || !Array.isArray(sourceData.words) || typeof sourceData.version !== "string" || typeof sourceData.dictDate !== "string") {
        throw new Error("La fuente no parece un JMDict-Simplified válido (faltan words, version o dictDate)");
    }
    const frequencyData = await optionalJson(frequency ?? DEFAULT_FREQUENCY, "frequency.json");
    const pitchData = await optionalJson(pitch ?? DEFAULT_PITCH, "pitch.json");
    const counts = countsOf(sourceData);
    const staging = join(outputDir, `.staging-${process.pid}-${Date.now()}`);
    await rm(staging, {recursive: true, force: true});
    await mkdir(staging, {recursive: true});
    const sqlitePath = join(staging, OUTPUT_NAMES[0]);
    const gzipPath = join(staging, OUTPUT_NAMES[1]);
    const manifestPath = join(staging, OUTPUT_NAMES[2]);

    try {
        const db = new DatabaseSync(sqlitePath);
        createSchema(db);
        const idsByHeadword = insertDictionary(db, sourceData);
        db.exec("BEGIN");
        insertOptionalData(db, sourceData, frequencyData, pitchData, idsByHeadword);
        setMetadata(db, {
            schemaVersion: SCHEMA_VERSION,
            dictionaryVersion: sourceData.version,
            dictionaryDate: sourceData.dictDate,
            entryCount: counts.entryCount,
            kanjiCount: counts.kanjiCount,
            readingCount: counts.readingCount,
            senseCount: counts.senseCount,
            glossCount: counts.glossCount,
            generatorVersion: GENERATOR_VERSION,
            frequency: Boolean(frequencyData),
            pitch: Boolean(pitchData),
        });
        db.exec("COMMIT");
        db.exec("VACUUM");
        db.close();

        const sqliteSize = (await stat(sqlitePath)).size;
        const compressed = await gzipFile(sqlitePath, gzipPath);
        await validateGzip(gzipPath, sqliteSize);

        const generationTimeMs = Math.round(performance.now() - started);
        const manifest = {
            schemaVersion: SCHEMA_VERSION,
            dictionaryVersion: sourceData.version,
            dictionaryDate: sourceData.dictDate,
            generatorVersion: GENERATOR_VERSION,
            sourceFile: basename(source),
            entryCount: counts.entryCount,
            kanjiCount: counts.kanjiCount,
            readingCount: counts.readingCount,
            senseCount: counts.senseCount,
            glossCount: counts.glossCount,
            sqliteSize,
            compressedSize: compressed.bytes,
            sha256: compressed.sha256,
            asset: OUTPUT_NAMES[1],
            generationTimeMs,
            features: {
                frequency: Boolean(frequencyData),
                pitch: Boolean(pitchData),
            },
        };
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        await replaceOutputs(staging, outputDir);
        return manifest;
    } catch (error) {
        await rm(staging, {recursive: true, force: true});
        throw error;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    try {
        const options = parseOptions(process.argv.slice(2));
        if (options.help) usage();
        else {
            const manifest = await generateDictionary(options);
            console.log(JSON.stringify(manifest, null, 2));
        }
    } catch (error) {
        console.error(`Dictionary generation failed: ${error.message}`);
        process.exitCode = 1;
    }
}
