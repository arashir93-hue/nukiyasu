package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.models.Variant
import es.manabe.yomiyasu.core.networking.ApiClient
import es.manabe.yomiyasu.core.networking.YomiyasuJson
import es.manabe.yomiyasu.core.readers.ImageFolderPages
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

class StaticUrlsTest {

    private val urls = StaticUrls(
        ApiClient(
            baseUrl = "https://example.test/".toHttpUrl(),
            client = OkHttpClient(),
        ),
    )

    private fun book(json: String): Book = YomiyasuJson.decodeFromString(Book.serializer(), json)

    @Test
    fun `page url of an image book includes the images folder`() {
        val imageBook = book(
            """{"_id":"b1","visibleName":"Vol 1","variant":"manga","seriePath":"Serie",
               "imagesFolder":"Vol 1","format":"images"}""",
        )
        val page = ImageFolderPages.makeBook(listOf("001.jpg"), "Vol 1").pages.first()

        assertEquals(
            "https://example.test/api/static/mangas/Serie/Vol%201/001.jpg",
            urls.bookImage(imageBook, page.imagePath)?.toString(),
        )
    }

    @Test
    fun `page url of a mokuro book keeps the path parsed from the html`() {
        val mokuroBook = book(
            """{"_id":"b2","visibleName":"Vol 2","variant":"manga","seriePath":"Serie",
               "imagesFolder":"Vol 2","format":"mokuro"}""",
        )

        assertEquals(
            "https://example.test/api/static/mangas/Serie/Vol%202/001.jpg",
            urls.bookImage(mokuroBook, "Vol 2/001.jpg")?.toString(),
        )
    }

    @Test
    fun `doujinshi page url uses the doujinshi static folder`() {
        val doujinshiBook = book(
            """{"_id":"b3","visibleName":"Doujin 1","variant":"doujinshi","seriePath":"Serie",
               "imagesFolder":"Doujin 1","format":"images"}""",
        )

        assertEquals(
            "https://example.test/api/static/doujinshi/Serie/Doujin%201/001.jpg",
            urls.bookImage(doujinshiBook, "Doujin 1/001.jpg")?.toString(),
        )
    }

    @Test
    fun `doujinshi serie cover uses the doujinshi static folder`() {
        val serie = Serie(
            id = "s1",
            variant = Variant.Doujinshi,
            thumbnailPath = "Serie/cover.jpg",
        )

        assertEquals(
            "https://example.test/api/static/doujinshi/Serie/cover.jpg",
            urls.serieCover(serie)?.toString(),
        )
    }
}
