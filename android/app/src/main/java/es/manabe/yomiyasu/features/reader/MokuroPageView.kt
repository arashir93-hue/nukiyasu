package es.manabe.yomiyasu.features.reader

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import es.manabe.yomiyasu.core.mokuro.MokuroPage
import es.manabe.yomiyasu.core.mokuro.MokuroParagraph
import es.manabe.yomiyasu.core.mokuro.MokuroTextBox
import es.manabe.yomiyasu.core.readers.MokuroTextHit
import es.manabe.yomiyasu.core.readers.TategakiLayout
import es.manabe.yomiyasu.core.settings.ReaderFont
import es.manabe.yomiyasu.core.settings.ZoomMode
import kotlin.math.min

@Composable
fun readerFontFamily(font: ReaderFont): FontFamily {
    val assets = LocalContext.current.assets
    return when (font) {
        ReaderFont.System -> FontFamily.Default
        else -> FontFamily(Font("fonts/${font.fontAsset}", assets))
    }
}

@Composable
fun MokuroPageView(
    page: MokuroPage,
    imageModel: Any?,
    fitMode: ZoomMode,
    fontSizeOverride: Float,
    displayOCR: Boolean,
    textBoxBorders: Boolean,
    selectedBoxId: Int?,
    font: ReaderFont,
    boxTapsEnabled: Boolean = true,
    onBoxTap: (MokuroTextBox, MokuroTextHit, Offset) -> Unit,
    onOutsideActiveBoxTap: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val fontFamily = readerFontFamily(font)

    BoxWithConstraints(modifier = modifier) {
        val containerWidthPx = constraints.maxWidth.toFloat()
        val containerHeightPx = constraints.maxHeight.toFloat()

        val pageWidth = page.size.width
        val pageHeight = page.size.height

        val fitScale = when (fitMode) {
            ZoomMode.FitWidth -> if (pageWidth > 0) containerWidthPx / pageWidth else 1f
            ZoomMode.Original -> with(density) { 1.dp.toPx() }
            else -> min(
                if (pageWidth > 0) containerWidthPx / pageWidth else 1f,
                if (pageHeight > 0) containerHeightPx / pageHeight else 1f,
            )
        }.takeIf { it.isFinite() && it > 0f } ?: 1f

        val geometry = MokuroPageGeometry(
            sourceSize = Size(pageWidth, pageHeight),
            // ContentScale.FillBounds fills this page node exactly. The
            // parent's spread/zoom transform is applied to the whole node.
            imageRect = Rect(
                left = 0f,
                top = 0f,
                right = pageWidth * fitScale,
                bottom = pageHeight * fitScale,
            ),
        )

        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(
                    width = with(density) { (pageWidth * fitScale).toDp() },
                    height = with(density) { (pageHeight * fitScale).toDp() },
                )
                .pointerInput(page.id, geometry, fontSizeOverride, displayOCR, selectedBoxId, boxTapsEnabled) {
                    if (boxTapsEnabled) {
                        detectMokuroBoxTap {
                            handleBoxTap(
                                position = it,
                                geometry = geometry,
                                page = page,
                                fontSizeOverride = fontSizeOverride,
                                onBoxTap = { box, hit, tapPosition ->
                                    if (selectedBoxId != null && selectedBoxId != box.id) {
                                        // A different box is still outside the
                                        // currently active one. Consume this
                                        // tap as deselection; activation of the
                                        // other box requires a second tap.
                                        onOutsideActiveBoxTap()
                                    } else {
                                        onBoxTap(box, hit, tapPosition)
                                    }
                                },
                            )
                        }
                    }
                },
        ) {
            AsyncImage(
                model = imageModel,
                contentDescription = page.imagePath,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.FillBounds,
            )

            Canvas(modifier = Modifier.fillMaxSize()) {
                page.boxes.forEach { box ->
                    val highlighted = box.id == selectedBoxId
                    val showingText = highlighted || displayOCR

                    if (showingText) {
                        val displayRect = geometry.sourceRectToRendered(box.rect)
                        drawRect(
                            // Mokuro's web reader uses an opaque white
                            // paragraph background to hide the rasterized
                            // source text. A translucent highlight leaves the
                            // original glyphs visible underneath.
                            color = Color.White,
                            topLeft = Offset(displayRect.left, displayRect.top),
                            size = Size(displayRect.width, displayRect.height),
                        )

                        // Horizontal selected text is rendered by the native
                        // selectable overlay below. Vertical selected text
                        // keeps using the existing tategaki glyph layout;
                        // the selectable layer is transparent in that case.
                        if (!highlighted || box.isVertical) {
                            drawTategakiGlyphs(
                                box = box,
                                geometry = geometry,
                                fontSizeOverride = fontSizeOverride,
                                fontFamily = fontFamily,
                                measurer = measurer,
                            )
                        }
                    }

                    if (textBoxBorders) {
                        val displayRect = geometry.sourceRectToRendered(box.rect)
                        drawRect(
                            color = Color.Red.copy(alpha = 0.4f),
                            topLeft = Offset(displayRect.left, displayRect.top),
                            size = Size(displayRect.width, displayRect.height),
                            style = Stroke(width = 1f),
                        )
                    }
                }
            }

            page.boxes.firstOrNull { it.id == selectedBoxId }?.let { activeBox ->
                val activeRect = geometry.sourceRectToRendered(activeBox.rect)
                val activeText = mokuroSelectableText(activeBox.paragraphs)

                if (activeText.isNotBlank()) {
                    val fontSize = TategakiLayout.effectiveFontSize(
                        boxFontSize = activeBox.fontSize,
                        override = fontSizeOverride,
                        scale = geometry.uniformScale(),
                    )

                    // SelectionContainer gives the active box the same
                    // native copy/selection semantics as Mokuro's HTML
                    // paragraph. Its bounds are the transformed box bounds,
                    // so it does not alter the reader's scale or pan state.
                    // Keep a full-page host around SelectionContainer.  If
                    // the selectable child is the direct child of the page
                    // Box, its measured bounds are only the text bounds and
                    // an absolute offset can move the whole selection layer
                    // outside that tiny parent.  The full-page host keeps
                    // the overlay in the same coordinate space as the image
                    // while preserving native text selection.
                    Box(modifier = Modifier.fillMaxSize()) {
                        SelectionContainer(modifier = Modifier.fillMaxSize()) {
                            BasicText(
                                text = activeText,
                                style = TextStyle(
                                    fontSize = fontSize.sp,
                                    fontFamily = fontFamily,
                                    // Vertical glyphs are rendered by the
                                    // existing TategakiLayout/Canvas path.
                                    // BasicText remains the logical selectable
                                    // source without drawing a second
                                    // horizontal version over it.
                                    color = if (activeBox.isVertical) {
                                        Color.Transparent
                                    } else {
                                        Color.Black
                                    },
                                    // The page itself may be laid out RTL,
                                    // but the overlay's x-origin is already
                                    // the physical left edge calculated by
                                    // MokuroPageGeometry.  TextAlign.Start
                                    // would resolve to the right edge in RTL
                                    // and visibly shift the glyphs inside the
                                    // otherwise correctly placed box.
                                    textAlign = TextAlign.Left,
                                ),
                                modifier = Modifier
                                    // Geometry is expressed in physical page
                                    // pixels. Do not let the surrounding RTL
                                    // layout mirror this offset.
                                    .absoluteOffset(
                                        x = with(density) { activeRect.left.toDp() },
                                        y = with(density) { activeRect.top.toDp() },
                                    )
                                    .width(with(density) { activeRect.width.toDp() })
                                    .height(with(density) { activeRect.height.toDp() }),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun DrawScope.drawTategakiGlyphs(
    box: MokuroTextBox,
    geometry: MokuroPageGeometry,
    fontSizeOverride: Float,
    fontFamily: FontFamily,
    measurer: TextMeasurer,
) {
    val glyphs = TategakiLayout.layout(box, fontSizeOverride, geometry.uniformScale())
    if (glyphs.isEmpty()) return

    val style = TextStyle(
        fontSize = (glyphs.first().cell / 1.1f).toSp(),
        fontFamily = fontFamily,
        color = Color.Black,
    )

    glyphs.forEach { glyph ->
        val layout = measurer.measure(
            text = AnnotatedString(glyph.text),
            style = style,
        )

        drawText(
            textLayoutResult = layout,
            topLeft = Offset(
                x = glyph.x + geometry.imageRect.left,
                y = glyph.y + geometry.imageRect.top,
            ),
        )
    }
}

private suspend fun PointerInputScope.detectMokuroBoxTap(onTap: (Offset) -> Boolean) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var moved = false

        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Main)
            val change = event.changes.firstOrNull { it.id == down.id } ?: break
            if ((change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                moved = true
            }
            if (!change.pressed) {
                if (!moved && !change.isConsumed && onTap(change.position)) {
                    change.consume()
                }
                break
            }
        }
    }
}

/** Logical text exposed to selection/copy, independent of writing mode. */
internal fun mokuroSelectableText(paragraphs: List<MokuroParagraph>): String =
    paragraphs.joinToString("\n") { it.text }

internal fun mokuroBoxContainsPoint(box: MokuroTextBox, pagePosition: Offset): Boolean =
    pagePosition.x >= box.rect.left &&
        pagePosition.x <= box.rect.left + box.rect.width &&
        pagePosition.y >= box.rect.top &&
        pagePosition.y <= box.rect.top + box.rect.height

private fun handleBoxTap(
    position: Offset,
    geometry: MokuroPageGeometry,
    page: MokuroPage,
    fontSizeOverride: Float,
    onBoxTap: (MokuroTextBox, MokuroTextHit, Offset) -> Unit,
): Boolean {
    // Pointer input is attached to the page node below the reader's
    // graphicsLayer, therefore Compose has already converted viewport
    // coordinates through zoom/pan. Convert the fitted page pixels back to
    // Mokuro's source coordinate system for hit testing.
    val pagePosition = geometry.renderedToSource(position)
    val pageX = pagePosition.x
    val pageY = pagePosition.y

    val box = page.boxes
        .asReversed()
        .firstOrNull { candidate -> mokuroBoxContainsPoint(candidate, pagePosition) }

    if (box == null) return false

    val hit = TategakiLayout.locate(
        box = box,
        pageX = pageX,
        pageY = pageY,
        scale = geometry.uniformScale(),
        fontSizeOverride = fontSizeOverride,
    ) ?: MokuroTextHit(0, 0)

    onBoxTap(box, hit, position)
    return true
}
