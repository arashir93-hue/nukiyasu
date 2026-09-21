package es.manabe.yomiyasu.features.reader

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import dagger.hilt.android.EntryPointAccessors
import es.manabe.yomiyasu.components.LibraryEntryPoint
import es.manabe.yomiyasu.core.mokuro.MokuroBook
import es.manabe.yomiyasu.core.mokuro.MokuroTextBox
import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.readers.MokuroTextHit
import es.manabe.yomiyasu.core.readers.ReaderSpread
import es.manabe.yomiyasu.core.readers.ReadingTimer
import es.manabe.yomiyasu.core.readers.SpreadLayout
import es.manabe.yomiyasu.core.readers.TategakiLayout
import es.manabe.yomiyasu.core.services.DownloadState
import es.manabe.yomiyasu.core.settings.DictionaryLookupMode
import es.manabe.yomiyasu.core.settings.ReaderSettingsData
import es.manabe.yomiyasu.core.settings.ZoomMode
import es.manabe.yomiyasu.features.nihongotracker.NihongoTrackerReaderButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class DictionaryRequest(
    val query: String,
    val sentence: String,
    val mode: DictionaryLookupMode,
)

private const val READER_MIN_SCALE = 1f
private const val READER_MAX_SCALE = 6f
internal const val READER_DOUBLE_TAP_SCALE = 2f

internal fun readerScaleAfterDoubleTap(scale: Float): Float =
    if (scale > READER_MIN_SCALE + 0.001f) READER_MIN_SCALE else READER_DOUBLE_TAP_SCALE

internal fun readerScaleAfterPageChange(scale: Float): Float =
    scale.coerceIn(READER_MIN_SCALE, READER_MAX_SCALE)

internal fun readerPanAfterPageChange(): Offset = Offset.Zero

internal fun readerPanBounds(
    scale: Float,
    viewportWidth: Float,
    viewportHeight: Float,
    contentWidth: Float,
    contentHeight: Float,
): Offset {
    if (scale <= READER_MIN_SCALE || viewportWidth <= 0f || viewportHeight <= 0f) {
        return Offset.Zero
    }

    return Offset(
        x = ((contentWidth * scale - viewportWidth) / 2f).coerceAtLeast(0f),
        y = ((contentHeight * scale - viewportHeight) / 2f).coerceAtLeast(0f),
    )
}

internal fun readerPanForNewPage(
    scale: Float,
    viewportWidth: Float,
    viewportHeight: Float,
    contentWidth: Float,
    contentHeight: Float,
): Offset {
    if (scale <= READER_MIN_SCALE) return Offset.Zero
    val bounds = readerPanBounds(
        scale = scale,
        viewportWidth = viewportWidth,
        viewportHeight = viewportHeight,
        contentWidth = contentWidth,
        contentHeight = contentHeight,
    )
    return Offset(x = 0f, y = bounds.y)
}

