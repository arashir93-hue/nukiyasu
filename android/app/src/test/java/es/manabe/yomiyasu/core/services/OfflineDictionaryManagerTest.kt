package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.networking.YomiyasuJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.util.zip.GZIPOutputStream

class OfflineDictionaryManagerTest {

    @Test
    fun `clean installation downloads verifies and installs`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()

        assertEquals(OfflineDictionaryManagerStatus.NOT_INSTALLED, manager.state.value.status)
        assertEquals(OfflineDictionaryManagerStatus.AVAILABLE, manager.checkForUpdates().status)
        assertEquals(OfflineDictionaryManagerStatus.INSTALLED, manager.installLatest().status)
        assertTrue(fixture.sqlite.isFile)
        assertEquals(LocalDictionary.SUPPORTED_SCHEMA_VERSION, manager.state.value.installedManifest?.schemaVersion)
        fixture.cleanup()
    }

    @Test
    fun `reports byte progress while streaming`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        manager.installLatest()
        assertEquals(fixture.manifest.compressedSize, manager.state.value.bytesTotal)
        assertEquals(OfflineDictionaryManagerStatus.INSTALLED, manager.state.value.status)
        fixture.cleanup()
    }

    @Test
    fun `cancellation cleans partial files and does not install`() = runTest {
        val fixture = fixture(slow = true)
        val manager = fixture.manager()
        val job = launch(Dispatchers.Default) { manager.installLatest() }
        while (manager.state.value.status != OfflineDictionaryManagerStatus.DOWNLOADING) delay(1)
        manager.cancel()
        job.join()
        assertEquals(OfflineDictionaryManagerStatus.CANCELLED, manager.state.value.status)
        assertFalse(fixture.sqlite.exists())
        assertFalse(fixture.part.exists())
        fixture.cleanup()
    }

    @Test
    fun `correct checksum is accepted`() = runTest {
        val fixture = fixture()
        assertEquals(OfflineDictionaryManagerStatus.INSTALLED, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `incorrect checksum is rejected and part is removed`() = runTest {
        val fixture = fixture(sha256Override = "0".repeat(64))
        val manager = fixture.manager()
        assertEquals(OfflineDictionaryManagerStatus.ERROR, manager.installLatest().status)
        assertFalse(fixture.sqlite.exists())
        assertFalse(fixture.part.exists())
        fixture.cleanup()
    }

    @Test
    fun `corrupt gzip is rejected`() = runTest {
        val fixture = fixture(gzip = byteArrayOf(1, 2, 3, 4))
        val manager = fixture.manager()
        assertEquals(OfflineDictionaryManagerStatus.ERROR, manager.installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `corrupt sqlite is rejected by validator`() = runTest {
        val fixture = fixture(validator = FakeValidator(validate = false))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `quick check failure is rejected by validator`() = runTest {
        val fixture = fixture(validator = FakeValidator(validate = false))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `incompatible schema is rejected by manifest validation`() = runTest {
        val fixture = fixture(manifest = fixtureManifest().copy(schemaVersion = 2))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `sqlite metadata mismatch is rejected by validator`() = runTest {
        val fixture = fixture(validator = FakeValidator(validate = false))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `compressed size mismatch is rejected`() = runTest {
        val fixture = fixture(manifest = fixtureManifest().copy(compressedSize = 1))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `sqlite size mismatch is rejected`() = runTest {
        val base = fixtureManifest()
        val fixture = fixture(manifest = base.copy(sqliteSize = base.sqliteSize + 1))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `update is detected and installed`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        manager.installLatest()
        val update = fixture.copyForVersion("3.6.3")
        fixture.remote.packageInfo = update.packageInfo
        assertEquals(OfflineDictionaryManagerStatus.UPDATE_AVAILABLE, manager.checkForUpdates().status)
        assertEquals(OfflineDictionaryManagerStatus.INSTALLED, manager.installLatest().status)
        fixture.cleanup()
        update.cleanup()
    }

    @Test
    fun `failed update preserves previous installation`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        manager.installLatest()
        val old = fixture.sqlite.readBytes()
        fixture.remote.packageInfo = fixture.packageInfo.copy(
            manifest = fixture.manifest.copy(sha256 = "f".repeat(64)),
        )
        manager.checkForUpdates()
        assertEquals(OfflineDictionaryManagerStatus.ERROR, manager.installLatest().status)
        assertTrue(fixture.sqlite.readBytes().contentEquals(old))
        fixture.cleanup()
    }

    @Test
    fun `delete removes only dictionary files`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        manager.installLatest()
        val unrelated = File(fixture.root, "manga.txt").apply { writeText("keep") }
        manager.deleteDictionary()
        assertEquals(OfflineDictionaryManagerStatus.NOT_INSTALLED, manager.state.value.status)
        assertFalse(fixture.sqlite.exists())
        assertTrue(unrelated.exists())
        fixture.cleanup()
    }

    @Test
    fun `second operation is blocked while first is active`() = runTest {
        val fixture = fixture(slow = true)
        val manager = fixture.manager()
        val job = launch(Dispatchers.Default) { manager.installLatest() }
        while (manager.state.value.status != OfflineDictionaryManagerStatus.DOWNLOADING) delay(1)
        assertThrows(IllegalStateException::class.java) { manager.deleteDictionary() }
        manager.cancel()
        job.join()
        fixture.cleanup()
    }

    @Test
    fun `previous valid copy is restored when current is corrupt`() = runTest {
        val fixture = fixture()
        fixture.previous.writeText("valid")
        fixture.metadataPrevious.writeText(fixture.json.encodeToString(DictionaryManifest.serializer(), fixture.manifest))
        fixture.sqlite.writeText("corrupt")
        val manager = fixture.manager()
        assertEquals(OfflineDictionaryManagerStatus.INSTALLED, manager.state.value.status)
        assertEquals("valid", fixture.sqlite.readText())
        fixture.cleanup()
    }

    @Test
    fun `part is cleaned on startup`() = runTest {
        val fixture = fixture()
        fixture.part.writeText("partial")
        fixture.manager()
        assertFalse(fixture.part.exists())
        fixture.cleanup()
    }

    @Test
    fun `corrupt current with valid previous keeps previous metadata`() = runTest {
        val fixture = fixture()
        fixture.previous.writeText("valid")
        fixture.metadataPrevious.writeText(fixture.json.encodeToString(DictionaryManifest.serializer(), fixture.manifest))
        fixture.sqlite.writeText("bad")
        val manager = fixture.manager()
        assertEquals("3.6.2", manager.state.value.installedManifest?.dictionaryVersion)
        fixture.cleanup()
    }

    @Test
    fun `invalid manifest is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            validateDictionaryManifest(fixtureManifest().copy(asset = "../outside.gz"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            validateDictionaryManifest(fixtureManifest().copy(sha256 = "short"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            validateDictionaryManifest(fixtureManifest().copy(sqliteSize = 513L * 1024L * 1024L))
        }
    }

    @Test
    fun `http asset is rejected`() = runTest {
        val fixture = fixture(assetUrl = "http://example.invalid/dictionary.gz")
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `path traversal asset name is rejected`() = runTest {
        val fixture = fixture(manifest = fixtureManifest().copy(asset = "../../dictionary.gz"))
        assertEquals(OfflineDictionaryManagerStatus.ERROR, fixture.manager().installLatest().status)
        fixture.cleanup()
    }

    @Test
    fun `same version with changed date or hash is an update`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        manager.installLatest()
        fixture.remote.packageInfo = fixture.packageInfo.copy(
            manifest = fixture.manifest.copy(dictionaryDate = "2026-09-29"),
        )
        assertEquals(OfflineDictionaryManagerStatus.UPDATE_AVAILABLE, manager.checkForUpdates().status)
        fixture.cleanup()
    }

    @Test
    fun `remote manifest is exposed without installing automatically`() = runTest {
        val fixture = fixture()
        val manager = fixture.manager()
        val state = manager.checkForUpdates()
        assertEquals(OfflineDictionaryManagerStatus.AVAILABLE, state.status)
        assertNotNull(state.remoteManifest)
        assertFalse(fixture.sqlite.exists())
        fixture.cleanup()
    }

    private fun fixture(
        manifest: DictionaryManifest = fixtureManifest(),
        gzip: ByteArray = gzipOf(SQLITE_FIXTURE),
        assetUrl: String = "https://github.com/test/dictionary.gz",
        validator: FakeValidator = FakeValidator(),
        slow: Boolean = false,
        sha256Override: String? = null,
    ): Fixture {
        val root = Files.createTempDirectory("offline-dictionary").toFile()
        val remote = FakeRemote(
            RemoteDictionaryPackage(manifest.copy(sha256 = sha256Override ?: manifest.sha256), assetUrl),
            gzip,
            slow,
        )
        return Fixture(root, remote, validator, remote.packageInfo.manifest, YomiyasuJson)
    }

    private fun fixtureManifest() = DictionaryManifest(
        schemaVersion = 1,
        dictionaryVersion = "3.6.2",
        dictionaryDate = "2026-09-28",
        generatorVersion = "1.0.0",
        entryCount = 1,
        kanjiCount = 1,
        readingCount = 1,
        senseCount = 1,
        glossCount = 1,
        sqliteSize = SQLITE_FIXTURE.size.toLong(),
        compressedSize = gzipOf(SQLITE_FIXTURE).size.toLong(),
        sha256 = sha256(gzipOf(SQLITE_FIXTURE)),
        asset = "nukiyasu-dictionary.sqlite.gz",
    )

    private fun gzipOf(value: ByteArray): ByteArray = ByteArrayOutputStream().also { output ->
        GZIPOutputStream(output).use { it.write(value) }
    }.toByteArray()

    private fun sha256(value: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(value).joinToString("") { "%02x".format(it) }

    private inner class Fixture(
        val root: File,
        val remote: FakeRemote,
        val validator: FakeValidator,
        val manifest: DictionaryManifest,
        val json: kotlinx.serialization.json.Json,
    ) {
        val packageInfo get() = remote.packageInfo
        val sqlite get() = File(root, "dictionary.sqlite")
        val part get() = File(root, "dictionary.sqlite.gz.part")
        val previous get() = File(root, "dictionary.sqlite.previous")
        val metadataPrevious get() = File(root, "dictionary.metadata.json.previous")
        fun manager() = OfflineDictionaryManager(root, remote, validator, json)
        fun copyForVersion(version: String): Fixture {
            val copied = fixtureManifest().copy(dictionaryVersion = version)
            return Fixture(root, remote, validator, copied, json).also {
                remote.packageInfo = RemoteDictionaryPackage(copied, remote.packageInfo.assetUrl)
            }
        }
        fun cleanup() = root.deleteRecursively()
    }

    private class FakeRemote(
        var packageInfo: RemoteDictionaryPackage,
        private val bytes: ByteArray,
        private val slow: Boolean = false,
    ) : DictionaryRemoteSource {
        override suspend fun latest() = packageInfo
        override suspend fun openAsset(url: String): DictionaryAssetStream {
            return DictionaryAssetStream(
                if (slow) SlowInputStream(bytes) else ByteArrayInputStream(bytes),
                bytes.size.toLong(),
            )
        }
    }

    private class SlowInputStream(private val bytes: ByteArray) : InputStream() {
        private var index = 0
        override fun read(): Int = if (index < bytes.size) bytes[index++].toInt() else -1
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (index >= bytes.size) return -1
            Thread.sleep(10)
            buffer[offset] = bytes[index++]
            return 1
        }
    }

    private class FakeValidator(
        private val validate: Boolean = true,
    ) : DictionaryFileValidator {
        override fun validate(file: File, manifest: DictionaryManifest) = validate && file.isFile
        override fun isValidInstalled(file: File) = file.isFile && file.readText() == "valid"
    }

    private companion object {
        val SQLITE_FIXTURE = "small sqlite schema fixture".toByteArray()
    }
}
