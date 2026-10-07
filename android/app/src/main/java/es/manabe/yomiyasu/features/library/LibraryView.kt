package es.manabe.yomiyasu.features.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.FilterListOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
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
import es.manabe.yomiyasu.core.models.DoujinshiCollection
import es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest
import es.manabe.yomiyasu.core.models.DoujinshiOrganization
import es.manabe.yomiyasu.core.models.AlphabetGroup
import es.manabe.yomiyasu.core.models.LibraryVariant
import es.manabe.yomiyasu.core.models.MainView
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.models.SeriesQuery
import es.manabe.yomiyasu.core.networking.ApiException
import es.manabe.yomiyasu.core.session.SessionStore
import es.manabe.yomiyasu.core.services.LibraryApi
import es.manabe.yomiyasu.core.services.DoujinshiRepository
import es.manabe.yomiyasu.core.services.SocketService
import es.manabe.yomiyasu.core.settings.RandomCriteria
import es.manabe.yomiyasu.core.settings.RandomCriteriaStore
import es.manabe.yomiyasu.features.doujinshi.DoujinshiLibrarySections
import es.manabe.yomiyasu.features.doujinshi.DoujinshiSerieCard
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val library: LibraryApi,
    private val socket: SocketService,
    private val randomCriteria: RandomCriteriaStore,
    private val session: SessionStore,
    private val doujinshi: DoujinshiRepository,
) : ViewModel() {

    var variant by mutableStateOf(LibraryVariant.All)
        private set
    var query by mutableStateOf(SeriesQuery())
        private set

    private val _series = MutableStateFlow<List<Serie>>(emptyList())
    val series: StateFlow<List<Serie>> = _series.asStateFlow()

    private val _alphabet = MutableStateFlow<List<AlphabetGroup>>(emptyList())
    val alphabet: StateFlow<List<AlphabetGroup>> = _alphabet.asStateFlow()

    private var genres: List<String> = emptyList()
    private var authors: List<String> = emptyList()

    private var totalPages = 1
    private var isLoadingMore = false
    private var didLoad = false

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val genresList: List<String> get() = genres
    val authorsList: List<String> get() = authors

    val doujinshiOrganizations: StateFlow<Map<String, DoujinshiOrganization>> = doujinshi.organizations
    val doujinshiCollections: StateFlow<List<DoujinshiCollection>> = doujinshi.collections

    private val _doujinshiFavorites = MutableStateFlow<List<Serie>>(emptyList())
    val doujinshiFavorites: StateFlow<List<Serie>> = _doujinshiFavorites.asStateFlow()

    private val _doujinshiFavoritesLoading = MutableStateFlow(false)
    val doujinshiFavoritesLoading: StateFlow<Boolean> = _doujinshiFavoritesLoading.asStateFlow()

    private val _doujinshiFavoritePage = MutableStateFlow(1)
    val doujinshiFavoritePage: StateFlow<Int> = _doujinshiFavoritePage.asStateFlow()
    private val _doujinshiFavoritePages = MutableStateFlow(1)
    val doujinshiFavoritePages: StateFlow<Int> = _doujinshiFavoritePages.asStateFlow()

    private val _doujinshiError = MutableStateFlow<String?>(null)
    val doujinshiError: StateFlow<String?> = _doujinshiError.asStateFlow()

    private val _pendingFavoriteIds = MutableStateFlow<Set<String>>(emptySet())
    val pendingFavoriteIds: StateFlow<Set<String>> = _pendingFavoriteIds.asStateFlow()

    val showMatureContent: StateFlow<Boolean> = session.state
        .map { current -> (current as? SessionStore.State.LoggedIn)?.user?.showMatureContent ?: false }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    init {
        viewModelScope.launch {
            socket.libraryUpdatedAt.collect {
                if (it != null && didLoad) {
                    _series.value = emptyList()
                    _alphabet.value = emptyList()
                    load(reset = true)
                }
            }
        }
        viewModelScope.launch {
            showMatureContent.collect { visible ->
                if (!visible) {
                    doujinshi.clear()
                    _doujinshiFavorites.value = emptyList()
                    if (variant == LibraryVariant.Doujinshi) {
                        variant = LibraryVariant.All
                        query = query.copy(variant = variant, page = 1)
                        if (didLoad) load(reset = true)
                    }
                }
            }
        }
    }

    fun selectVariant(newVariant: LibraryVariant) {
        if (variant == newVariant) return
        variant = newVariant
        load(reset = true)
        if (newVariant == LibraryVariant.Doujinshi) loadDoujinshiExtras()
    }

    fun applyQuery(newQuery: SeriesQuery) {
        query = newQuery.copy(variant = variant)
    }

    fun setFirstLetter(letter: String?) {
        query = query.copy(firstLetter = letter)
        load(reset = true)
    }

    fun hasMore(): Boolean = query.page < totalPages

    fun load(reset: Boolean) {
        query = query.copy(variant = variant)

        if (reset) {
            query = query.copy(page = 1)
            _isLoading.value = true
        } else {
            if (isLoadingMore || !hasMore()) return
            isLoadingMore = true
        }

        viewModelScope.launch {
            _error.value = null
            try {
                val page = library.seriesPage(query)

                _series.value = if (reset) page.data else _series.value + page.data
                totalPages = page.pages

                if (variant == LibraryVariant.Doujinshi) {
                    doujinshi.refreshOrganization(page.data.map { it.id })
                }

                if (reset) {
                    coroutineScope {
                        val alphabetAsync = async { library.alphabet(query) }
                        val metadataAsync = async { library.genresAndArtists() }

                        _alphabet.value = alphabetAsync.await()
                        val metadata = metadataAsync.await()
                        genres = metadata.genres
                        authors = metadata.authors
                    }
                }
            } catch (error: ApiException) {
                _error.value = error.userMessage
                if (_series.value.isNotEmpty()) {
                    query = query.copy(page = (query.page - 1).coerceAtLeast(1))
                }
            } finally {
                _isLoading.value = false
                isLoadingMore = false
                didLoad = true
            }
        }
    }

    fun loadMore() {
        if (!hasMore() || _isLoading.value || isLoadingMore) return
        query = query.copy(page = query.page + 1)
        load(reset = false)
    }

    fun randomSerie(onResult: (Serie?) -> Unit) {
        query = query.copy(variant = variant)
        viewModelScope.launch {
            try {
                randomCriteria.save(RandomCriteria.from(query), variant)
                onResult(library.randomSerie(query))
            } catch (error: ApiException) {
                _error.value = error.userMessage
                onResult(null)
            }
        }
    }

    fun loadDoujinshiExtras() {
        if (!showMatureContent.value) return
        viewModelScope.launch {
            _doujinshiError.value = null
            _doujinshiFavoritesLoading.value = true
            try {
                doujinshi.refreshCollections()
                val page = library.doujinshiFavorites(page = 1)
                _doujinshiFavorites.value = page.data
                _doujinshiFavoritePage.value = 1
                _doujinshiFavoritePages.value = page.pages
                doujinshi.refreshOrganization(page.data.map { it.id })
            } catch (error: ApiException) {
                _doujinshiError.value = error.userMessage
            } finally {
                _doujinshiFavoritesLoading.value = false
            }
        }
    }

    fun loadMoreDoujinshiFavorites() {
        if (_doujinshiFavoritesLoading.value || _doujinshiFavoritePage.value >= _doujinshiFavoritePages.value) return
        viewModelScope.launch {
            _doujinshiFavoritesLoading.value = true
            try {
                val nextPage = _doujinshiFavoritePage.value + 1
                val page = library.doujinshiFavorites(page = nextPage)
                _doujinshiFavorites.value += page.data
                _doujinshiFavoritePage.value = nextPage
                _doujinshiFavoritePages.value = page.pages
                doujinshi.refreshOrganization(page.data.map { it.id })
            } catch (error: ApiException) {
                _doujinshiError.value = error.userMessage
            } finally {
                _doujinshiFavoritesLoading.value = false
            }
        }
    }

    fun setDoujinshiFavorite(serieId: String, desiredState: Boolean) {
        if (_pendingFavoriteIds.value.contains(serieId)) return
        val previous = doujinshi.organizations.value[serieId]?.isFavorite ?: false
        _pendingFavoriteIds.value = _pendingFavoriteIds.value + serieId
        doujinshi.setFavoriteLocally(serieId, desiredState)
        viewModelScope.launch {
            try {
                doujinshi.setFavorite(serieId, desiredState)
                loadDoujinshiExtras()
            } catch (error: ApiException) {
                doujinshi.setFavoriteLocally(serieId, previous)
                _doujinshiError.value = error.userMessage
            } finally {
                _pendingFavoriteIds.value = _pendingFavoriteIds.value - serieId
            }
        }
    }

    fun createDoujinshiCollection(name: String, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            try {
                doujinshi.createCollection(name)
            } catch (error: ApiException) {
                onError(error.userMessage)
            }
        }
    }

    fun updateDoujinshiCollection(
        collectionId: String,
        request: DoujinshiCollectionUpdateRequest,
        onError: (String) -> Unit = {},
    ) {
        viewModelScope.launch {
            try {
                doujinshi.updateCollection(collectionId, request)
            } catch (error: ApiException) {
                onError(error.userMessage)
            }
        }
    }

    fun deleteDoujinshiCollection(collectionId: String, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            try {
                doujinshi.deleteCollection(collectionId)
            } catch (error: ApiException) {
                onError(error.userMessage)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryRoute(
    mainView: MainView,
    onOpenSerie: (String) -> Unit,
    onOpenBook: (String) -> Unit,
    onOpenRandomSerie: (String, LibraryVariant) -> Unit,
    onOpenDoujinshiCollection: (String) -> Unit,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val series by viewModel.series.collectAsStateWithLifecycle()
    val alphabet by viewModel.alphabet.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val showMatureContent by viewModel.showMatureContent.collectAsStateWithLifecycle()
    val doujinshiOrganizations by viewModel.doujinshiOrganizations.collectAsStateWithLifecycle()
    val pendingFavoriteIds by viewModel.pendingFavoriteIds.collectAsStateWithLifecycle()

    val snackbar = remember { SnackbarHostState() }
    val actions = rememberLibraryActions(snackbar)

    var filtersOpen by remember { mutableStateOf(false) }
    var searchOpen by remember { mutableStateOf(false) }
    var didInit by remember { mutableStateOf(false) }

    LaunchedEffect(mainView) {
        if (!didInit) {
            didInit = true
            val defaultVariant = when (mainView) {
                MainView.Manga -> LibraryVariant.Manga
                MainView.Novels -> LibraryVariant.Novela
                MainView.Both -> LibraryVariant.All
            }
            viewModel.selectVariant(defaultVariant)
            viewModel.load(reset = true)
        }
    }

    if (searchOpen) {
        SearchView(
            onBack = { searchOpen = false },
            onOpenSerie = { searchOpen = false; onOpenSerie(it) },
            onOpenBook = { searchOpen = false; onOpenBook(it) },
        )
        return
    }

    val gridState = rememberLazyGridState()
    val visibleVariants = remember(showMatureContent) {
        LibraryVariant.entries.filter { it != LibraryVariant.Doujinshi || showMatureContent }
    }

    LaunchedEffect(gridState) {
        snapshotFlow { gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index }
            .collect { lastVisible ->
                if (lastVisible != null && lastVisible >= series.size - 5) {
                    viewModel.loadMore()
                }
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Biblioteca") },
                actions = {
                    IconButton(
                        onClick = {
                            viewModel.randomSerie { serie ->
                                serie?.let { onOpenRandomSerie(it.id, viewModel.variant) }
                            }
                        },
                    ) {
                        Icon(Icons.Filled.Casino, contentDescription = "Aleatorio")
                    }
                    IconButton(onClick = { filtersOpen = true }) {
                        Icon(
                            imageVector = if (viewModel.query.isFiltering) {
                                Icons.Filled.FilterListOff
                            } else {
                                Icons.Filled.FilterList
                            },
                            contentDescription = "Filtros",
                        )
                    }
                    IconButton(onClick = { searchOpen = true }) {
                        Icon(Icons.Filled.Search, contentDescription = "Buscar")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                visibleVariants.forEachIndexed { index, variant ->
                    SegmentedButton(
                        selected = viewModel.variant == variant,
                        onClick = { viewModel.selectVariant(variant) },
                        shape = SegmentedButtonDefaults.itemShape(index, visibleVariants.size),
                    ) {
                        Text(variant.title)
                    }
                }
            }

            PullToRefreshBox(
                isRefreshing = isLoading && series.isNotEmpty(),
                onRefresh = { viewModel.load(reset = true) },
                modifier = Modifier.fillMaxSize(),
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    if (viewModel.variant == LibraryVariant.Doujinshi) {
                        DoujinshiLibrarySections(
                            viewModel = viewModel,
                            onOpenSerie = onOpenSerie,
                            onOpenCollection = onOpenDoujinshiCollection,
                        )
                        Text(
                            text = "Todos",
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }

                    when {
                    isLoading && series.isEmpty() -> LoadingBox()
                    error != null && series.isEmpty() -> ErrorBox(
                        message = error ?: "No se pudo cargar",
                        onRetry = { viewModel.load(reset = true) },
                    )
                    series.isEmpty() -> EmptyBox("Sin resultados\nPrueba a cambiar los filtros.")
                    else -> Box {
                        LazyVerticalGrid(
                            state = gridState,
                            columns = GridCells.Adaptive(minSize = 100.dp),
                            contentPadding = PaddingValues(start = 16.dp, end = 32.dp, bottom = 24.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("libraryGrid"),
                        ) {
                            items(series, key = { it.id }) { serie ->
                                val cardActions = SerieCardActions(
                                    onOpen = { onOpenSerie(serie.id) },
                                    onContinueReading = serie.currentBook?.let { current ->
                                        { onOpenBook(current.id) }
                                    },
                                    onMarkRead = { actions.actions.markSerieRead(serie.id) },
                                    onTogglePaused = { actions.actions.setSeriePaused(!serie.isPaused, serie.id) },
                                    onToggleReadlist = { actions.actions.toggleReadlist(serie.id, serie.isInReadlist) },
                                )
                                if (viewModel.variant == LibraryVariant.Doujinshi) {
                                    DoujinshiSerieCard(
                                        serie = serie,
                                        organization = doujinshiOrganizations[serie.id],
                                        coverUrl = actions.staticUrls.serieCover(serie)?.toString(),
                                        onOpen = { onOpenSerie(serie.id) },
                                        onToggleFavorite = {
                                            val current = doujinshiOrganizations[serie.id]?.isFavorite == true
                                            viewModel.setDoujinshiFavorite(serie.id, !current)
                                        },
                                        onOpenCollection = { },
                                        favoritePending = pendingFavoriteIds.contains(serie.id),
                                        actions = cardActions,
                                    )
                                } else {
                                    SerieCard(
                                        serie = serie,
                                        coverUrl = actions.staticUrls.serieCover(serie)?.toString(),
                                        actions = cardActions,
                                    )
                                }
                            }

                            if (isLoading && series.isNotEmpty()) {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        CircularProgressIndicator()
                                    }
                                }
                            }
                        }

                        AlphabetIndex(
                            groups = alphabet,
                            selected = viewModel.query.firstLetter,
                            onSelect = { group ->
                                viewModel.setFirstLetter(if (group == "all") null else group)
                            },
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .padding(end = 2.dp),
                        )
                    }
                    }
                }
            }
        }
    }

    if (filtersOpen) {
        ModalBottomSheet(
            onDismissRequest = { filtersOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        ) {
            LibraryFiltersContent(
                query = viewModel.query,
                genres = viewModel.genresList,
                authors = viewModel.authorsList,
                onApply = { newQuery ->
                    filtersOpen = false
                    viewModel.applyQuery(newQuery)
                    viewModel.load(reset = true)
                },
                onDismiss = { filtersOpen = false },
            )
        }
    }
}

@Composable
fun AlphabetIndex(
    groups: List<AlphabetGroup>,
    selected: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (groups.isEmpty()) return

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        groups.forEach { group ->
            val isSelected = group.group == (selected ?: "all")
            val enabled = group.count > 0

            TextButton(
                onClick = { onSelect(group.group) },
                enabled = enabled,
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier.width(24.dp),
            ) {
                Text(
                    text = group.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                    color = when {
                        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
                        isSelected -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurface
                    },
                )
            }
        }
    }
}