@Composable
private fun MangaReaderSystemBarsEffect() {
    val view = LocalView.current
    val window = LocalActivity.current?.window

    if (window != null && !view.isInEditMode) {
        DisposableEffect(window, view) {
            val controller = WindowCompat.getInsetsController(window, view)
            val previousBehavior = controller.systemBarsBehavior
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())

            onDispose {
                controller.show(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = previousBehavior
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MangaReaderView(
    initialBookId: String,
    onBack: () -> Unit,
    onOpenNavigation: () -> Unit = {},
    viewModel: MangaReaderViewModel = hiltViewModel(),
) {
    MangaReaderSystemBarsEffect()

    val loadState by viewModel.state.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val settings by viewModel.settingsData.collectAsStateWithLifecycle()
    val appSettings by viewModel.appSettingsData.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()

    val context = LocalContext.current
    val downloads = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            LibraryEntryPoint::class.java,
        ).downloadManager()
    }
    val downloadStates by downloads.states.collectAsStateWithLifecycle()
    val downloadRecords by downloads.records.collectAsStateWithLifecycle()

    var currentBookId by remember { mutableStateOf(initialBookId) }
    var showingBars by remember { mutableStateOf(true) }
    var showingSettings by remember { mutableStateOf(false) }
    var showingPageText by remember { mutableStateOf(false) }
    var selectedBoxId by remember { mutableIntStateOf(-1) }
    var dictionary by remember { mutableStateOf<DictionaryRequest?>(null) }
    var alertMessage by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val timer = remember { ReadingTimer(scope) }
    val timerSeconds by timer.seconds.collectAsStateWithLifecycle()
    val timerRunning by timer.isRunning.collectAsStateWithLifecycle()

    val book = loadState.book
    val mokuro = loadState.mokuro

    val spreads = remember(mokuro, settings.doublePage, settings.hasCover) {
        mokuro?.let {
            SpreadLayout.spreads(
                pageCount = it.pages.size,
                doublePage = settings.doublePage,
                hasCover = settings.hasCover,
            )
        } ?: emptyList()
    }

    val pagerState = rememberPagerState(pageCount = { spreads.size })
    // Separa la restauración inicial de las actualizaciones normales del pager:
    // el pager nace en 0 y no debe sobrescribir la posición lógica guardada.
    var positionInitialized by remember { mutableStateOf(false) }
    var suppressPositionUpdate by remember { mutableStateOf(false) }
    var restoredPagerTarget by remember { mutableIntStateOf(-1) }

    LaunchedEffect(currentBookId) {
        selectedBoxId = -1
        showingBars = true
        positionInitialized = false
        viewModel.load(currentBookId)
    }

    LaunchedEffect(
        loadState.book?.id,
        loadState.readingId,
        loadState.startPage,
        loadState.startTime,
        mokuro,
        spreads,
    ) {
        val loadedBook = loadState.book ?: return@LaunchedEffect
        if (mokuro == null || spreads.isEmpty()) return@LaunchedEffect

        positionInitialized = false
        val logicalPage = viewModel.logicalPageFor(
            bookId = loadedBook.id,
            readingId = loadState.readingId,
            fallbackPage = loadState.startPage,
        )

        val target = SpreadLayout.spreadIndex(
            page = logicalPage,
            doublePage = settings.doublePage,
            hasCover = settings.hasCover,
        ).coerceIn(0, spreads.size - 1)
        restoredPagerTarget = target
        suppressPositionUpdate = true

        if (pagerState.currentPage != target) {
            // The pager may emit its temporary page 0 while its page count
            // changes (for example during a portrait/landscape recreation).
            // Keep suppression enabled until the requested spread is reached.
            pagerState.scrollToPage(target)
        } else {
            suppressPositionUpdate = false
        }

        viewModel.rememberLogicalPage(loadedBook.id, loadState.readingId, logicalPage)
        positionInitialized = true

        timer.resume(fromSeconds = loadState.startTime)
        if (appSettings.autoCrono) timer.start()
    }

    val currentPageNumber: Int = spreads.getOrNull(pagerState.currentPage)?.firstPage?.plus(1) ?: 1
    val totalPages = mokuro?.pages?.size ?: 0
    val atLastPage = totalPages > 0 && spreads.getOrNull(pagerState.currentPage)?.pages?.contains(totalPages - 1) == true
    val latestBook by rememberUpdatedState(book)
    val latestPage by rememberUpdatedState(currentPageNumber)
    val latestTimerSeconds by rememberUpdatedState(timerSeconds)
    var leavingReader by remember { mutableStateOf(false) }

    val leaveReader: () -> Unit = {
        if (!leavingReader) {
            leavingReader = true
            scope.launch {
                runCatching {
                    latestBook?.let {
                        viewModel.saveProgressNow(it, latestPage, latestTimerSeconds)
                    }
                }
                // This is a real reader exit, unlike a configuration change.
                // Clear only now so a recreated Activity can restore the same
                // logical page and reading id from SavedStateHandle.
                viewModel.clearReaderPosition()
                onBack()
            }
        }
    }

    BackHandler(enabled = !leavingReader, onBack = leaveReader)

    val navigate: (Boolean) -> Unit = { forward ->
        scope.launch {
            val target = (pagerState.currentPage + if (forward) 1 else -1)
                .coerceIn(0, max(spreads.size - 1, 0))
            pagerState.animateScrollToPage(target)
        }
    }

    LaunchedEffect(pagerState, spreads, currentBookId, loadState.readingId) {
        snapshotFlow { pagerState.currentPage }.collect { index ->
            if (positionInitialized) {
                if (suppressPositionUpdate) {
                    // Ignore every transient index until the restored target
                    // is reached. In particular, PagerState can briefly emit
                    // 0 when its spread list is rebuilt; that value must not
                    // overwrite the logical page saved for this reading.
                    if (index == restoredPagerTarget) {
                        suppressPositionUpdate = false
                    }
                } else {
                    suppressPositionUpdate = false
                    spreads.getOrNull(index)?.firstPage?.let {
                        viewModel.rememberLogicalPage(currentBookId, loadState.readingId, it)
                    }
                }
            }
        }
    }

    LaunchedEffect(spreads.size) {
        if (spreads.isEmpty()) return@LaunchedEffect

        while (true) {
            delay(60_000)
            book?.let { viewModel.saveProgress(it, currentPageNumber, timerSeconds) }
        }
    }

    LaunchedEffect(appSettings.idleTimeout) {
        timer.idleTimeoutMinutes = appSettings.idleTimeout
    }

    LaunchedEffect(pagerState.currentPage) {
        timer.notifyActivity()
    }

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        timer.pause()
        book?.let { viewModel.saveProgress(it, currentPageNumber, timerSeconds) }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_START) {
        if (appSettings.autoCrono) timer.start()
    }

    DisposableEffect(Unit) {
        onDispose {
            timer.pause()
            latestBook?.let { viewModel.saveProgress(it, latestPage, latestTimerSeconds) }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            isLoading && book == null -> CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = Color.White,
            )

            error != null && book == null -> Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("No se pudo abrir", color = Color.White, fontWeight = FontWeight.Bold)
                Text(error.orEmpty(), color = Color.White, modifier = Modifier.padding(16.dp))
                TextButton(onClick = { viewModel.load(currentBookId) }) {
                    Text("Reintentar", color = Color.White)
                }
            }

            book != null && mokuro != null -> {
                ReaderPager(
                    book = book!!,
                    mokuro = mokuro!!,
                    settings = settings,
                    spreads = spreads,
                    pagerState = pagerState,
                    selectedBoxId = selectedBoxId,
                    isImageFolder = book!!.isImageFolder,
                    imageModel = { imagePath -> viewModel.imageModel(book!!, imagePath) },
                    onBoxTap = { box, hit ->
                        if (selectedBoxId == box.id && settings.nativeDictionary) {
                            val paragraph = box.paragraphs.getOrNull(hit.paragraphIndex)?.text.orEmpty()
                            val query = when (settings.dictionaryVersion) {
                                DictionaryLookupMode.Word -> TategakiLayout
                                    .codePoints(paragraph)
                                    .drop(hit.characterIndex)
                                    .joinToString("")

                                DictionaryLookupMode.Sentence -> paragraph
                            }
                            dictionary = DictionaryRequest(
                                query = query.ifEmpty { paragraph },
                                sentence = paragraph,
                                mode = settings.dictionaryVersion,
                            )
                        } else {
                            selectedBoxId = box.id
                        }
                    },
                    onDeselectBox = { selectedBoxId = -1 },
                    onToggleBars = { showingBars = !showingBars },
                    onNavigate = navigate,
                )

                if (showingBars) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        ReaderTopBar(
                            book = book!!,
                            isDownloaded = downloadRecords.containsKey(currentBookId),
                            downloadState = downloadStates[currentBookId] ?: DownloadState.NotDownloaded,
                            isOnline = isOnline,
                            showTextButton = !book!!.isImageFolder,
                            onBack = leaveReader,
                            onOpenNavigation = onOpenNavigation,
                            onDownload = { book?.let { downloads.enqueue(it) } },
                            onOpenText = { showingPageText = true },
                            onOpenSettings = { showingSettings = true },
                            nihongoTrackerContent = {
                                NihongoTrackerReaderButton(
                                    book = book!!,
                                    completed = atLastPage,
                                    saveProgress = {
                                        viewModel.saveProgressNow(book!!, currentPageNumber, timerSeconds)
                                    },
                                    startReread = {
                                        viewModel.startReread(book!!)
                                    },
                                )
                            },
                        )

                        Spacer(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                        )

                        ReaderBottomBar(
                            pageNumber = currentPageNumber,
                            totalPages = totalPages,
                            spreadIndex = pagerState.currentPage,
                            spreadCount = spreads.size,
                            timerText = timer.formatted(),
                            timerRunning = timerRunning,
                            showCrono = appSettings.showCrono,
                            onToggleTimer = { if (timerRunning) timer.pause() else timer.start() },
                            onPrevVolume = {
                                book?.let { viewModel.saveProgress(it, currentPageNumber, timerSeconds) }
                                viewModel.neighboringBook(
                                    bookId = currentBookId,
                                    forward = false,
                                    onResult = { neighbor ->
                                        if (neighbor != null) {
                                            currentBookId = neighbor.id
                                        } else {
                                            alertMessage = "No hay más volúmenes"
                                        }
                                    },
                                    onError = { alertMessage = it },
                                )
                            },
                            onNextVolume = {
                                book?.let { viewModel.saveProgress(it, currentPageNumber, timerSeconds) }
                                viewModel.neighboringBook(
                                    bookId = currentBookId,
                                    forward = true,
                                    onResult = { neighbor ->
                                        if (neighbor != null) {
                                            currentBookId = neighbor.id
                                        } else {
                                            alertMessage = "No hay más volúmenes"
                                        }
                                    },
                                    onError = { alertMessage = it },
                                )
                            },
                            onSeek = { index ->
                                scope.launch { pagerState.scrollToPage(index) }
                            },
                        )
                    }
                }
            }
        }
    }

    if (showingSettings) {
        ModalBottomSheet(onDismissRequest = { showingSettings = false }) {
            ReaderSettingsSheet(showOCR = book?.isImageFolder != true)
        }
    }

    if (showingPageText && mokuro != null) {
        ModalBottomSheet(onDismissRequest = { showingPageText = false }) {
            PageTextSheet(
                pages = spreads.getOrNull(pagerState.currentPage)
                    ?.pages
                    ?.mapNotNull { mokuro?.pages?.getOrNull(it) }
                    .orEmpty(),
                onOpenDictionary = { paragraph ->
                    dictionary = DictionaryRequest(
                        query = paragraph.take(30),
                        sentence = paragraph,
                        mode = DictionaryLookupMode.Sentence,
                    )
                },
            )
        }
    }

    dictionary?.let { request ->
        ModalBottomSheet(onDismissRequest = { dictionary = null }) {
            DictionaryLookupContent(
                query = request.query,
                mode = request.mode,
                sentence = request.sentence,
            )
        }
    }

    alertMessage?.let { message ->
        AlertDialog(
            onDismissRequest = { alertMessage = null },
            title = { Text(message) },
            confirmButton = {
                TextButton(onClick = { alertMessage = null }) { Text("Vale") }
            },
        )
    }
}

