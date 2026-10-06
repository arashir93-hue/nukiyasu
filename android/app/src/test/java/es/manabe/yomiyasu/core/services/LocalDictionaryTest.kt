package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.models.DictionaryDisplay
import es.manabe.yomiyasu.core.models.DictionaryGloss
import es.manabe.yomiyasu.core.models.DictionaryKanji
import es.manabe.yomiyasu.core.models.DictionaryKana
import es.manabe.yomiyasu.core.models.DictionarySense
import es.manabe.yomiyasu.core.models.DictionaryWord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class LocalDictionaryTest {

    @Test
    fun `missing file is not installed`() {
        val file = Files.createTempDirectory("local-dictionary-missing").resolve("dictionary.sqlite").toFile()
        val dictionary = LocalDictionary(file) { error("must not open a missing file") }

        assertEquals(LocalDictionaryStatus.NOT_INSTALLED, dictionary.status())
        assertEquals(
            LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.NOT_INSTALLED),
            dictionary.searchByWord("食べる"),
        )
        file.parentFile?.deleteRecursively()
    }

    @Test
    fun `schema and required metadata produce ready`() {
        val fixture = fixtureFile("ready")
        val dictionary = LocalDictionary(fixture) { FakeDataSource() }

        assertEquals(LocalDictionaryStatus.READY, dictionary.status())
        fixture.parentFile?.deleteRecursively()
    }

    @Test
    fun `unknown schema is incompatible and malformed sqlite is corrupt`() {
        val incompatibleFile = fixtureFile("incompatible")
        val incompatible = LocalDictionary(incompatibleFile) {
            FakeDataSource(metadata = validMetadata + ("schemaVersion" to "2"))
        }
        assertEquals(LocalDictionaryStatus.INCOMPATIBLE, incompatible.status())

        val corruptFile = fixtureFile("corrupt")
        val corrupt = LocalDictionary(corruptFile) { error("sqlite is corrupt") }
        assertEquals(LocalDictionaryStatus.CORRUPT, corrupt.status())

        incompatibleFile.parentFile?.deleteRecursively()
    }

    @Test
    fun `missing required metadata is corrupt`() {
        val fixture = fixtureFile("missing-metadata")
        val metadata = validMetadata - "dictionaryDate"
        val dictionary = LocalDictionary(fixture) { FakeDataSource(metadata = metadata) }

        assertEquals(LocalDictionaryStatus.CORRUPT, dictionary.status())
        assertEquals(
            LocalDictionaryLookupResult.Unavailable(LocalDictionaryStatus.CORRUPT),
            dictionary.searchByWord("食べる"),
        )
        fixture.parentFile?.deleteRecursively()
    }

    @Test
    fun `kana lookup uses prefix, limit, ordering and deduplicates entry ids`() {
        val fixture = fixtureFile("kana")
        val dataSource = FakeDataSource(
            lookupRows = mapOf(
                "kana|たべる" to listOf(
                    LocalDictionaryLookupRow("1358280", 0, "たべる"),
                    LocalDictionaryLookupRow("1358280", 1, "たべる"),
                    LocalDictionaryLookupRow("2847337", 0, "たべるラー油"),
                ),
            ),
            entries = linkedMapOf("1358280" to entry("1358280", "食べる"), "2847337" to entry("2847337", "食べるラー油")),
        )
        val result = LocalDictionary(fixture) { dataSource }.searchByWord("たべる")

        assertEquals(
            listOf("1358280", "2847337"),
            foundWords(result).map { it.id },
        )
        assertEquals("たべる", foundDisplay(result).display)
        assertEquals(3, dataSource.lastLimit)
        assertEquals(listOf("kana|たべる"), dataSource.calls)
        fixture.parentFile?.deleteRecursively()
    }

    @Test
    fun `kanji lookup is used only when kana has no rows and keeps prefix matches`() {
        val fixture = fixtureFile("kanji")
        val dataSource = FakeDataSource(
            lookupRows = mapOf(
                "kana|行く" to emptyList(),
                "kanji|行く" to listOf(
                    LocalDictionaryLookupRow("1578850", 0, "行く"),
                    LocalDictionaryLookupRow("2827861", 0, "行く"),
                    LocalDictionaryLookupRow("1282180", 0, "行く"),
                ),
            ),
            entries = linkedMapOf(
                "1578850" to entry("1578850", "行く"),
                "2827861" to entry("2827861", "行く"),
                "1282180" to entry("1282180", "行く"),
            ),
        )
        val result = LocalDictionary(fixture) { dataSource }.searchByWord("行く")

        assertEquals(listOf("1578850", "2827861", "1282180"), foundWords(result).map { it.id })
        assertEquals(listOf("kana|行く", "kanji|行く"), dataSource.calls)
        fixture.parentFile?.deleteRecursively()
    }

    @Test
    fun `reconstruction preserves kanji readings senses and gloss order`() {
        val fixture = fixtureFile("ordering")
        val original = DictionaryWord(
            id = "1311110",
            kanji = listOf(
                DictionaryKanji(common = true, text = "私", tags = listOf("tag-1")),
                DictionaryKanji(common = false, text = "わたくし", tags = emptyList()),
            ),
            kana = listOf(
                DictionaryKana(common = true, text = "わたし", tags = listOf("reading-tag"), appliesToKanji = listOf("私")),
                DictionaryKana(common = false, text = "わたくし", tags = emptyList(), appliesToKanji = emptyList()),
            ),
            sense = listOf(
                DictionarySense(
                    partOfSpeech = listOf("n"),
                    appliesToKanji = listOf("私"),
                    appliesToKana = emptyList(),
                    misc = listOf("polite"),
                    gloss = listOf(
                        DictionaryGloss(lang = "eng", text = "I"),
                        DictionaryGloss(lang = "spa", text = "yo"),
                    ),
                ),
                DictionarySense(
                    partOfSpeech = listOf("pn"),
                    gloss = listOf(DictionaryGloss(lang = "eng", text = "me")),
                ),
            ),
        )
        val dataSource = FakeDataSource(
            lookupRows = mapOf("kanji|私" to listOf(LocalDictionaryLookupRow("1311110", 0, "私"))),
            entries = mapOf("1311110" to original),
        )

        val word = foundWords(LocalDictionary(fixture) { dataSource }.searchByWord("私")).single()
        assertEquals(listOf("私", "わたくし"), word.kanji?.map { it.text })
        assertEquals(listOf("わたし", "わたくし"), word.kana?.map { it.text })
        assertEquals(listOf("n", "pn"), word.sense?.map { it.partOfSpeech?.single() })
        assertEquals(listOf("I", "yo"), word.sense?.first()?.gloss?.map { it.text })
        assertEquals(listOf("tag-1"), word.kanji?.first()?.tags)
        assertEquals(listOf("私"), word.kana?.first()?.appliesToKanji)
        fixture.parentFile?.deleteRecursively()
    }

    @Test
    fun `no rows is distinct from unavailable`() {
        val fixture = fixtureFile("empty")
        val dictionary = LocalDictionary(fixture) { FakeDataSource() }
        assertEquals(LocalDictionaryLookupResult.NoResults, dictionary.searchByWord("寿司"))
        assertTrue(dictionary.searchByWord("   ") is LocalDictionaryLookupResult.NoResults)
        fixture.parentFile?.deleteRecursively()
    }

    private fun foundDisplay(result: LocalDictionaryLookupResult): DictionaryDisplay =
        (result as LocalDictionaryLookupResult.Found).displays.single()

    private fun foundWords(result: LocalDictionaryLookupResult) = foundDisplay(result).words

    private fun fixtureFile(name: String): File =
        Files.createTempDirectory("local-dictionary-$name").resolve("dictionary.sqlite").toFile().apply {
            writeText("fixture")
        }

    private fun entry(id: String, text: String) = DictionaryWord(
        id = id,
        kanji = listOf(DictionaryKanji(common = true, text = text, tags = emptyList())),
        kana = listOf(DictionaryKana(common = true, text = text, tags = emptyList(), appliesToKanji = emptyList())),
        sense = listOf(
            DictionarySense(
                partOfSpeech = listOf("n"),
                gloss = listOf(DictionaryGloss(lang = "eng", text = "fixture")),
            ),
        ),
    )

    private class FakeDataSource(
        private val metadata: Map<String, String> = validMetadata,
        private val lookupRows: Map<String, List<LocalDictionaryLookupRow>> = emptyMap(),
        private val entries: Map<String, DictionaryWord> = emptyMap(),
    ) : LocalDictionaryDataSource {
        var lastLimit: Int? = null
        val calls = mutableListOf<String>()

        override fun metadata() = metadata

        override fun lookup(kind: String, prefix: String, limit: Int): List<LocalDictionaryLookupRow> {
            lastLimit = limit
            calls += "$kind|$prefix"
            return lookupRows["$kind|$prefix"].orEmpty()
        }

        override fun readEntry(entryId: String) = entries[entryId]

        override fun close() = Unit
    }

    private companion object {
        val validMetadata = mapOf(
            "schemaVersion" to "1",
            "dictionaryVersion" to "3.6.2",
            "dictionaryDate" to "2026-09-28",
            "entryCount" to "218840",
            "generatorVersion" to "1.0.0",
        )
    }
}
