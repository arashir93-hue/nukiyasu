package es.manabe.yomiyasu.features.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.compose.ui.geometry.Offset

class MangaReaderGestureTest {

    @Test
    fun `left third advances and right third goes back`() {
        assertEquals(ReaderTapAction.Next, readerTapAction(20f, 300))
        assertEquals(ReaderTapAction.Previous, readerTapAction(280f, 300))
    }

    @Test
    fun `center and invalid size toggle controls`() {
        assertEquals(ReaderTapAction.ToggleBars, readerTapAction(150f, 300))
        assertEquals(ReaderTapAction.ToggleBars, readerTapAction(20f, 0))
    }

    @Test
    fun `double tap toggles symmetrically between one and two times`() {
        assertEquals(2f, readerScaleAfterDoubleTap(1f))
        assertEquals(1f, readerScaleAfterDoubleTap(2f))
        assertEquals(1f, readerScaleAfterDoubleTap(6f))
    }

    @Test
    fun `active OCR box consumes an outside tap for deselection`() {
        assertEquals(
            ReaderTapAction.DeselectBox,
            readerTapAction(positionX = 10f, width = 300, activeBoxId = 7),
        )
        assertEquals(
            ReaderTapAction.DeselectBox,
            readerTapAction(positionX = 150f, width = 300, activeBoxId = 7),
        )
        assertEquals(
            ReaderTapAction.DeselectBox,
            readerTapAction(positionX = 290f, width = 300, activeBoxId = 7),
        )
    }

    @Test
    fun `page changes preserve scale but reset pan`() {
        assertEquals(2f, readerScaleAfterPageChange(2f))
        assertEquals(1f, readerScaleAfterPageChange(1f))
        assertEquals(Offset.Zero, readerPanAfterPageChange())
    }

    @Test
    fun `double tap is recognized without changing the tap zone`() {
        val first = ReaderTapSample(Offset(40f, 80f), 1_000L)
        val second = ReaderTapSample(Offset(42f, 81f), 1_180L)

        assertTrue(isReaderDoubleTap(first, second, 40L, 300L, 24f))
        assertFalse(isReaderDoubleTap(first, second.copy(timeMillis = 1_400L), 40L, 300L, 24f))
        assertFalse(isReaderDoubleTap(first, second.copy(position = Offset(100f, 80f)), 40L, 300L, 24f))
    }

    @Test
    fun `double tap target uses the reader scale`() {
        assertEquals(2f, READER_DOUBLE_TAP_SCALE)
        assertEquals(2f, readerScaleAfterPageChange(READER_DOUBLE_TAP_SCALE))
    }

    @Test
    fun `zoomed page starts at the top within real pan bounds`() {
        assertEquals(
            Offset(0f, 500f),
            readerPanForNewPage(
                scale = 2f,
                viewportWidth = 1_000f,
                viewportHeight = 1_000f,
                contentWidth = 1_000f,
                contentHeight = 1_000f,
            ),
        )
        assertEquals(
            Offset.Zero,
            readerPanForNewPage(
                scale = 2f,
                viewportWidth = 1_000f,
                viewportHeight = 1_000f,
                contentWidth = 800f,
                contentHeight = 400f,
            ),
        )
        assertEquals(
            Offset.Zero,
            readerPanForNewPage(
                scale = 1f,
                viewportWidth = 1_000f,
                viewportHeight = 1_000f,
                contentWidth = 800f,
                contentHeight = 400f,
            ),
        )
    }
}
