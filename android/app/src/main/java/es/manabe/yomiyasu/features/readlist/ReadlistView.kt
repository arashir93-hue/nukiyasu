package es.manabe.yomiyasu.features.readlist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import es.manabe.yomiyasu.components.EmptyBox
import es.manabe.yomiyasu.components.ErrorBox
import es.manabe.yomiyasu.components.LoadingBox
import es.manabe.yomiyasu.components.SerieCard
import es.manabe.yomiyasu.components.SerieCardActions
import es.manabe.yomiyasu.components.rememberLibraryActions
import es.manabe.yomiyasu.core.models.LibraryVariant
import es.manabe.yomiyasu.core.models.MainView
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.networking.ApiException
import es.manabe.yomiyasu.core.session.SessionStore
import es.manabe.yomiyasu.core.services.LibraryApi
import es.manabe.yomiyasu.core.services.SocketService
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ReadlistViewModel @Inject constructor(
    private val library: LibraryApi,
    private val socket: SocketService,
    private val session: SessionStore,
) : ViewModel() {

    private val _manga = MutableStateFlow<List<Serie>>(emptyList())
    val manga: StateFlow<List<Serie>> = _manga.asStateFlow()

    private val _novela = MutableStateFlow<List<Serie>>(emptyList())
    val novela: StateFlow<List<Serie>> = _novela.asStateFlow()

    private val _doujinshi = MutableStateFlow<List<Serie>>(emptyList())
    val doujinshi: StateFlow<List<Serie>> = _doujinshi.asStateFlow()

    val showMatureContent: StateFlow<Boolean> = session.state
        .map { current -> (current as? SessionStore.State.LoggedIn)?.user?.showMatureContent ?: false }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        viewModelScope.launch {
            socket.libraryUpdatedAt.collect {
                if (it != null) {
                    _manga.value = emptyList()
                    _novela.value = emptyList()
                    _doujinshi.value = emptyList()
                    load()
                }
            }
        }
        viewModelScope.launch {
            showMatureContent.collect { visible ->
                if (!visible) _doujinshi.value = emptyList()
            }
        }
    }

    fun load() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            try {
                coroutineScope {
                    val mangaAsync = async { library.readlist(LibraryVariant.Manga) }
                    val novelaAsync = async { library.readlist(LibraryVariant.Novela) }
                    val doujinshiAsync = async {
                        if (showMatureContent.value) {
                            library.readlist(LibraryVariant.Doujinshi)
                        } else {
                            emptyList()
                        }
                    }
                    _manga.value = mangaAsync.await()
                    _novela.value = novelaAsync.await()
                    _doujinshi.value = doujinshiAsync.await()
                }
            } catch (error: ApiException) {
                _error.value = error.userMessage
            } finally {
                _isLoading.value = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReadlistRoute(
    mainView: MainView,
    onOpenSerie: (String) -> Unit,
    onOpenBook: (String) -> Unit,
    viewModel: ReadlistViewModel = hiltViewModel(),
) {
    val manga by viewModel.manga.collectAsStateWithLifecycle()
    val novela by viewModel.novela.collectAsStateWithLifecycle()
    val doujinshi by viewModel.doujinshi.collectAsStateWithLifecycle()
    val showMatureContent by viewModel.showMatureContent.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    val snackbar = remember { SnackbarHostState() }
    val actions = rememberLibraryActions(snackbar)

    LaunchedEffect(Unit) { viewModel.load() }

    val visibleManga = if (mainView == MainView.Novels) emptyList() else manga
    val visibleNovela = if (mainView == MainView.Manga) emptyList() else novela
    val visibleDoujinshi = if (showMatureContent && mainView != MainView.Novels) doujinshi else emptyList()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Lista de lectura") }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isLoading,
            onRefresh = { viewModel.load() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                isLoading && manga.isEmpty() && novela.isEmpty() && doujinshi.isEmpty() -> LoadingBox()
                error != null && manga.isEmpty() && novela.isEmpty() && doujinshi.isEmpty() -> ErrorBox(
                    message = error ?: "No se pudo cargar",
                    onRetry = { viewModel.load() },
                )
                visibleManga.isEmpty() && visibleNovela.isEmpty() && visibleDoujinshi.isEmpty() -> EmptyBox(
                    "Tu lista está vacía\nAñade series desde su ficha para leerlas más tarde.",
                )
                else -> LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 112.dp),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("readlistGrid"),
                ) {
                    if (visibleManga.isNotEmpty()) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                            SectionTitle("Manga")
                        }
                        items(visibleManga, key = { it.id }) { serie ->
                            SerieGridItem(serie, actions, onOpenSerie, onOpenBook)
                        }
                    }

                    if (visibleNovela.isNotEmpty()) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                            SectionTitle("Novelas")
                        }
                        items(visibleNovela, key = { it.id }) { serie ->
                            SerieGridItem(serie, actions, onOpenSerie, onOpenBook)
                        }
                    }

                    if (visibleDoujinshi.isNotEmpty()) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                            SectionTitle("Doujinshi")
                        }
                        items(visibleDoujinshi, key = { it.id }) { serie ->
                            SerieGridItem(serie, actions, onOpenSerie, onOpenBook)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun SerieGridItem(
    serie: Serie,
    actions: es.manabe.yomiyasu.components.LibraryActionsHost,
    onOpenSerie: (String) -> Unit,
    onOpenBook: (String) -> Unit,
) {
    SerieCard(
        serie = serie,
        coverUrl = actions.staticUrls.serieCover(serie)?.toString(),
        actions = SerieCardActions(
            onOpen = { onOpenSerie(serie.id) },
            onContinueReading = serie.currentBook?.let { current -> { onOpenBook(current.id) } },
            onMarkRead = { actions.actions.markSerieRead(serie.id) },
            onTogglePaused = { actions.actions.setSeriePaused(!serie.isPaused, serie.id) },
            onToggleReadlist = { actions.actions.toggleReadlist(serie.id, serie.isInReadlist) },
        ),
    )
}
