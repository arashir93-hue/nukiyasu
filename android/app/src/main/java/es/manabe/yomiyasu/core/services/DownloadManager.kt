package es.manabe.yomiyasu.core.services

import android.content.Context
import android.text.format.Formatter
import dagger.hilt.android.qualifiers.ApplicationContext
import es.manabe.yomiyasu.core.di.ApplicationScope
import es.manabe.yomiyasu.core.mokuro.MokuroParser
import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.Variant
import es.manabe.yomiyasu.core.networking.ApiClient
import es.manabe.yomiyasu.core.networking.Endpoint
import es.manabe.yomiyasu.core.readers.ImageFolderPages
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.net.URLDecoder
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class DownloadRecord(
    val bookId: String,
    val visibleName: String,
    val variant: String,
    val downloadedAt: Long,
    val byteCount: Long,
    val pageCount: Int,
    val serieId: String? = null,
    val serieName: String = "",
    val isMature: Boolean = false,
    val book: Book? = null,
)

sealed interface DownloadState {
    data object NotDownloaded : DownloadState
    data object Queued : DownloadState
    data class Downloading(val progress: Double, val detail: String) : DownloadState
    data object Downloaded : DownloadState
    data class Failed(val message: String) : DownloadState
    val isActive: Boolean get() = this is Queued || this is Downloading
}

data class ActiveDownload(
    val bookId: String,
    val name: String,
    val progress: Double,
    val detail: String,
    val isQueued: Boolean,
)