internal enum class ReaderTapAction { Next, Previous, ToggleBars, DeselectBox }

internal data class ReaderTapSample(
    val position: Offset,
    val timeMillis: Long,
)

internal fun isReaderDoubleTap(
    previous: ReaderTapSample?,
    current: ReaderTapSample,
    minTimeMillis: Long,
    timeoutMillis: Long,
    touchSlop: Float,
): Boolean {
    if (previous == null) return false
    val elapsed = current.timeMillis - previous.timeMillis
    return elapsed >= minTimeMillis &&
        elapsed <= timeoutMillis &&
        (current.position - previous.position).getDistance() <= touchSlop
}

internal fun readerTapAction(
    positionX: Float,
    width: Int,
    activeBoxId: Int = -1,
): ReaderTapAction {
    if (activeBoxId >= 0) return ReaderTapAction.DeselectBox
    if (width <= 0) return ReaderTapAction.ToggleBars
    val third = width / 3f
    return when {
        positionX < third -> ReaderTapAction.Next
        positionX > 2 * third -> ReaderTapAction.Previous
        else -> ReaderTapAction.ToggleBars
    }
}

private fun handleNavigationTap(
    position: Offset,
    width: Int,
    onToggleBars: () -> Unit,
    onNavigate: (Boolean) -> Unit,
) {
    when (readerTapAction(position.x, width)) {
        // Physical directions are fixed for the Japanese RTL reader.
        ReaderTapAction.Next -> onNavigate(true)
        ReaderTapAction.Previous -> onNavigate(false)
        ReaderTapAction.ToggleBars -> onToggleBars()
        ReaderTapAction.DeselectBox -> Unit
    }
}

