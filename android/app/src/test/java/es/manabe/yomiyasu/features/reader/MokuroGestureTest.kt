package es.manabe.yomiyasu.features.reader

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import es.manabe.yomiyasu.core.mokuro.MokuroRect
import es.manabe.yomiyasu.core.mokuro.MokuroParagraph
import es.manabe.yomiyasu.core.mokuro.MokuroTextBox
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MokuroGestureTest {

    private val box = MokuroTextBox(
        id = 3,
        rect = MokuroRect(left = 100f, top = 200f, width = 300f, height = 400f),
        fontSize = 32f,
        isVertical = true,
        zIndex = 0,
        paragraphs = emptyList(),
    )

    @Test
    fun `hit testing converts fitted coordinates at one times`() {
        val geometry = MokuroPageGeometry(
            sourceSize = Size(1_000f, 1_500f),
            imageRect = Rect(0f, 0f, 1_000f, 1_500f),
        )
        val pagePoint = geometry.renderedToSource(Offset(150f, 250f))
        assertEquals(Offset(150f, 250f), pagePoint)
        assertTrue(mokuroBoxContainsPoint(box, pagePoint))
    }

    @Test
    fun `hit testing converts fitted coordinates with zoom and pan already applied`() {
        // Compose delivers coordinates local to the transformed page node;
        // this helper then removes only Mokuro's fit scale.
        val geometry = MokuroPageGeometry(
            sourceSize = Size(1_000f, 1_500f),
            imageRect = Rect(0f, 0f, 2_000f, 3_000f),
        )
        val pagePoint = geometry.renderedToSource(Offset(300f, 500f))
        assertEquals(Offset(150f, 250f), pagePoint)
        assertTrue(mokuroBoxContainsPoint(box, pagePoint))
        assertFalse(mokuroBoxContainsPoint(box, Offset(99f, 250f)))
    }

    @Test
    fun `letterboxed geometry is shared by overlay and hit testing`() {
        val geometry = MokuroPageGeometry(
            sourceSize = Size(1_000f, 1_500f),
            imageRect = mokuroFitImageRect(
                sourceSize = Size(1_000f, 1_500f),
                viewportSize = Size(1_600f, 1_000f),
            ),
        )
        val sourcePoint = Offset(250f, 500f)
        val renderedPoint = geometry.sourceToRendered(sourcePoint)

        val roundTrip = geometry.renderedToSource(renderedPoint)
        assertEquals(sourcePoint.x, roundTrip.x, 0.001f)
        assertEquals(sourcePoint.y, roundTrip.y, 0.001f)
        assertTrue(renderedPoint.x > geometry.imageRect.left)
        assertTrue(geometry.imageRect.left > 0f)
    }

    @Test
    fun `fit geometry handles horizontal letterboxing`() {
        val geometry = MokuroPageGeometry(
            sourceSize = Size(1_500f, 1_000f),
            imageRect = mokuroFitImageRect(
                sourceSize = Size(1_500f, 1_000f),
                viewportSize = Size(1_000f, 1_600f),
            ),
        )

        assertTrue(geometry.imageRect.top > 0f)
        val sourcePoint = Offset(750f, 400f)
        val roundTrip = geometry.renderedToSource(geometry.sourceToRendered(sourcePoint))
        assertEquals(sourcePoint.x, roundTrip.x, 0.001f)
        assertEquals(sourcePoint.y, roundTrip.y, 0.001f)
    }

    @Test
    fun `zoom and pan round trip preserves source point`() {
        val base = MokuroPageGeometry(
            sourceSize = Size(1_000f, 1_500f),
            imageRect = Rect(40f, 80f, 2_040f, 3_080f),
        )
        val sourcePoint = Offset(425f, 735f)

        assertEquals(sourcePoint, base.renderedToSource(base.sourceToRendered(sourcePoint)))
    }

    @Test
    fun `a tap inside active box remains an OCR interaction`() {
        assertTrue(mokuroBoxContainsPoint(box, Offset(200f, 300f)))
        // Outside taps are classified by the parent as deselection and are
        // consumed before navigation; the box hit-test itself stays false.
        assertFalse(mokuroBoxContainsPoint(box, Offset(10f, 20f)))
    }

    @Test
    fun `active overlay bounds are physical page bounds inside its full size host`() {
        val hostSize = Size(800f, 1_200f)
        val geometry = MokuroPageGeometry(
            sourceSize = Size(1_000f, 1_500f),
            imageRect = Rect(0f, 0f, hostSize.width, hostSize.height),
        )

        val overlay = geometry.sourceRectToRendered(box.rect)
        val expected = Rect(left = 80f, top = 160f, right = 320f, bottom = 480f)

        assertEquals(expected, overlay)
        assertTrue(overlay.left >= 0f && overlay.top >= 0f)
        assertTrue(overlay.right <= hostSize.width && overlay.bottom <= hostSize.height)
    }

    @Test
    fun `selection keeps logical paragraph text without per-character line breaks`() {
        assertEquals(
            "日本語、テスト\nABC123！",
            mokuroSelectableText(
                listOf(
                    MokuroParagraph(0, "日本語、テスト"),
                    MokuroParagraph(1, "ABC123！"),
                ),
            ),
        )
    }
}
