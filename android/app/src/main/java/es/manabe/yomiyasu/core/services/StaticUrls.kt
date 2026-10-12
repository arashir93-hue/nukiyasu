package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.models.Variant
import es.manabe.yomiyasu.core.networking.ApiClient
import okhttp3.HttpUrl
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StaticUrls @Inject constructor(
    private val api: ApiClient,
) {

    fun url(path: String): HttpUrl? {
        val baseUrl = api.activeBaseUrl ?: return null
        val builder = baseUrl.newBuilder()
            .addPathSegment("api")
            .addPathSegment("static")

        path.trim('/').split('/').forEach { segment ->
            if (segment.isNotEmpty()) builder.addPathSegment(segment)
        }

        return builder.build()
    }

    private fun versioned(url: HttpUrl?, version: String?): HttpUrl? {
        if (url == null || version.isNullOrBlank()) return url
        return url.newBuilder()
            .addQueryParameter("v", version)
            .build()
    }

    fun serieCover(serie: Serie): HttpUrl? {
        val thumbnailPath = serie.thumbnailPath ?: return null
        val folder = serie.variant?.staticFolder ?: "mangas"
        return versioned(url("$folder/$thumbnailPath"), serie.thumbnailVersion)
    }

    fun bookCover(book: Book): HttpUrl? {
        val seriePath = book.seriePath ?: return null
        val thumbnailPath = book.thumbnailPath ?: return null

        return when (book.variant) {
            Variant.Novela -> {
                val imagesFolder = book.imagesFolder
                if (book.isMokured && imagesFolder != null) {
                    versioned(url("${book.variant.staticFolder}/$seriePath/$imagesFolder/$thumbnailPath"), book.thumbnailVersion)
                } else {
                    versioned(url("${book.variant.staticFolder}/$seriePath/$thumbnailPath"), book.thumbnailVersion)
                }
            }
            else -> {
                val imagesFolder = book.imagesFolder ?: return null
                val folder = book.variant?.staticFolder ?: "mangas"
                versioned(url("$folder/$seriePath/$imagesFolder/$thumbnailPath"), book.thumbnailVersion)
            }
        }
    }

    fun bookHtml(book: Book): HttpUrl? {
        val seriePath = book.seriePath ?: return null
        val path = book.path ?: return null
        val folder = book.variant?.staticFolder ?: "mangas"
        return url("$folder/$seriePath/$path.html")
    }

    fun bookImage(book: Book, imagePath: String): HttpUrl? {
        val seriePath = book.seriePath ?: return null
        val folder = book.variant?.staticFolder ?: "mangas"
        return url("$folder/$seriePath/$imagePath")
    }

    fun bookEpub(book: Book): HttpUrl? {
        val seriePath = book.seriePath ?: return null
        val path = book.path ?: return null
        val folder = book.variant?.staticFolder ?: "novelas"
        return url("$folder/$seriePath/$path.epub")
    }
}
