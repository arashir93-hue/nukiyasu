import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createGunzip} from "node:zlib";
import {pipeline} from "node:stream/promises";
import {Writable} from "node:stream";
import {lookupEntries, lookupRows, metadataMap, openReadOnly, SCHEMA_VERSION} from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT = join(ROOT, "tools", "dictionary", "dist");

function optionOutput(argv) {
    const index = argv.indexOf("--output-dir");
    if (index === -1) return DEFAULT_OUTPUT;
    const value = argv[index + 1];
    if (!value) throw new Error("Falta el valor de --output-dir");
    return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function gzipInfo(path) {
    const hash = createHash("sha256");
    let bytes = 0;
    await pipeline(
        createReadStream(path),
        createGunzip(),
        new Writable({write(chunk, encoding, callback) {
            hash.update(chunk);
            bytes += chunk.length;
            callback();
        }}),
    );
    return {uncompressedBytes: bytes, uncompressedSha256: hash.digest("hex")};
}

function countRows(db) {
    const count = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    return {
        entryCount: count("entries"),
        kanjiCount: count("kanji"),
        readingCount: count("readings"),
        senseCount: count("senses"),
        glossCount: count("glosses"),
    };
}

function assertEqual(actual, expected, label) {
    if (String(actual) !== String(expected)) throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
}

async function main() {
    const output = optionOutput(process.argv.slice(2));
    const sqlitePath = join(output, "nukiyasu-dictionary.sqlite");
    const gzipPath = join(output, "nukiyasu-dictionary.sqlite.gz");
    const manifestPath = join(output, "nukiyasu-dictionary.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const db = openReadOnly(sqlitePath);
    const metadata = metadataMap(db);
    const quickCheck = db.prepare("PRAGMA quick_check").get().quick_check;
    assertEqual(quickCheck, "ok", "PRAGMA quick_check");
    assertEqual(db.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION, "PRAGMA user_version");

    const counts = countRows(db);
    for (const [key, value] of Object.entries(counts)) {
        assertEqual(value, manifest[key], `recuento ${key}`);
        assertEqual(metadata[key], manifest[key], `metadata ${key}`);
    }
    assertEqual(metadata.schemaVersion, manifest.schemaVersion, "metadata schemaVersion");
    assertEqual(metadata.dictionaryVersion, manifest.dictionaryVersion, "metadata dictionaryVersion");
    assertEqual(metadata.dictionaryDate, manifest.dictionaryDate, "metadata dictionaryDate");
    assertEqual(metadata.generatorVersion, manifest.generatorVersion, "metadata generatorVersion");

    const orphanChecks = {
        kanji: "SELECT COUNT(*) AS count FROM kanji k WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = k.entry_id)",
        readings: "SELECT COUNT(*) AS count FROM readings r WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = r.entry_id)",
        senses: "SELECT COUNT(*) AS count FROM senses s WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = s.entry_id)",
        glosses: "SELECT COUNT(*) AS count FROM glosses g WHERE NOT EXISTS (SELECT 1 FROM senses s WHERE s.id = g.sense_id)",
        lookup: "SELECT COUNT(*) AS count FROM lookup l WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = l.entry_id)",
    };
    for (const [label, query] of Object.entries(orphanChecks)) assertEqual(db.prepare(query).get().count, 0, `huérfanos ${label}`);

    const samples = [
        ["kanji", "食べる"],
        ["kana", "たべる"],
        ["kanji", "行く"],
        ["kanji", "私"],
        ["kanji", "昨日"],
        ["kanji", "寿司"],
    ];
    const sampleResults = samples.map(([kind, query]) => ({
        kind,
        query,
        ids: [...new Set(lookupRows(db, kind, query, 3).map((row) => String(row.entry_id)))],
    }));
    const explain = db.prepare(`EXPLAIN QUERY PLAN
        SELECT entry_id FROM lookup INDEXED BY lookup_prefix_idx
        WHERE kind = ? AND term >= ? AND term < ?
        ORDER BY term, entry_id, source_id LIMIT ?
    `).all("kanji", "食べる", "食べる\u{10ffff}", 3);
    const explainText = explain.map((row) => row.detail).join(" | ");
    if (!/lookup_prefix_idx/i.test(explainText)) throw new Error(`EXPLAIN no utiliza lookup_prefix_idx: ${explainText}`);

    const gzipSize = (await stat(gzipPath)).size;
    assertEqual(gzipSize, manifest.compressedSize, "tamaño gzip");
    const gzip = await gzipInfo(gzipPath);
    assertEqual(gzip.uncompressedBytes, manifest.sqliteSize, "tamaño descomprimido");
    const compressedHash = createHash("sha256").update(await readFile(gzipPath)).digest("hex");
    assertEqual(compressedHash, manifest.sha256, "sha256 gzip");
    db.close();
    const prefixDb = openReadOnly(sqlitePath);
    const prefixExample = lookupEntries(prefixDb, "kanji", "食べる", 3).map((entry) => ({
        id: entry.id,
        firstKanji: entry.kanji[0]?.text,
    }));
    prefixDb.close();

    console.log(JSON.stringify({
        output,
        quickCheck,
        counts,
        samples: sampleResults,
        prefixExample,
        explain,
        gzip: {compressedSize: gzipSize, uncompressedBytes: gzip.uncompressedBytes},
        sha256: manifest.sha256,
    }, null, 2));
}

try {
    await main();
} catch (error) {
    console.error(`Dictionary validation failed: ${error.message}`);
    process.exitCode = 1;
}
