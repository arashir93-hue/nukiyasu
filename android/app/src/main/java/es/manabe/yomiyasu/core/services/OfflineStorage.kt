package es.manabe.yomiyasu.core.services

import java.io.File
import java.security.MessageDigest
import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.Variant

/** Stable, filesystem-safe storage key. The original id remains in metadata. */
internal fun offlineStorageKey(id: String): String {
    if (id.matches(Regex("[A-Za-z0-9._-]{1,128}"))) return id
    val digest = MessageDigest.getInstance("SHA-256")
        .digest(id.toByteArray())
        .joinToString("") { "%02x".format(it) }
    return "id-${digest.take(32)}"
}

internal fun File.isInside(parent: File): Boolean {
    val base = parent.canonicalFile.toPath()
    return canonicalFile.toPath().startsWith(base)
}

internal fun safeChild(parent: File, relativePath: String): File {
    val child = File(parent, relativePath.replace('\\', '/'))
    require(child.isInside(parent)) { "Ruta de recurso no válida" }
    return child
}

internal suspend fun <T> resolveOfflineFirst(local: T?, remote: suspend () -> T): T =
    local ?: remote()

internal fun offlineRecordAccessible(record: DownloadRecord, showMatureContent: Boolean): Boolean =
    showMatureContent || !record.isMature

internal fun isCompleteOfflineCopy(directory: File, record: DownloadRecord): Boolean {
    return if (record.variant == "novela") {
        File(directory, "book.epub").isFile && File(directory, "book.epub").length() > 0
    } else {
        val images = File(directory, "images")
        images.isDirectory && images.walkTopDown().count { it.isFile } >= record.pageCount &&
            (record.book == null || record.book.isImageFolder || File(directory, "book.html").isFile)
    }
}

internal fun cleanupIncompleteOfflineCopy(temp: File, final: File) {
    temp.deleteRecursively()
    final.deleteRecursively()
}

internal fun deleteOfflineCopy(directory: File, temp: File) {
    directory.deleteRecursively()
    temp.deleteRecursively()
}

internal fun reconstructOfflineBook(record: DownloadRecord, imagesDirectory: File, htmlFile: File): Book {
    record.book?.let { return it }
    val variant = Variant.entries.firstOrNull { it.rawValue == record.variant } ?: Variant.Manga
    val legacyImagePaths = if (!htmlFile.isFile) {
        imagesDirectory.walkTopDown().filter { it.isFile }
            .map { it.relativeTo(imagesDirectory).invariantSeparatorsPath }
            .toList()
    } else emptyList()
    return Book(
        id = record.bookId,
        visibleName = record.visibleName,
        variant = variant,
        serie = record.serieId,
        format = if (legacyImagePaths.isNotEmpty()) "images" else null,
        pagePaths = legacyImagePaths.takeIf { it.isNotEmpty() },
    )
}
