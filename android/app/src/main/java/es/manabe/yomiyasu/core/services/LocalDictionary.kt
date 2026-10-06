package es.manabe.yomiyasu.core.services

import android.content.Context
import es.manabe.yomiyasu.core.models.DictionaryDisplay
import es.manabe.yomiyasu.core.models.DictionaryWord
import java.io.File

/** States exposed by the local dictionary without deleting or repairing files. */
enum class LocalDictionaryStatus {
    NOT_INSTALLED,
    READY,
    INCOMPATIBLE,
    CORRUPT,
}

sealed interface LocalDictionaryLookupResult {
    data class Found(val displays: List<DictionaryDisplay>) : LocalDictionaryLookupResult

    data object NoResults : LocalDictionaryLookupResult

    data class Unavailable(val status: LocalDictionaryStatus) : LocalDictionaryLookupResult
}

data class LocalDictionaryLookupRow(
    val entryId: String,
    val sourceId: Long,
    val term: String,
)

/**
 * Small data-source boundary that keeps the lookup engine unit-testable. The
 * production implementation is SQLite and is always opened read-only.
 */
interface LocalDictionaryDataSource : AutoCloseable {
    fun metadata(): Map<String, String>

    fun lookup(kind: String, prefix: String, limit: Int): List<LocalDictionaryLookupRow>

    fun readEntry(entryId: String): DictionaryWord?
}

/**
 * Read-only local JMDict engine. It is deliberately not connected to
 * DictionaryLookupViewModel yet; the online DictionaryApi remains the active
 * source for the application in this phase.
 */
class LocalDictionary(
    private val dictionaryFile: File,
    private val openDataSource: (File) -> LocalDictionaryDataSource =
        AndroidLocalDictionaryDataSource::open,
) {
    companion object {
        const val SUPPORTED_SCHEMA_VERSION = 1
        const val DEFAULT_RELATIVE_PATH = "Yomiyasu/Dictionary/dictionary.sqlite"
        private const val INITIAL_RESULT_LIMIT = 3

        fun fileFor(context: Context): File = File(context.filesDir, DEFAULT_RELATIVE_PATH)
    }

    fun status(): LocalDictionaryStatus {
        if (!dictionaryFile.exists()) return LocalDictionaryStatus.NOT_INSTALLED
        if (!dictionaryFile.isFile) return LocalDictionaryStatus.CORRUPT

        return try {
            openDataSource(dictionaryFile).use { dataSource ->
                validateMetadata(dataSource.metadata())
            }
        } catch (_: Exception) {
            LocalDictionaryStatus.CORRUPT
        }
    }

    fun searchByWord(query: String): LocalDictionaryLookupResult {
        if (query.isBlank()) return LocalDictionaryLookupResult.NoResults
        if (!dictionaryFile.exists()) {
            return LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.NOT_INSTALLED)
        }
        if (!dictionaryFile.isFile) {
            return LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.CORRUPT)
        }

        return try {
            openDataSource(dictionaryFile).use { dataSource ->
                val readiness = validateMetadata(dataSource.metadata())
                if (readiness != LocalDictionaryStatus.READY) {
                    return LocalDictionaryLookupResult.Unavailable(readiness)
                }

                // Keep the same initial cap as DictionaryApi/V1. The backend
                // searches readings first and falls back to kanji only when
                // no reading prefix matches.
                val prefix = query.take(15)
                val readingRows = dataSource.lookup("kana", prefix, INITIAL_RESULT_LIMIT)
                val rows = if (readingRows.isNotEmpty()) {
                    readingRows
                } else {
                    dataSource.lookup("kanji", prefix, INITIAL_RESULT_LIMIT)
                }

                val words = rows
                    .asSequence()
                    .map { it.entryId }
                    .distinct()
                    .mapNotNull(dataSource::readEntry)
                    .toList()

                if (words.isEmpty()) {
                    LocalDictionaryLookupResult.NoResults
                } else {
                    LocalDictionaryLookupResult.Found(
                        listOf(DictionaryDisplay(display = prefix, words = words)),
                    )
                }
            }
        } catch (_: Exception) {
            LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.CORRUPT)
        }
    }

    private fun validateMetadata(metadata: Map<String, String>): LocalDictionaryStatus {
        val schema = metadata["schemaVersion"]?.toIntOrNull()
            ?: return LocalDictionaryStatus.CORRUPT

        if (schema != SUPPORTED_SCHEMA_VERSION) {
            return LocalDictionaryStatus.INCOMPATIBLE
        }

        val required = listOf(
            "dictionaryVersion",
            "dictionaryDate",
            "entryCount",
            "generatorVersion",
        )
        if (required.any { metadata[it].isNullOrBlank() }) {
            return LocalDictionaryStatus.CORRUPT
        }
        if (metadata["entryCount"]?.toLongOrNull() == null) {
            return LocalDictionaryStatus.CORRUPT
        }

        return LocalDictionaryStatus.READY
    }

}
