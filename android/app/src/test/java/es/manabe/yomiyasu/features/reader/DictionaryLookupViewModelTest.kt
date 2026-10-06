package es.manabe.yomiyasu.features.reader

import es.manabe.yomiyasu.core.models.DictionaryDisplay
import es.manabe.yomiyasu.core.models.DictionaryGloss
import es.manabe.yomiyasu.core.models.DictionaryKanji
import es.manabe.yomiyasu.core.models.DictionarySense
import es.manabe.yomiyasu.core.models.DictionaryWord
import es.manabe.yomiyasu.core.models.UserWord
import es.manabe.yomiyasu.core.models.UserWordRequest
import es.manabe.yomiyasu.core.models.WordsSort
import es.manabe.yomiyasu.core.services.ConnectivityStatus
import es.manabe.yomiyasu.core.services.DictionaryLookupDataSource
import es.manabe.yomiyasu.core.services.LocalDictionary
import es.manabe.yomiyasu.core.services.LocalDictionaryDataSource
import es.manabe.yomiyasu.core.services.LocalDictionaryLookupRow
import es.manabe.yomiyasu.core.settings.DictionaryLookupMode
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class DictionaryLookupViewModelTest {
    private val tempDirectories = mutableListOf<File>()

    @Before
    fun setUp() {
        Dispatchers.setMain(kotlinx.coroutines.test.UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        tempDirectories.forEach(File::deleteRecursively)
        tempDirectories.clear()
        Dispatchers.resetMain()
    }

    @Test
    fun `ready local dictionary is preferred and preserves dictionary data`() = runTest {
        val online = FakeApi(onlineWord = listOf(display("online", "online-id")))
        val local = readyLocalDictionary(display("猫", "local-id"))
        val viewModel = viewModel(online, local)

        viewModel.init("猫", DictionaryLookupMode.Word, null)
        advanceUntilIdle()
        awaitLoaded(viewModel)

        assertEquals(listOf("local-id"), viewModel.state.value.displays.single().words.map { it.id })
        assertEquals(0, online.wordCalls)
        assertEquals("gato", viewModel.state.value.displays.single().words.single().firstGlosses.single())
    }

    @Test
    fun `ready local no results does not silently fall back online`() = runTest {
        val online = FakeApi(onlineWord = listOf(display("online", "online-id")))
        val viewModel = viewModel(online, readyLocalDictionary(null))

        viewModel.init("未知", DictionaryLookupMode.Word, null)
        advanceUntilIdle()
        awaitLoaded(viewModel)

        assertTrue(viewModel.state.value.displays.isEmpty())
        assertEquals(null, viewModel.state.value.error)
        assertEquals(0, online.wordCalls)
    }

    @Test
    fun `not installed local dictionary keeps the online behavior`() = runTest {
        val online = FakeApi(onlineWord = listOf(display("online", "online-id")))
        val missing = Files.createTempDirectory("dictionary-vm-missing").resolve("dictionary.sqlite").toFile()
        try {
            val viewModel = viewModel(online, LocalDictionary(missing))
            viewModel.init("猫", DictionaryLookupMode.Word, null)
            advanceUntilIdle()
            awaitLoaded(viewModel)

            assertEquals("online-id", viewModel.state.value.displays.single().words.single().id)
            assertEquals(1, online.wordCalls)
        } finally {
            missing.parentFile?.deleteRecursively()
        }
    }

    @Test
    fun `corrupt local dictionary falls back online`() = runTest {
        val online = FakeApi(onlineWord = listOf(display("online", "online-id")))
        val file = Files.createTempDirectory("dictionary-vm-corrupt").resolve("dictionary.sqlite").toFile()
        file.writeText("not sqlite")
        try {
            val local = LocalDictionary(file) { error("corrupt sqlite") }
            val viewModel = viewModel(online, local)
            viewModel.init("猫", DictionaryLookupMode.Word, null)
            advanceUntilIdle()
            awaitLoaded(viewModel)

            assertEquals("online-id", viewModel.state.value.displays.single().words.single().id)
            assertEquals(1, online.wordCalls)
        } finally {
            file.parentFile?.deleteRecursively()
        }
    }

    @Test
    fun `sentence mode remains online even with local dictionary`() = runTest {
        val online = FakeApi(onlineSentence = listOf(display("sentence", "sentence-id")))
        val viewModel = viewModel(online, readyLocalDictionary(display("猫", "local-id")))

        viewModel.init("猫です", DictionaryLookupMode.Sentence, "猫です")
        advanceUntilIdle()
        awaitLoaded(viewModel)

        assertEquals("sentence-id", viewModel.state.value.displays.single().words.single().id)
        assertEquals(1, online.sentenceCalls)
    }

    @Test
    fun `saving a locally displayed word still uses the existing online endpoint`() = runTest {
        val online = FakeApi()
        val word = word("local-id", "猫")
        val display = DictionaryDisplay("猫", listOf(word))
        val viewModel = viewModel(online, readyLocalDictionary(display))

        viewModel.init("猫", DictionaryLookupMode.Word, "猫です")
        advanceUntilIdle()
        awaitLoaded(viewModel)
        viewModel.save(word, display)
        advanceUntilIdle()
        awaitLoaded(viewModel)

        assertEquals(1, online.saveCalls)
        assertEquals(DictionaryLookupSaveAlert.Saved, viewModel.state.value.alert)
        assertEquals("local-id", viewModel.state.value.savedWordID)
    }

    private fun viewModel(api: FakeApi, local: LocalDictionary): DictionaryLookupViewModel =
        DictionaryLookupViewModel(api, local, FakeConnectivity(true))

    private fun awaitLoaded(viewModel: DictionaryLookupViewModel) {
        repeat(100) {
            if (!viewModel.state.value.isLoading) return
            Thread.sleep(20)
        }
        assertTrue("dictionary lookup did not finish", !viewModel.state.value.isLoading)
    }

    private fun readyLocalDictionary(result: DictionaryDisplay?): LocalDictionary {
        val file = Files.createTempDirectory("dictionary-vm-ready").resolve("dictionary.sqlite").toFile()
        tempDirectories += file.parentFile
        file.writeText("fixture")
        val dataSource = FakeLocalDataSource(result)
        return LocalDictionary(file) { dataSource }
    }

    private fun display(label: String, id: String): DictionaryDisplay =
        DictionaryDisplay(label, listOf(word(id, label)))

    private fun word(id: String, text: String) = DictionaryWord(
        id = id,
        kanji = listOf(DictionaryKanji(common = true, text = text)),
        sense = listOf(
            DictionarySense(gloss = listOf(DictionaryGloss(lang = "es", text = "gato"))),
        ),
    )

    private class FakeConnectivity(online: Boolean) : ConnectivityStatus {
        override val isOnline = MutableStateFlow(online)
    }

    private class FakeLocalDataSource(
        private val result: DictionaryDisplay?,
    ) : LocalDictionaryDataSource {
        override fun metadata() = mapOf(
            "schemaVersion" to "1",
            "dictionaryVersion" to "3.6.2",
            "dictionaryDate" to "2026-09-28",
            "entryCount" to "218840",
            "generatorVersion" to "1.0.0",
        )

        override fun lookup(kind: String, prefix: String, limit: Int) =
            if (kind == "kanji" && prefix == result?.display) {
                listOf(LocalDictionaryLookupRow(result.words.single().id, 0, prefix))
            } else {
                emptyList()
            }

        override fun readEntry(entryId: String) = result?.words?.firstOrNull { it.id == entryId }
        override fun close() = Unit
    }

    private class FakeApi(
        private val onlineWord: List<DictionaryDisplay> = emptyList(),
        private val onlineSentence: List<DictionaryDisplay> = emptyList(),
    ) : DictionaryLookupDataSource {
        var wordCalls = 0
        var sentenceCalls = 0
        var saveCalls = 0

        override suspend fun lookupWord(text: String): List<DictionaryDisplay> {
            wordCalls++
            return onlineWord
        }

        override suspend fun lookupSentence(text: String): List<DictionaryDisplay> {
            sentenceCalls++
            return onlineSentence
        }

        override suspend fun saveWord(request: UserWordRequest): Int {
            saveCalls++
            return 1
        }

        override suspend fun words(sort: WordsSort): List<UserWord> = emptyList()
        override suspend fun deleteWord(word: String) = Unit
    }
}