private suspend fun PointerInputScope.detectReaderTapGestures(
    onTap: (Offset) -> Unit,
    onDoubleTap: (Offset) -> Unit,
    isDoubleTapEnabled: () -> Boolean,
) {
    var pendingTap: ReaderTapSample? = null
    var pendingTapJob: Job? = null

    coroutineScope {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var moved = false

            while (true) {
                // Main pass lets page-level OCR handlers and overlay buttons
                // consume their own taps before the reader classifies the zone.
                val event = awaitPointerEvent(PointerEventPass.Main)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if ((change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                    moved = true
                }
                if (!change.pressed) {
                    if (!moved && !change.isConsumed) {
                        // Dismissing an active OCR box is a single, consuming
                        // action and should not wait for the double-tap
                        // timeout. Normal reader taps still use the shared
                        // double-tap recognizer at both 1x and 2x.
                        if (!isDoubleTapEnabled()) {
                            pendingTapJob?.cancel()
                            pendingTap = null
                            onTap(change.position)
                            break
                        }

                        val now = SystemClock.uptimeMillis()
                        val previous = pendingTap
                        val current = ReaderTapSample(change.position, now)
                        val isDoubleTap = isReaderDoubleTap(
                            previous = previous,
                            current = current,
                            minTimeMillis = viewConfiguration.doubleTapMinTimeMillis,
                            timeoutMillis = viewConfiguration.doubleTapTimeoutMillis,
                            touchSlop = viewConfiguration.touchSlop,
                        )

                        pendingTapJob?.cancel()
                        if (isDoubleTap) {
                            pendingTap = null
                            onDoubleTap(change.position)
                        } else {
                            previous?.let { onTap(it.position) }
                            pendingTap = current
                            pendingTapJob = launch {
                                delay(viewConfiguration.doubleTapTimeoutMillis)
                                if (pendingTap == current) {
                                    pendingTap = null
                                    onTap(current.position)
                                }
                            }
                        }
                    } else if (moved) {
                        pendingTapJob?.cancel()
                        pendingTap?.let { onTap(it.position) }
                        pendingTap = null
                    }
                    break
                }
            }
        }

        pendingTapJob?.cancel()
    }
}

