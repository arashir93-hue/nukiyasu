package es.manabe.yomiyasu.core.readers

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderSpreadTest {

    @Test
    fun `single page when double page disabled`() {
        val spreads = SpreadLayout.spreads(pageCount = 4, doublePage = false, hasCover = true)

        assertEquals(4, spreads.size)
        assertEquals(listOf(0), spreads[0].pages)
        assertEquals(listOf(3), spreads[3].pages)
    }

    @Test
    fun `cover as lone first spread`() {
        val spreads = SpreadLayout.spreads(pageCount = 5, doublePage = true, hasCover = true)

        assertEquals(listOf(0), spreads[0].pages)
        assertEquals(listOf(1, 2), spreads[1].pages)
        assertEquals(listOf(3, 4), spreads[2].pages)
        assertEquals(3, spreads.size)
    }

    @Test
    fun `no cover pairs from first page`() {
        val spreads = SpreadLayout.spreads(pageCount = 5, doublePage = true, hasCover = false)

        assertEquals(listOf(0, 1), spreads[0].pages)
        assertEquals(listOf(2, 3), spreads[1].pages)
        assertEquals(listOf(4), spreads[2].pages)
    }

    @Test
    fun `odd final page stays alone`() {
        val spreads = SpreadLayout.spreads(pageCount = 4, doublePage = true, hasCover = true)

        assertEquals(listOf(0), spreads[0].pages)
        assertEquals(listOf(1, 2), spreads[1].pages)
        assertEquals(listOf(3), spreads[2].pages)
    }

    @Test
    fun `spread index mapping with cover`() {
        assertEquals(0, SpreadLayout.spreadIndex(page = 0, doublePage = true, hasCover = true))
        assertEquals(1, SpreadLayout.spreadIndex(page = 1, doublePage = true, hasCover = true))
        assertEquals(1, SpreadLayout.spreadIndex(page = 2, doublePage = true, hasCover = true))
        assertEquals(2, SpreadLayout.spreadIndex(page = 3, doublePage = true, hasCover = true))
    }

    @Test
    fun `spread index mapping without cover`() {
        assertEquals(0, SpreadLayout.spreadIndex(page = 0, doublePage = true, hasCover = false))
        assertEquals(0, SpreadLayout.spreadIndex(page = 1, doublePage = true, hasCover = false))
        assertEquals(1, SpreadLayout.spreadIndex(page = 2, doublePage = true, hasCover = false))
    }

    @Test
    fun `logical page maps to the same page in portrait and landscape`() {
        val logicalPage = 17
        val portrait = SpreadLayout.spreads(pageCount = 40, doublePage = false, hasCover = true)
        val landscape = SpreadLayout.spreads(pageCount = 40, doublePage = true, hasCover = true)

        assertEquals(logicalPage, portrait[SpreadLayout.spreadIndex(logicalPage, false, true)].firstPage)

        val landscapeIndex = SpreadLayout.spreadIndex(logicalPage, true, true)
        assertEquals(logicalPage, landscape[landscapeIndex].pages.first())
        assertTrue(logicalPage in landscape[landscapeIndex].pages)
    }

    @Test
    fun `logical page mapping keeps first and last pages within bounds`() {
        val spreads = SpreadLayout.spreads(pageCount = 5, doublePage = true, hasCover = true)

        assertEquals(0, SpreadLayout.spreadIndex(0, true, true))
        assertEquals(spreads.lastIndex, SpreadLayout.spreadIndex(4, true, true))
    }

    @Test
    fun `logical page remains stable through repeated portrait landscape conversions`() {
        val logicalPage = 17
        val landscape = SpreadLayout.spreads(pageCount = 40, doublePage = true, hasCover = true)

        repeat(4) {
            val landscapeSpread = landscape[SpreadLayout.spreadIndex(logicalPage, true, true)]
            assertTrue(logicalPage in landscapeSpread.pages)
            assertEquals(logicalPage, SpreadLayout.spreadIndex(logicalPage, false, true))
        }
    }

    @Test
    fun `empty book has no spreads`() {
        assertTrue(SpreadLayout.spreads(pageCount = 0, doublePage = true, hasCover = true).isEmpty())
    }
}
