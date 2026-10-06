package es.manabe.yomiyasu.core.services

import android.database.sqlite.SQLiteDatabase
import java.io.File

interface DictionaryFileValidator {
    fun validate(file: File, manifest: DictionaryManifest): Boolean
    fun isValidInstalled(file: File): Boolean
}

class AndroidDictionaryFileValidator : DictionaryFileValidator {
    override fun validate(file: File, manifest: DictionaryManifest): Boolean {
        if (!file.isFile || file.length() != manifest.sqliteSize) return false
        return runCatching {
            val db = SQLiteDatabase.openDatabase(
                file.absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
            )
            try {
                quickCheck(db) && metadata(db).matchesManifest(manifest)
            } finally {
                db.close()
            }
        }.getOrDefault(false)
    }

    override fun isValidInstalled(file: File): Boolean {
        if (!file.isFile) return false
        return runCatching {
            val db = SQLiteDatabase.openDatabase(
                file.absolutePath,
                null,
                SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
            )
            try {
                quickCheck(db) && metadata(db).let {
                    it["schemaVersion"]?.toIntOrNull() == LocalDictionary.SUPPORTED_SCHEMA_VERSION &&
                        !it["dictionaryVersion"].isNullOrBlank() &&
                        !it["dictionaryDate"].isNullOrBlank() &&
                        !it["generatorVersion"].isNullOrBlank()
                }
            } finally {
                db.close()
            }
        }.getOrDefault(false)
    }

    private fun quickCheck(db: SQLiteDatabase): Boolean = db.rawQuery("PRAGMA quick_check", null).use {
        it.moveToFirst() && it.getString(0).equals("ok", ignoreCase = true)
    }

    private fun metadata(db: SQLiteDatabase): Map<String, String> = buildMap {
        db.rawQuery("SELECT key, value FROM metadata", null).use { cursor ->
            while (cursor.moveToNext()) put(cursor.getString(0), cursor.getString(1))
        }
    }

    private fun Map<String, String>.matchesManifest(manifest: DictionaryManifest): Boolean {
        if (this["schemaVersion"]?.toIntOrNull() != manifest.schemaVersion) return false
        if (this["dictionaryVersion"] != manifest.dictionaryVersion) return false
        if (this["dictionaryDate"] != manifest.dictionaryDate) return false
        if (this["generatorVersion"] != manifest.generatorVersion) return false
        return mapOf(
            "entryCount" to manifest.entryCount,
            "kanjiCount" to manifest.kanjiCount,
            "readingCount" to manifest.readingCount,
            "senseCount" to manifest.senseCount,
            "glossCount" to manifest.glossCount,
        ).all { (key, value) -> this[key] == value.toString() }
    }
}