private fun readerContentSize(
    spread: ReaderSpread?,
    mokuro: MokuroBook,
    settings: ReaderSettingsData,
    imageAspects: Map<Int, Float>,
    viewportWidth: Float,
    viewportHeight: Float,
): Size {
    if (spread == null || viewportWidth <= 0f || viewportHeight <= 0f) {
        return Size(viewportWidth.coerceAtLeast(0f), viewportHeight.coerceAtLeast(0f))
    }

    val groupLayout = settings.defaultZoomMode == ZoomMode.FitScreen ||
        settings.defaultZoomMode == ZoomMode.Keep
    if (!groupLayout) {
        // The non-group modes currently lay out each page in a full-height
        // slot. The viewport is therefore the real pan-content fallback.
        return Size(viewportWidth, viewportHeight)
    }

    val aspects = spread.pages.mapNotNull { pageNumber ->
        val page = mokuro.pages.getOrNull(pageNumber)
        when {
            page == null -> null
            page.size.width > 0f && page.size.height > 0f ->
                page.size.width / page.size.height
            else -> imageAspects[pageNumber]
        }
    }
    if (aspects.size != spread.pages.size || aspects.any { it <= 0f || !it.isFinite() }) {
        return Size(viewportWidth, viewportHeight)
    }

    val totalAspect = aspects.sum()
    val height = min(viewportHeight, viewportWidth / totalAspect)
    return Size(width = height * totalAspect, height = height)
}

