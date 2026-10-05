import {DatabaseSync} from "node:sqlite";

export const SCHEMA_VERSION = 1;
export const GENERATOR_VERSION = "1.0.0";

export const DDL = `
PRAGMA foreign_keys = ON;
PRAGMA page_size = 4096;
PRAGMA user_version = ${SCHEMA_VERSION};
PRAGMA application_id = 0x4E554B31;

CREATE TABLE metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE kanji (
    id INTEGER PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    common INTEGER NOT NULL,
    tags_json TEXT NOT NULL
);

CREATE TABLE readings (
    id INTEGER PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    common INTEGER NOT NULL,
    tags_json TEXT NOT NULL,
    applies_to_kanji_json TEXT NOT NULL
);

CREATE TABLE senses (
    id INTEGER PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    ordinal INTEGER NOT NULL,
    part_of_speech_json TEXT NOT NULL,
    applies_to_kanji_json TEXT NOT NULL,
    applies_to_kana_json TEXT NOT NULL,
    related_json TEXT NOT NULL,
    antonym_json TEXT NOT NULL,
    field_json TEXT NOT NULL,
    dialect_json TEXT NOT NULL,
    misc_json TEXT NOT NULL,
    info_json TEXT NOT NULL,
    language_source_json TEXT NOT NULL
);

CREATE TABLE glosses (
    id INTEGER PRIMARY KEY NOT NULL,
    sense_id INTEGER NOT NULL REFERENCES senses(id),
    ordinal INTEGER NOT NULL,
    lang TEXT NOT NULL,
    type TEXT,
    gender TEXT,
    text TEXT NOT NULL
);

CREATE TABLE lookup (
    id INTEGER PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('kanji', 'kana')),
    term TEXT NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    source_id INTEGER NOT NULL
);

CREATE UNIQUE INDEX lookup_unique ON lookup(kind, term, entry_id, source_id);
CREATE INDEX lookup_prefix_idx ON lookup(kind, term, entry_id, source_id);
CREATE INDEX kanji_entry_order_idx ON kanji(entry_id, ordinal);
CREATE INDEX readings_entry_order_idx ON readings(entry_id, ordinal);
CREATE INDEX senses_entry_order_idx ON senses(entry_id, ordinal);
CREATE INDEX glosses_sense_order_idx ON glosses(sense_id, ordinal);

CREATE TABLE frequency (
    id INTEGER PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    reading TEXT NOT NULL,
    rank TEXT NOT NULL
);
CREATE INDEX frequency_entry_reading_idx ON frequency(entry_id, reading);

CREATE TABLE pitch (
    id INTEGER PRIMARY KEY NOT NULL,
    entry_id TEXT NOT NULL REFERENCES entries(id),
    reading TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE INDEX pitch_entry_reading_idx ON pitch(entry_id, reading, position);
`;

export function jsonValue(value) {
    return JSON.stringify(value ?? [], (key, child) => child, 0);
}

export function prefixUpperBound(prefix) {
    return `${prefix}\u{10ffff}`;
}

export function lookupRows(db, kind, prefix, limit = 3) {
    const upperBound = prefixUpperBound(prefix);
    return db.prepare(`
        SELECT entry_id, source_id, term
        FROM lookup INDEXED BY lookup_prefix_idx
        WHERE kind = ? AND term >= ? AND term < ?
        ORDER BY term, entry_id, source_id
        LIMIT ?
    `).all(kind, prefix, upperBound, limit);
}

function parseJson(value) {
    return JSON.parse(value);
}

export function readEntry(db, entryId) {
    const entry = {id: String(entryId)};
    entry.kanji = db.prepare(`
        SELECT common, text, tags_json
        FROM kanji WHERE entry_id = ? ORDER BY ordinal
    `).all(entryId).map((row) => ({
        common: Boolean(row.common),
        text: row.text,
        tags: parseJson(row.tags_json),
    }));
    entry.kana = db.prepare(`
        SELECT common, text, tags_json, applies_to_kanji_json
        FROM readings WHERE entry_id = ? ORDER BY ordinal
    `).all(entryId).map((row) => ({
        common: Boolean(row.common),
        text: row.text,
        tags: parseJson(row.tags_json),
        appliesToKanji: parseJson(row.applies_to_kanji_json),
    }));
    entry.sense = db.prepare(`
        SELECT id, part_of_speech_json, applies_to_kanji_json,
               applies_to_kana_json, related_json, antonym_json,
               field_json, dialect_json, misc_json, info_json,
               language_source_json
        FROM senses WHERE entry_id = ? ORDER BY ordinal
    `).all(entryId).map((row) => ({
        partOfSpeech: parseJson(row.part_of_speech_json),
        appliesToKanji: parseJson(row.applies_to_kanji_json),
        appliesToKana: parseJson(row.applies_to_kana_json),
        related: parseJson(row.related_json),
        antonym: parseJson(row.antonym_json),
        field: parseJson(row.field_json),
        dialect: parseJson(row.dialect_json),
        misc: parseJson(row.misc_json),
        info: parseJson(row.info_json),
        languageSource: parseJson(row.language_source_json),
        gloss: db.prepare(`
            SELECT lang, type, gender, text FROM glosses
            WHERE sense_id = ? ORDER BY ordinal
        `).all(row.id).map((gloss) => ({
            lang: gloss.lang,
            text: gloss.text,
            ...(gloss.type === null ? {type: null} : {type: gloss.type}),
            ...(gloss.gender === null ? {gender: null} : {gender: gloss.gender}),
        })),
    }));

    const firstForm = entry.kanji[0]?.text ?? entry.kana[0]?.text;
    if (firstForm) {
        const frequency = db.prepare(`
            SELECT rank FROM frequency
            WHERE entry_id = ? AND (reading = ? OR reading = '')
            ORDER BY id LIMIT 1
        `).get(entryId, entry.kana[0]?.text ?? "");
        if (frequency) entry.frequency = frequency.rank;

        const pitches = db.prepare(`
            SELECT position FROM pitch WHERE entry_id = ? ORDER BY id
        `).all(entryId);
        if (pitches.length > 0) entry.pitches = pitches.map((pitch) => ({position: pitch.position}));
    }

    return entry;
}

export function lookupEntries(db, kind, prefix, limit = 3) {
    return lookupRows(db, kind, prefix, limit).map((row) => readEntry(db, row.entry_id));
}

export function openReadOnly(path) {
    return new DatabaseSync(path, {readOnly: true});
}

export function metadataMap(db) {
    return Object.fromEntries(db.prepare("SELECT key, value FROM metadata ORDER BY key").all()
        .map((row) => [row.key, row.value]));
}
