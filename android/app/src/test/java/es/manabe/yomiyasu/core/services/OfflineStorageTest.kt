package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.networking.YomiyasuJson
import es.manabe.yomiyasu.core.models.Book
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class OfflineStorageTest {
    private fun record(
        id: String = "book-1",
        variant: String = "manga",
        pages: Int = 2,
        mature: Boolean = false,
        book: Book? = Book(id = id, visibleName = "Tomo", variant = null),
    ) = DownloadRecord(
        bookId = id,
        visibleName = "Tomo",
        variant = variant,
        downloadedAt = 1L,
        byteCount = 10L,
        pageCount = pages,
        isMature = mature,
        book = book,
    )

    @Test
    fun `complete manga copy is valid and incomplete copy is not`() {
        val root = Files.createTempDirectory("offline-copy").toFile()
        val complete = File(root, "complete").apply {
            mkdirs()
            File(this, "book.html").writeText("<html></html>")
            File(this, "images").mkdirs()
            File(this, "images/001.jpg").writeBytes(byteArrayOf(1))
            File(this, "images/002.jpg").writeBytes(byteArrayOf(1))
        }
        val incomplete = File(root, "incomplete").apply {
            mkdirs()
            File(this, "book.html").writeText("<html></html>")
            File(this, "images").mkdirs()
            File(this, "images/001.jpg").writeBytes(byteArrayOf(1))
        }

        assertTrue(isCompleteOfflineCopy(complete, record()))
        assertFalse(isCompleteOfflineCopy(incomplete, record()))
        root.deleteRecursively()
    }

    @Test
    fun `complete epub copy is valid only when non empty`() {
        val root = Files.createTempDirectory("offline-epub").toFile()
        val record = record(variant = "novela", pages = 0, book = Book("book-1", variant = null))
        File(root, "book.epub").writeBytes(byteArrayOf(1))
        assertTrue(isCompleteOfflineCopy(root, record))
        File(root, "book.epub").writeBytes(ByteArray(0))
        assertFalse(isCompleteOfflineCopy(root, record))
        root.deleteRecursively()
    }

    @Test
    fun `catalog snapshot reconstructs without a server and resolves mokuro files locally`() {
        val root = Files.createTempDirectory("offline-catalog").toFile()
        val images = File(root, "images").apply { mkdirs() }
        val html = File(root, "book.html").apply { writeText("<html></html>") }
        val image = File(images, "serie/001.jpg").apply { parentFile?.mkdirs(); writeBytes(byteArrayOf(1)) }
        val snapshot = record(book = Book("book-1", visibleName = "Tomo", variant = null))
        val rebuilt = reconstructOfflineBook(snapshot.copy(book = null), images, html)
        assertEquals("Tomo", rebuilt.visibleName)
        assertTrue(html.isFile)
        assertTrue(image.isFile)
        assertTrue(safeChild(images, "serie/001.jpg").isFile)
        root.deleteRecursively()
    }

    @Test
    fun `local source is preferred and remote source is used when absent`() = runTest {
        val local = Book("local", visibleName = "Local")
        assertEquals(local, resolveOfflineFirst(local) { error("remote should not run") })
        assertEquals("remote", resolveOfflineFirst<Book>(null) { Book("remote", visibleName = "remote") }.visibleName)
    }

    @Test
    fun `adult local copy is inaccessible when preference is disabled`() {
        val adult = record(mature = true)
        val normal = record(mature = false)
        assertFalse(offlineRecordAccessible(adult, showMatureContent = false))
        assertTrue(offlineRecordAccessible(adult, showMatureContent = true))
        assertTrue(offlineRecordAccessible(normal, showMatureContent = false))
    }

    @Test
    fun `cancellation removes temporary and final copies`() {
        val root = Files.createTempDirectory("offline-cancel").toFile()
        val temp = File(root, "book.part").apply { mkdirs(); File(this, "partial").writeText("x") }
        val final = File(root, "book").apply { mkdirs(); File(this, "partial").writeText("x") }
        cleanupIncompleteOfflineCopy(temp, final)
        assertFalse(temp.exists())
        assertFalse(final.exists())
        root.deleteRecursively()
    }

    @Test
    fun `deleting a copy leaves unrelated remote model untouched`() {
        val root = Files.createTempDirectory("offline-delete").toFile()
        val temp = File(root, "book.part").apply { mkdirs() }
        val local = File(root, "book").apply { mkdirs(); File(this, "book.html").writeText("x") }
        val remoteBook = Book("book-1", visibleName = "Tomo remoto")
        deleteOfflineCopy(local, temp)
        assertFalse(local.exists())
        assertEquals("Tomo remoto", remoteBook.visibleName)
        root.deleteRecursively()
    }
    @Test
    fun `malicious ids stay inside the download root`() {
        val root = Files.createTempDirectory("offline-storage").toFile()
        val directory = File(root, offlineStorageKey("..\\outside/../../book"))
        assertTrue(directory.canonicalFile.toPath().startsWith(root.canonicalFile.toPath()))
        assertFalse(directory.name.contains("..\\"))
        root.deleteRecursively()
    }

    @Test
    fun `pending progress survives restart and is replaced per book`() {
        val root = Files.createTempDirectory("offline-progress").toFile()
        val store = PendingProgressFileStore(File(root, "progress.json"), root, YomiyasuJson)
        val request = ReadProgressRequest("book-1", currentPage = 2, characters = 0, status = "reading")
        store.upsert(request)
        store.upsert(request.copy(currentPage = 4))
        val restored = PendingProgressFileStore(File(root, "progress.json"), root, YomiyasuJson).all()
        assertTrue(restored.single().request.currentPage == 4)
        store.remove("book-1")
        assertTrue(store.all().isEmpty())
        root.deleteRecursively()
    }

    @Test
    fun `successful progress sync removes pending entry`() = runTest {
        val root = Files.createTempDirectory("offline-sync-ok").toFile()
        val store = PendingProgressFileStore(File(root, "progress.json"), root, YomiyasuJson)
        val request = ReadProgressRequest("book-1", currentPage = 2, characters = 0, status = "reading")
        store.upsert(request)
        val uploaded = mutableListOf<ReadProgressRequest>()
        OfflineProgressSyncEngine(store) { uploaded += it }.syncPending()
        assertEquals(listOf(request), uploaded)
        assertTrue(store.all().isEmpty())
        root.deleteRecursively()
    }

    @Test
    fun `failed progress sync keeps pending entry`() = runTest {
        val root = Files.createTempDirectory("offline-sync-fail").toFile()
        val store = PendingProgressFileStore(File(root, "progress.json"), root, YomiyasuJson)
        val request = ReadProgressRequest("book-1", currentPage = 2, characters = 0, status = "reading")
        store.upsert(request)
        OfflineProgressSyncEngine(store) { error("server unavailable") }.syncPending()
        assertEquals(request, store.all().single().request)
        root.deleteRecursively()
    }
}
