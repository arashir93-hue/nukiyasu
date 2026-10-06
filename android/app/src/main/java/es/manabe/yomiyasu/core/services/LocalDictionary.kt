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
 * Read-only local JMDict engine. Word lookups use it when the installed
 * dictionary is ready; sentence lookup and saved-word operations remain
 * online-only in DictionaryLookupViewModel.
 */
class LocalDictionary(
    private val dictionaryFile: File,
    private val deinflector: JapaneseDeinflector = JapaneseDeinflector.empty(),
    private val openDataSource: (File) -> LocalDictionaryDataSource =
        AndroidLocalDictionaryDataSource::open,
) {
    companion object {
        const val SUPPORTED_SCHEMA_VERSION = 1
        const val DEFAULT_RELATIVE_PATH = "Yomiyasu/Dictionary/dictionary.sqlite"
        private const val INITIAL_RESULT_LIMIT = 3
        private val NON_JAPANESE = Regex("[^\\u3040-\\u309F\\u30A0-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF]")

        fun fileFor(context: Context): File = File(context.filesDir, DEFAULT_RELATIVE_PATH)

        fun fromContext(context: Context): LocalDictionary = LocalDictionary(
            dictionaryFile = fileFor(context),
            deinflector = JapaneseDeinflector.fromAssets(context.assets),
        )
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

                val normalized = normalizeV1(query)
                if (normalized.isEmpty()) return LocalDictionaryLookupResult.NoResults

                // This intentionally follows DictionaryService.searchByWord:
                // original form, conversion per progressively shorter input,
                // then conversion of the complete normalized form followed by
                // its own progressive reduction.
                val originalResult = searchOriginal(dataSource, normalized)
                if (originalResult != null) return LocalDictionaryLookupResult.Found(listOf(originalResult))

                val converted = deinflector.convert(normalized)
                var convertedPrefix = converted
                for (index in converted.length downTo 0) {
                    val result = lookupDisplay(dataSource, convertedPrefix)
                    if (result != null) {
                        return LocalDictionaryLookupResult.Found(listOf(result))
                    }
                    convertedPrefix = converted.substring(0, index)
                }

                LocalDictionaryLookupResult.NoResults
            }
        } catch (_: Exception) {
            LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.CORRUPT)
        }
    }

    private fun searchOriginal(
        dataSource: LocalDictionaryDataSource,
        normalized: String,
    ): DictionaryDisplay? {
        var prefix = normalized
        for (index in normalized.length downTo 0) {
            val result = lookupDisplay(dataSource, prefix)
            if (result != null && result.words.any { word ->
                    word.kanji.orEmpty().any { it.text == prefix } ||
                        word.kana.orEmpty().any { it.text == prefix }
                }) {
                return result
            }

            val converted = deinflector.convert(prefix)
            lookupDisplay(dataSource, converted)?.let { return it }
            prefix = normalized.substring(0, index)
        }
        return null
    }

    private fun lookupDisplay(
        dataSource: LocalDictionaryDataSource,
        query: String,
    ): DictionaryDisplay? {
        val prefix = query
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
        return words.takeIf { it.isNotEmpty() }?.let {
            DictionaryDisplay(display = prefix, words = it)
        }
    }

    private fun normalizeV1(query: String): String {
        var word = query.replace(NON_JAPANESE, "").trim()
        // The backend comment says ten characters, but the executable code
        // checks >10 and takes the first 15 characters of the raw query.
        if (word.length > 10) word = query.take(15)
        return word
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