@Composable
private fun ReaderPager(
    book: Book,
    mokuro: MokuroBook,
    settings: ReaderSettingsData,
    spreads: List<ReaderSpread>,
    pagerState: PagerState,
    selectedBoxId: Int,
    isImageFolder: Boolean,
    imageModel: (String) -> Any,
    onBoxTap: (MokuroTextBox, MokuroTextHit) -> Unit,
    onDeselectBox: () -> Unit,
    onToggleBars: () -> Unit,
    onNavigate: (Boolean) -> Unit,
) {
    var zoom by rememberSaveable { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    val latestZoom by rememberUpdatedState(zoom)

    // Proporción aprendida de cada imagen de un tomo sin mokuro (no tiene
    // dimensiones en los datos): permite maquetar el spread como un bloque
    val imageAspects = remember { mutableStateMapOf<Int, Float>() }
    val currentSpread = spreads.getOrNull(pagerState.currentPage)
    val contentSize = readerContentSize(
        spread = currentSpread,
        mokuro = mokuro,
        settings = settings,
        imageAspects = imageAspects,
        viewportWidth = containerSize.width.toFloat(),
        viewportHeight = containerSize.height.toFloat(),
    )

    LaunchedEffect(pagerState.currentPage, spreads.size, containerSize, contentSize) {
        // El nivel de ampliación pertenece a la sesión del lector y se
        // conserva al cambiar de página. El desplazamiento no se reutiliza
        // porque cada página puede tener dimensiones y composición distintas.
        zoom = readerScaleAfterPageChange(zoom)
        offset = readerPanForNewPage(
            scale = zoom,
            viewportWidth = containerSize.width.toFloat(),
            viewportHeight = containerSize.height.toFloat(),
            contentWidth = contentSize.width,
            contentHeight = contentSize.height,
        )
    }

    HorizontalPager(
        state = pagerState,
        reverseLayout = settings.r2l,
        userScrollEnabled = settings.scrollChange && (!settings.panAndZoom || zoom <= 1.001f),
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { containerSize = it }
            .pointerInput(settings.panAndZoom) {
                if (settings.panAndZoom) {
                    detectTransformGestures { _, pan, gestureZoom, _ ->
                        val newZoom = (zoom * gestureZoom).coerceIn(READER_MIN_SCALE, READER_MAX_SCALE)
                        zoom = newZoom
                        offset = if (newZoom <= 1.001f) {
                            readerPanAfterPageChange()
                        } else {
                            val bounds = readerPanBounds(
                                scale = newZoom,
                                viewportWidth = containerSize.width.toFloat(),
                                viewportHeight = containerSize.height.toFloat(),
                                contentWidth = contentSize.width,
                                contentHeight = contentSize.height,
                            )
                            Offset(
                                x = (offset.x + pan.x).coerceIn(-bounds.x, bounds.x),
                                y = (offset.y + pan.y).coerceIn(-bounds.y, bounds.y),
                            )
                        }
                    }
                }
            }
            .pointerInput(containerSize) {
                detectReaderTapGestures(
                    onTap = { position ->
                        // An active OCR box owns the next outside tap. It is
                        // deliberately consumed here so that dismissing it
                        // cannot also navigate or toggle the reader chrome.
                        when (readerTapAction(position.x, containerSize.width, selectedBoxId)) {
                            ReaderTapAction.DeselectBox -> onDeselectBox()
                            else -> handleNavigationTap(
                                position = position,
                                width = containerSize.width,
                                onToggleBars = onToggleBars,
                                onNavigate = onNavigate,
                            )
                        }
                    },
                    onDoubleTap = {
                        if (selectedBoxId >= 0) {
                            onDeselectBox()
                        } else if (latestZoom > 1.001f) {
                            zoom = readerScaleAfterDoubleTap(latestZoom)
                            offset = readerPanAfterPageChange()
                        } else {
                            zoom = readerScaleAfterDoubleTap(latestZoom)
                            offset = readerPanAfterPageChange()
                        }
                    },
                    isDoubleTapEnabled = { selectedBoxId < 0 },
                )
            },
    ) { pageIndex ->
        val spread = spreads.getOrNull(pageIndex) ?: return@HorizontalPager

        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer(
                    scaleX = zoom,
                    scaleY = zoom,
                    translationX = offset.x,
                    translationY = offset.y,
                ),
            contentAlignment = Alignment.Center,
        ) {
            CompositionLocalProvider(
                LocalLayoutDirection provides if (settings.r2l) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                    val fitMode = settings.defaultZoomMode.takeIf { it != ZoomMode.Keep }
                        ?: ZoomMode.FitScreen
                    // En "ajustar a pantalla" (y "mantener zoom") las páginas
                    // del spread se escalan como un bloque para que queden
                    // juntas y centradas, como en el lector de iOS. En el resto
                    // de modos cada página ocupa su mitad con scroll propio.
                    val aspects = spread.pages.map { pageNumber ->
                        val page = mokuro.pages.getOrNull(pageNumber)
                        when {
                            page == null -> null
                            page.size.width > 0f && page.size.height > 0f ->
                                page.size.width / page.size.height
                            else -> imageAspects[pageNumber]
                        }
                    }
                    val groupLayout = settings.defaultZoomMode == ZoomMode.FitScreen ||
                        settings.defaultZoomMode == ZoomMode.Keep
                    val totalAspect = aspects
                        .takeIf { groupLayout && it.all { aspect -> aspect != null && aspect > 0f } }
                        ?.filterNotNull()
                        ?.sum()
                    val pageHeight = totalAspect?.let { minOf(maxHeight, maxWidth / it) }

                    Row(
                        modifier = Modifier.fillMaxSize(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        spread.pages.forEachIndexed { index, pageNumber ->
                            val page = mokuro.pages.getOrNull(pageNumber) ?: return@forEachIndexed
                            val aspect = aspects.getOrNull(index)

                            val pageModifier = if (pageHeight != null && aspect != null) {
                                Modifier
                                    .height(pageHeight)
                                    .width(pageHeight * aspect)
                            } else {
                                Modifier.weight(1f).fillMaxSize()
                            }

                            if (isImageFolder) {
                                ImagePageView(
                                    page = page,
                                    imageModel = imageModel(page.imagePath),
                                    fitMode = fitMode,
                                    onIntrinsicSize = { learned -> imageAspects[pageNumber] = learned },
                                    modifier = pageModifier,
                                )
                            } else {
                                MokuroPageView(
                                    page = page,
                                    imageModel = imageModel(page.imagePath),
                                    fitMode = fitMode,
                                    fontSizeOverride = settings.fontSize.toFloat(),
                                    displayOCR = settings.displayOCR,
                                    textBoxBorders = settings.textBoxBorders,
                                    selectedBoxId = selectedBoxId.takeIf { it >= 0 },
                                    font = settings.font,
                                    // The page-local detector receives
                                    // coordinates already transformed by the
                                    // graphics layer, so OCR boxes remain
                                    // tappable at every zoom/pan position.
                                    boxTapsEnabled = settings.toggleOCRTextBoxes,
                                    onBoxTap = { box, hit, _ -> onBoxTap(box, hit) },
                                    onOutsideActiveBoxTap = onDeselectBox,
                                    modifier = pageModifier,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReaderTopBar(
    book: Book,
    isDownloaded: Boolean,
    downloadState: DownloadState,
    isOnline: Boolean,
    showTextButton: Boolean,
    onBack: () -> Unit,
    onOpenNavigation: () -> Unit,
    onDownload: () -> Unit,
    onOpenText: () -> Unit,
    onOpenSettings: () -> Unit,
    nihongoTrackerContent: @Composable () -> Unit,
) {
    Surface(color = Color.Black.copy(alpha = 0.75f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = Color.White)
            }

            Text(
                text = book.visibleName,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                modifier = Modifier
                    .weight(1f)
                    .testTag("readerBookTitle"),
            )

            if (!isOnline) {
                Icon(
                    Icons.Filled.WifiOff,
                    contentDescription = "Sin conexión: no se guarda el progreso",
                    tint = Color(0xFFFF9800),
                )
            }

            IconButton(onClick = onOpenNavigation) {
                Icon(Icons.Filled.Menu, contentDescription = "Navegación", tint = Color.White)
            }

            when {
                isDownloaded -> Icon(
                    Icons.Filled.DownloadDone,
                    contentDescription = "Descargado",
                    tint = Color(0xFF4CAF50),
                )

                downloadState is DownloadState.Queued || downloadState is DownloadState.Downloading ->
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)

                else -> IconButton(onClick = onDownload) {
                    Icon(Icons.Filled.Download, contentDescription = "Descargar", tint = Color.White)
                }
            }

            if (showTextButton) {
                IconButton(onClick = onOpenText) {
                    Icon(Icons.Filled.TextFields, contentDescription = "Texto", tint = Color.White)
                }
            }

            nihongoTrackerContent()

            IconButton(onClick = onOpenSettings) {
                Icon(Icons.Filled.Settings, contentDescription = "Ajustes", tint = Color.White)
            }
        }
    }
}

@Composable
private fun ReaderBottomBar(
    pageNumber: Int,
    totalPages: Int,
    spreadIndex: Int,
    spreadCount: Int,
    timerText: String,
    timerRunning: Boolean,
    showCrono: Boolean,
    onToggleTimer: () -> Unit,
    onPrevVolume: () -> Unit,
    onNextVolume: () -> Unit,
    onSeek: (Int) -> Unit,
) {
    Surface(color = Color.Black.copy(alpha = 0.75f)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconButton(onClick = onPrevVolume) {
                    Icon(Icons.Filled.SkipPrevious, contentDescription = "Volumen anterior", tint = Color.White)
                }

                if (showCrono) {
                    IconButton(onClick = onToggleTimer) {
                        Icon(
                            imageVector = if (timerRunning) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = if (timerRunning) "Pausar cronómetro" else "Iniciar cronómetro",
                            tint = Color.White,
                        )
                    }

                    Text(text = timerText, color = Color.White)
                }

                Spacer(modifier = Modifier.weight(1f))

                Text(
                    text = "$pageNumber / $totalPages",
                    color = Color.White,
                    modifier = Modifier.testTag("readerPageLabel"),
                )

                IconButton(onClick = onNextVolume) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "Volumen siguiente", tint = Color.White)
                }
            }

            Slider(
                value = spreadIndex.toFloat(),
                onValueChange = { onSeek(it.roundToInt()) },
                valueRange = 0f..max(spreadCount - 1, 0).toFloat(),
                steps = 0,
                modifier = Modifier.testTag("readerSlider"),
            )
        }
    }
}
