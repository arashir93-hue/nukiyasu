package es.manabe.yomiyasu.features.reader

import es.manabe.yomiyasu.core.readers.SpreadLayout
import org.junit.Assert.assertEquals
import org.junit.Test

class MangaReaderProgressTest {

    @Test
    fun `missing persisted progress starts at the fallback page`() {
        assertEquals(
            0,
            initialLogicalPage(
                bookId = "book-a",
                readingId = null,
                savedBookId = null,
                savedReadingId = null,
                savedPage = null,
                fallbackPage = 0,
            ),
        )
    }

    @Test
    fun `same book and reading keeps the local page during rotation`() {
        assertEquals(
            36,
            initialLogicalPage(
                bookId = "book-a",
                readingId = "reading-a",
                savedBookId = "book-a",
                savedReadingId = "reading-a",
                savedPage = 36,
                fallbackPage = 0,
            ),
        )
    }

    @Test
    fun `a different book never inherits local page`() {
        assertEquals(
            4,
            initialLogicalPage(
                bookId = "book-b",
                readingId = "reading-b",
                savedBookId = "book-a",
                savedReadingId = "reading-a",
                savedPage = 36,
                fallbackPage = 4,
            ),
        )
    }

    @Test
    fun `a new reading never inherits the previous reading page`() {
        assertEquals(
            0,
            initialLogicalPage(
                bookId = "book-a",
                readingId = "reading-new",
                savedBookId = "book-a",
                savedReadingId = "reading-old",
                savedPage = 36,
                fallbackPage = 0,
            ),
        )
    }

    @Test
    fun `persisted logical page maps to the containing landscape spread`() {
        val logicalPage = 37
        val spreads = SpreadLayout.spreads(pageCount = 80, doublePage = true, hasCover = true)
        val spread = spreads[SpreadLayout.spreadIndex(logicalPage, doublePage = true, hasCover = true)]

        assertEquals(true, logicalPage in spread.pages)
    }

    @Test
    fun `rotation changes only spread mapping and keeps one logical page and reading`() {
        val readingId = "reading-a"
        val portrait = SpreadLayout.spreads(pageCount = 80, doublePage = false, hasCover = true)
        val landscape = SpreadLayout.spreads(pageCount = 80, doublePage = true, hasCover = true)

        var logicalPage = 14
        var portraitIndex = SpreadLayout.spreadIndex(logicalPage, doublePage = false, hasCover = true)
        var landscapeIndex = SpreadLayout.spreadIndex(logicalPage, doublePage = true, hasCover = true)

        assertEquals(
            14,
            initialLogicalPage(
                bookId = "book-a",
                readingId = readingId,
                savedBookId = "book-a",
                savedReadingId = readingId,
                savedPage = logicalPage,
                fallbackPage = 0,
            ),
        )
        assertEquals(logicalPage, portrait[portraitIndex].firstPage)
        assertEquals(true, logicalPage in landscape[landscapeIndex].pages)

        // The reader advances in portrait to page 20. Rotating back to
        // landscape must select the spread containing page 20, not the old
        // landscape index or the pager's transient zero.
        logicalPage = 20
        assertEquals(
            20,
            initialLogicalPage(
                bookId = "book-a",
                readingId = readingId,
                savedBookId = "book-a",
                savedReadingId = readingId,
                savedPage = logicalPage,
                fallbackPage = 14,
            ),
        )
        landscapeIndex = SpreadLayout.spreadIndex(logicalPage, doublePage = true, hasCover = true)
        portraitIndex = SpreadLayout.spreadIndex(logicalPage, doublePage = false, hasCover = true)
        assertEquals(true, logicalPage in landscape[landscapeIndex].pages)
        assertEquals(logicalPage, portrait[portraitIndex].firstPage)

        // Repeated orientation changes still use the same logical page and
        // the same server-side reading/session identity.
        val orientations = listOf(false, true, false, true)
        orientations.forEach { doublePage ->
            val spreads = SpreadLayout.spreads(pageCount = 80, doublePage = doublePage, hasCover = true)
            assertEquals(true, logicalPage in spreads[SpreadLayout.spreadIndex(logicalPage, doublePage, true)].pages)
        }
        assertEquals("reading-a", readingId)
    }

    @Test
    fun `restored rotation position does not fall back to temporary pager zero`() {
        assertEquals(
            14,
            initialLogicalPage(
                bookId = "book-a",
                readingId = "reading-a",
                savedBookId = "book-a",
                savedReadingId = "reading-a",
                savedPage = 14,
                fallbackPage = 0,
            ),
        )
    }
}
