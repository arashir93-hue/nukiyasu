package es.manabe.yomiyasu.core.services

import android.database.sqlite.SQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** A small on-device SQLite fixture using the same schema shape as Phase A. */
@RunWith(AndroidJUnit4::class)
class LocalDictionarySqliteTest {

    @Test
    fun `read only adapter performs indexed prefix lookup and reconstructs entry`() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "dictionary-fixture-${System.nanoTime()}.sqlite")
        val writable = SQLiteDatabase.openOrCreateDatabase(file, null)
        try {
            createFixture(writable)
        } finally {
            writable.close()
        }

        try {
            val dictionary = LocalDictionary(file)
            assertEquals(LocalDictionaryStatus.READY, dictionary.status())
            val result = dictionary.searchByWord("たべる")
            assertTrue(result is LocalDictionaryLookupResult.Found)
            val word = (result as LocalDictionaryLookupResult.Found).displays.single().words.single()
            assertEquals("1358280", word.id)
            assertEquals(listOf("食べる"), word.kanji?.map { it.text })
            assertEquals(listOf("to eat"), word.firstGlosses)
        } finally {
            file.delete()
        }
    }

    private fun createFixture(database: SQLiteDatabase) {
        database.execSQL("CREATE TABLE metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
        database.execSQL("CREATE TABLE entries (id TEXT PRIMARY KEY NOT NULL)")
        database.execSQL("""
            CREATE TABLE kanji (
                id INTEGER PRIMARY KEY, entry_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
                text TEXT NOT NULL, common INTEGER NOT NULL, tags_json TEXT NOT NULL
            )
        """.trimIndent())
        database.execSQL("""
            CREATE TABLE readings (
                id INTEGER PRIMARY KEY, entry_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
                text TEXT NOT NULL, common INTEGER NOT NULL, tags_json TEXT NOT NULL,
                applies_to_kanji_json TEXT NOT NULL
            )
        """.trimIndent())
        database.execSQL("""
            CREATE TABLE senses (
                id INTEGER PRIMARY KEY, entry_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
                part_of_speech_json TEXT NOT NULL, applies_to_kanji_json TEXT NOT NULL,
                applies_to_kana_json TEXT NOT NULL, related_json TEXT NOT NULL,
                antonym_json TEXT NOT NULL, field_json TEXT NOT NULL,
                dialect_json TEXT NOT NULL, misc_json TEXT NOT NULL,
                info_json TEXT NOT NULL, language_source_json TEXT NOT NULL
            )
        """.trimIndent())
        database.execSQL("""
            CREATE TABLE glosses (
                id INTEGER PRIMARY KEY, sense_id INTEGER NOT NULL, ordinal INTEGER NOT NULL,
                lang TEXT NOT NULL, text TEXT NOT NULL
            )
        """.trimIndent())
        database.execSQL("""
            CREATE TABLE lookup (
                id INTEGER PRIMARY KEY, kind TEXT NOT NULL, term TEXT NOT NULL,
                entry_id TEXT NOT NULL, source_id INTEGER NOT NULL
            )
        """.trimIndent())
        database.execSQL("CREATE INDEX lookup_prefix_idx ON lookup(kind, term, entry_id, source_id)")
        database.execSQL("CREATE TABLE frequency (id INTEGER PRIMARY KEY, entry_id TEXT, reading TEXT, rank TEXT)")
        database.execSQL("CREATE TABLE pitch (id INTEGER PRIMARY KEY, entry_id TEXT, reading TEXT, position INTEGER)")

        listOf(
            "schemaVersion" to "1",
            "dictionaryVersion" to "3.6.2",
            "dictionaryDate" to "2026-09-28",
            "entryCount" to "1",
            "generatorVersion" to "1.0.0",
        ).forEach { (key, value) ->
            database.execSQL("INSERT INTO metadata(key, value) VALUES(?, ?)", arrayOf(key, value))
        }
        database.execSQL("INSERT INTO entries(id) VALUES(?)", arrayOf("1358280"))
        database.execSQL(
            "INSERT INTO kanji(id, entry_id, ordinal, text, common, tags_json) VALUES(?, ?, ?, ?, ?, ?)",
            arrayOf<Any?>(1, "1358280", 0, "食べる", 1, "[]"),
        )
        database.execSQL(
            "INSERT INTO readings(id, entry_id, ordinal, text, common, tags_json, applies_to_kanji_json) VALUES(?, ?, ?, ?, ?, ?, ?)",
            arrayOf<Any?>(1, "1358280", 0, "たべる", 1, "[]", "[]"),
        )
        database.execSQL(
            "INSERT INTO senses(id, entry_id, ordinal, part_of_speech_json, applies_to_kanji_json, applies_to_kana_json, related_json, antonym_json, field_json, dialect_json, misc_json, info_json, language_source_json) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            arrayOf<Any?>(1, "1358280", 0, "[\"v1\"]", "[]", "[]", "[]", "[]", "[]", "[]", "[]", "[]", "[]"),
        )
        database.execSQL(
            "INSERT INTO glosses(id, sense_id, ordinal, lang, text) VALUES(?, ?, ?, ?, ?)",
            arrayOf<Any?>(1, 1, 0, "eng", "to eat"),
        )
        database.execSQL(
            "INSERT INTO lookup(id, kind, term, entry_id, source_id) VALUES(?, ?, ?, ?, ?)",
            arrayOf<Any?>(1, "kana", "たべる", "1358280", 0),
        )
    }
}
