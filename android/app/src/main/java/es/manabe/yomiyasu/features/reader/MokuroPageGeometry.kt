package es.manabe.yomiyasu.features.reader

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import es.manabe.yomiyasu.core.mokuro.MokuroRect

/**
 * One coordinate transform shared by Mokuro hit testing and its OCR overlay.
 *
 * [sourceSize] is the coordinate space stored in Mokuro HTML. [imageRect] is
 * the actual image rectangle in the page composable, in local pixels. Keeping
 * the letterbox origin in this object prevents the two callers from applying
 * different scale/offset arithmetic.
 */
internal data class MokuroPageGeometry(
    val sourceSize: Size,
    val imageRect: Rect,
) {
    private val scaleX: Float
        get() = if (sourceSize.width > 0f) imageRect.width / sourceSize.width else 1f

    private val scaleY: Float
        get() = if (sourceSize.height > 0f) imageRect.height / sourceSize.height else 1f

    fun sourceToRendered(point: Offset): Offset = Offset(
        x = imageRect.left + point.x * scaleX,
        y = imageRect.top + point.y * scaleY,
    )

    fun renderedToSource(point: Offset): Offset = Offset(
        x = if (scaleX > 0f) (point.x - imageRect.left) / scaleX else point.x,
        y = if (scaleY > 0f) (point.y - imageRect.top) / scaleY else point.y,
    )

    fun sourceRectToRendered(rect: MokuroRect): Rect {
        val topLeft = sourceToRendered(Offset(rect.left, rect.top))
        val bottomRight = sourceToRendered(
            Offset(rect.left + rect.width, rect.top + rect.height),
        )
        return Rect(topLeft, bottomRight)
    }

    /** Mokuro's text layout currently accepts one uniform scale value. */
    fun uniformScale(): Float = scaleX
}

internal fun mokuroFitImageRect(sourceSize: Size, viewportSize: Size): Rect {
    if (sourceSize.width <= 0f || sourceSize.height <= 0f ||
        viewportSize.width <= 0f || viewportSize.height <= 0f
    ) {
        return Rect(Offset.Zero, viewportSize)
    }

    val scale = minOf(
        viewportSize.width / sourceSize.width,
        viewportSize.height / sourceSize.height,
    )
    val renderedSize = Size(sourceSize.width * scale, sourceSize.height * scale)
    return Rect(
        left = (viewportSize.width - renderedSize.width) / 2f,
        top = (viewportSize.height - renderedSize.height) / 2f,
        right = (viewportSize.width + renderedSize.width) / 2f,
        bottom = (viewportSize.height + renderedSize.height) / 2f,
    )
}