@Singleton
class DownloadManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ApiClient,
    @ApplicationScope private val scope: CoroutineScope,
) {
    // Keep the historical directory for upgrade compatibility.
    private val rootDir = File(context.filesDir, "Yomiyasu/Downloads")
    private val manifestFile get() = File(rootDir, "manifest.json")
    private val _records = MutableStateFlow<Map<String, DownloadRecord>>(emptyMap())
    val records: StateFlow<Map<String, DownloadRecord>> = _records.asStateFlow()
    private val _states = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val states: StateFlow<Map<String, DownloadState>> = _states.asStateFlow()
    private val _visibilityVersion = MutableStateFlow(0L)
    val visibilityVersion: StateFlow<Long> = _visibilityVersion.asStateFlow()
    private var hiddenByMatureContent: Set<String> = emptySet()
    private var matureContentVisible = false
    private val queue = ArrayDeque<Book>()
    private val bookNames = mutableMapOf<String, String>()
    private val bookSeriesNames = mutableMapOf<String, String>()
    private val bookMature = mutableMapOf<String, Boolean>()
    private var activeBookId: String? = null
    private var currentJob: Job? = null

    init {
        rootDir.mkdirs()
        rootDir.listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.deleteRecursively() }
        loadManifest()
    }

    val sortedRecords: List<DownloadRecord> get() = _records.value.values
        .filterNot { hiddenByMatureContent.contains(it.bookId) }
        .sortedByDescending { it.downloadedAt }
    val totalBytes: Long get() = sortedRecords.sumOf { it.byteCount }
    val active: List<ActiveDownload> get() = _states.value.entries
        .filterNot { hiddenByMatureContent.contains(it.key) ||
            (bookMature[it.key] == true && !matureContentVisible) }
        .filter { it.value.isActive }
        .mapNotNull { (id, state) ->
            val name = bookNames[id] ?: return@mapNotNull null
            when (state) {
                is DownloadState.Queued -> ActiveDownload(id, name, 0.0, "En cola", true)
                is DownloadState.Downloading -> ActiveDownload(id, name, state.progress, state.detail, false)
                else -> null
            }
        }

    /** Filtering is local so the offline catalogue remains usable without a server. */
    fun setMatureContentVisible(visible: Boolean) {
        matureContentVisible = visible
        hiddenByMatureContent = if (visible) emptySet()
        else _records.value.values.filter { it.isMature }.mapTo(mutableSetOf()) { it.bookId }
        _visibilityVersion.value++
    }

    fun stateFor(bookId: String): DownloadState = _states.value[bookId]
        ?: if (_records.value.containsKey(bookId)) DownloadState.Downloaded else DownloadState.NotDownloaded
    fun isDownloaded(bookId: String) = _records.value.containsKey(bookId)
    fun localBook(bookId: String, showMatureContent: Boolean = true): Book? = _records.value[bookId]
        ?.takeIf { offlineRecordAccessible(it, showMatureContent) }
        ?.let { record -> reconstructOfflineBook(record, localImagesDirectory(bookId), localHtmlFile(bookId)) }
    fun bookDirectory(bookId: String): File {
        val safe = File(rootDir, offlineStorageKey(bookId))
        // Read legacy installations that used the raw id, but only when that
        // legacy path is itself a safe child of the private root.
        val legacy = File(rootDir, bookId)
        return if (!safe.exists() && legacy.isInside(rootDir)) legacy else safe
    }
    fun localHtmlFile(bookId: String) = File(bookDirectory(bookId), "book.html")
    fun localEpubFile(bookId: String) = File(bookDirectory(bookId), "book.epub")
    fun localImagesDirectory(bookId: String) = File(bookDirectory(bookId), "images")
    fun localImageFile(bookId: String, relativePath: String): File? = runCatching {
        safeChild(localImagesDirectory(bookId), relativePath).takeIf { it.isFile && it.length() > 0 }
    }.getOrNull()

    fun enqueue(book: Book, serieName: String = "", isMature: Boolean = book.isMature) {
        if (_records.value.containsKey(book.id) || _states.value[book.id]?.isActive == true || queue.any { it.id == book.id }) return
        updateState(book.id, DownloadState.Queued)
        bookNames[book.id] = book.visibleName
        bookSeriesNames[book.id] = serieName
        bookMature[book.id] = isMature
        queue.addLast(book)
        processQueue()
    }

    fun enqueueSeries(books: List<Book>, serieName: String = "", isMature: Boolean = false) =
        books.forEach { enqueue(it, serieName, isMature || it.isMature) }

    fun cancel(bookId: String) {
        queue.removeAll { it.id == bookId }
        if (activeBookId == bookId) currentJob?.cancel()
        else {
            updateState(bookId, DownloadState.NotDownloaded)
            bookNames.remove(bookId); bookSeriesNames.remove(bookId); bookMature.remove(bookId)
            tempDirectory(bookId).deleteRecursively()
        }
    }

    fun delete(bookId: String) {
        cancel(bookId)
        deleteOfflineCopy(bookDirectory(bookId), tempDirectory(bookId))
        _records.value = _records.value - bookId
        updateState(bookId, DownloadState.NotDownloaded)
        saveManifest()
    }

    private fun processQueue() {
        if (currentJob != null || queue.isEmpty()) return
        val book = queue.removeFirst()
        activeBookId = book.id
        currentJob = scope.launch {
            try { performDownload(book) }
            finally {
                currentJob = null; activeBookId = null
                bookNames.remove(book.id); bookSeriesNames.remove(book.id); bookMature.remove(book.id)
                processQueue()
            }
        }
    }

    private suspend fun performDownload(book: Book) {
        updateState(book.id, DownloadState.Downloading(0.0, "Preparando…"))
        try {
            when {
                book.variant == Variant.Novela -> downloadNovel(book)
                book.isImageFolder -> downloadImageFolder(book)
                else -> downloadManga(book)
            }
        } catch (cancelled: CancellationException) {
            cleanupIncompleteOfflineCopy(tempDirectory(book.id), bookDirectory(book.id))
            updateState(book.id, DownloadState.NotDownloaded)
            throw cancelled
        } catch (error: Exception) {
            cleanupIncompleteOfflineCopy(tempDirectory(book.id), bookDirectory(book.id))
            updateState(book.id, DownloadState.Failed(error.message ?: "Error de descarga"))
        }
    }

    private suspend fun downloadManga(book: Book) {
        val seriePath = requireNotNull(book.seriePath) { "Libro sin ruta" }
        val bookPath = requireNotNull(book.path) { "Libro sin ruta" }
        val folder = book.variant?.staticFolder ?: "mangas"
        val htmlBytes = api.sendBytes(Endpoint.get("api/static/$folder/$seriePath/$bookPath.html"))
        val parsed = MokuroParser.parse(htmlBytes.decodeToString())
        check(parsed.pages.isNotEmpty()) { "El tomo no tiene páginas" }
        val temp = prepareTemp(book.id)
        File(temp, "book.html").writeBytes(htmlBytes)
        var bytes = htmlBytes.size.toLong()
        parsed.pages.forEachIndexed { index, page ->
            val decoded = runCatching { URLDecoder.decode(page.imagePath, "UTF-8") }.getOrDefault(page.imagePath)
            val relative = safeRelative(decoded)
            val data = api.sendBytes(Endpoint.get("api/static/$folder/$seriePath/$decoded"))
            safeChild(File(temp, "images"), relative).apply { parentFile?.mkdirs(); writeBytes(data) }
            bytes += data.size
            updateState(book.id, DownloadState.Downloading((index + 1).toDouble() / parsed.pages.size.coerceAtLeast(1), "${index + 1}/${parsed.pages.size} pág. · ${Formatter.formatShortFileSize(context, bytes)}"))
        }
        finish(record(book, bytes, parsed.pages.size), temp)
    }

    private suspend fun downloadImageFolder(book: Book) {
        val seriePath = requireNotNull(book.seriePath) { "Libro sin ruta" }
        val folder = book.variant?.staticFolder ?: "mangas"
        val detail = api.send(Endpoint.get("api/books/book/${book.id}"), Book.serializer())
        val pagePaths = detail.pagePaths.orEmpty()
        check(pagePaths.isNotEmpty()) { "El tomo no tiene páginas" }
        val temp = prepareTemp(book.id)
        var bytes = 0L
        pagePaths.forEachIndexed { index, fileName ->
            val data = api.sendBytes(Endpoint.get("api/static/$folder/$seriePath/$fileName"))
            val relative = safeRelative(ImageFolderPages.joinedPath(detail.imagesFolder, fileName))
            safeChild(File(temp, "images"), relative).apply { parentFile?.mkdirs(); writeBytes(data) }
            bytes += data.size
            updateState(book.id, DownloadState.Downloading((index + 1).toDouble() / pagePaths.size, "${index + 1}/${pagePaths.size} pág. · ${Formatter.formatShortFileSize(context, bytes)}"))
        }
        finish(record(detail.copy(serie = detail.serie ?: book.serie), bytes, pagePaths.size), temp)
    }

    private suspend fun downloadNovel(book: Book) {
        val seriePath = requireNotNull(book.seriePath) { "Libro sin ruta" }
        val bookPath = requireNotNull(book.path) { "Libro sin ruta" }
        val folder = book.variant?.staticFolder ?: "novelas"
        val data = api.sendBytes(Endpoint.get("api/static/$folder/$seriePath/$bookPath.epub"))
        val temp = prepareTemp(book.id)
        File(temp, "book.epub").writeBytes(data)
        finish(record(book, data.size.toLong(), 0), temp)
    }

    private fun record(book: Book, bytes: Long, pages: Int) = DownloadRecord(
        bookId = book.id, visibleName = book.visibleName, variant = book.variant?.rawValue ?: "manga",
        downloadedAt = System.currentTimeMillis(), byteCount = bytes, pageCount = pages,
        serieId = book.serie, serieName = bookSeriesNames[book.id].orEmpty(),
        isMature = bookMature[book.id] ?: book.isMature, book = book,
    )

    private fun finish(record: DownloadRecord, temp: File) {
        validate(temp, record)
        val target = bookDirectory(record.bookId)
        target.deleteRecursively()
        check(temp.renameTo(target)) { "No se pudo confirmar la descarga" }
        _records.value = _records.value + (record.bookId to record)
        updateState(record.bookId, DownloadState.Downloaded)
        saveManifest()
    }

    private fun validate(directory: File, record: DownloadRecord) =
        check(isCompleteOfflineCopy(directory, record)) { "La copia local está incompleta" }

    private fun prepareTemp(bookId: String) = tempDirectory(bookId).also { it.deleteRecursively(); it.mkdirs() }
    private fun tempDirectory(bookId: String) = File(rootDir, ".${offlineStorageKey(bookId)}.part")
    private fun safeRelative(path: String): String {
        val normal = path.replace('\\', '/')
        require(normal.isNotBlank() && !normal.startsWith('/') && normal.split('/').none { it == ".." || it.isBlank() })
        return normal
    }
    private fun updateState(bookId: String, state: DownloadState) { _states.value = _states.value + (bookId to state) }

    private fun loadManifest() {
        runCatching {
            if (!manifestFile.exists()) return
            val list = api.json.decodeFromString(ListSerializer(DownloadRecord.serializer()), manifestFile.readText())
            _records.value = list.filter { isComplete(it) }.associateBy { it.bookId }
        }
    }
    private fun isComplete(record: DownloadRecord): Boolean {
        val dir = bookDirectory(record.bookId)
        return isCompleteOfflineCopy(dir, record)
    }
    private fun saveManifest() {
        runCatching {
            val temp = File(rootDir, "manifest.json.tmp")
            temp.writeText(api.json.encodeToString(ListSerializer(DownloadRecord.serializer()), _records.value.values.sortedByDescending { it.downloadedAt }))
            if (manifestFile.exists()) manifestFile.delete()
            check(temp.renameTo(manifestFile))
        }
    }
}
