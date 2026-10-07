package es.manabe.yomiyasu.features.doujinshi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import es.manabe.yomiyasu.components.ErrorBox
import es.manabe.yomiyasu.components.LoadingBox
import es.manabe.yomiyasu.components.SerieCardActions
import es.manabe.yomiyasu.components.rememberStaticUrls
import es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.networking.ApiException
import es.manabe.yomiyasu.core.services.DoujinshiRepository
import es.manabe.yomiyasu.core.services.LibraryApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DoujinshiCollectionViewModel @Inject constructor(
    private val library: LibraryApi,
    private val organization: DoujinshiRepository,
) : ViewModel() {
    private val _items = MutableStateFlow<List<Serie>>(emptyList())
    val items: StateFlow<List<Serie>> = _items.asStateFlow()
    val collections: StateFlow<List<es.manabe.yomiyasu.core.models.DoujinshiCollection>> = organization.collections
    val organizations = organization.organizations

    private val _page = MutableStateFlow(1)
    val page: StateFlow<Int> = _page.asStateFlow()
    private val _pages = MutableStateFlow(1)
    val pages: StateFlow<Int> = _pages.asStateFlow()
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun load(collectionId: String, page: Int = _page.value) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                organization.refreshCollections()
                val result = library.doujinshiCollectionItems(collectionId, page)
                _items.value = result.data
                _page.value = page
                _pages.value = result.pages
                organization.refreshOrganization(result.data.map { it.id })
            } catch (error: ApiException) {
                _error.value = error.userMessage
            } finally {
                _loading.value = false
            }
        }
    }

    fun update(collectionId: String, request: DoujinshiCollectionUpdateRequest, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            try {
                organization.updateCollection(collectionId, request)
            } catch (error: ApiException) {
                onError(error.userMessage)
            }
        }
    }

    fun delete(collectionId: String, onSuccess: () -> Unit, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            try {
                organization.deleteCollection(collectionId)
                onSuccess()
            } catch (error: ApiException) {
                onError(error.userMessage)
            }
        }
    }

    fun setFavorite(serieId: String, desiredState: Boolean, onError: (String) -> Unit = {}) {
        val previous = organization.organizations.value[serieId]?.isFavorite ?: false
        organization.setFavoriteLocally(serieId, desiredState)
        viewModelScope.launch {
            try {
                organization.setFavorite(serieId, desiredState)
            } catch (error: ApiException) {
                organization.setFavoriteLocally(serieId, previous)
                onError(error.userMessage)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoujinshiCollectionRoute(
    collectionId: String,
    onBack: () -> Unit,
    onOpenSerie: (String) -> Unit,
    onOpenBook: (String) -> Unit,
    onDeleted: () -> Unit,
    viewModel: DoujinshiCollectionViewModel = hiltViewModel(),
) {
    val items by viewModel.items.collectAsStateWithLifecycle()
    val collections by viewModel.collections.collectAsStateWithLifecycle()
    val organizations by viewModel.organizations.collectAsStateWithLifecycle()
    val page by viewModel.page.collectAsStateWithLifecycle()
    val pages by viewModel.pages.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val staticUrls = rememberStaticUrls()
    val collection = collections.firstOrNull { it.id == collectionId }
    val visibleItems = items.filter { serie ->
        organizations[serie.id]?.collectionIds?.contains(collectionId) != false
    }
    var menuOpen by remember { mutableStateOf(false) }
    var renameOpen by remember { mutableStateOf(false) }
    var deleteOpen by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(collectionId) { viewModel.load(collectionId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(collection?.name ?: "Colección") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                actions = {
                    IconButton(onClick = { menuOpen = true }) { Icon(Icons.Filled.MoreVert, "Gestionar colección") }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(if (collection?.isFavorite == true) "Quitar de favoritas" else "Marcar como favorita") },
                            leadingIcon = { Icon(if (collection?.isFavorite == true) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, null) },
                            onClick = {
                                menuOpen = false
                                collection?.let { viewModel.update(collectionId, DoujinshiCollectionUpdateRequest(isFavorite = !it.isFavorite)) { actionError = it } }
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Renombrar") },
                            leadingIcon = { Icon(Icons.Filled.Edit, null) },
                            onClick = { menuOpen = false; renameOpen = true },
                        )
                        DropdownMenuItem(
                            text = { Text("Eliminar") },
                            leadingIcon = { Icon(Icons.Filled.Delete, null) },
                            onClick = { menuOpen = false; deleteOpen = true },
                        )
                    }
                },
            )
        },
    ) { padding ->
        when {
            loading && visibleItems.isEmpty() -> LoadingBox(Modifier.padding(padding))
            error != null && visibleItems.isEmpty() -> ErrorBox(error ?: "No se pudo cargar", Modifier.padding(padding)) { viewModel.load(collectionId) }
            else -> Column(Modifier.fillMaxSize().padding(padding)) {
                Text(
                    text = "${collection?.visibleItemCount ?: visibleItems.size} doujinshi",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                if (visibleItems.isEmpty()) {
                    Text("Esta colección está vacía.", modifier = Modifier.padding(16.dp))
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 110.dp),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(visibleItems, key = { it.id }) { serie ->
                            DoujinshiSerieCard(
                                serie = serie,
                                organization = organizations[serie.id],
                                coverUrl = staticUrls.serieCover(serie)?.toString(),
                                onOpen = { onOpenSerie(serie.id) },
                                onToggleFavorite = {
                                    val current = organizations[serie.id]?.isFavorite == true
                                    viewModel.setFavorite(serie.id, !current) { actionError = it }
                                },
                                onOpenCollection = {},
                                actions = SerieCardActions(
                                    onOpen = { onOpenSerie(serie.id) },
                                    onContinueReading = serie.currentBook?.let { { onOpenBook(it.id) } },
                                ),
                            )
                        }
                    }
                }
                if (pages > 1) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { if (page > 1) viewModel.load(collectionId, page - 1) }) { Text("Anterior") }
                        Text("Página $page de $pages")
                        TextButton(onClick = { if (page < pages) viewModel.load(collectionId, page + 1) }) { Text("Siguiente") }
                    }
                }
            }
        }
    }

    actionError?.let { message ->
        AlertDialog(onDismissRequest = { actionError = null }, title = { Text("No se pudo actualizar") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { actionError = null }) { Text("Aceptar") } })
    }

    if (renameOpen && collection != null) {
        CollectionEditDialog(
            title = "Renombrar colección",
            initialName = collection.name,
            onDismiss = { renameOpen = false },
            onConfirm = { name -> renameOpen = false; viewModel.update(collectionId, DoujinshiCollectionUpdateRequest(name = name)) { actionError = it } },
        )
    }
    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = { Text("¿Eliminar colección?") },
            text = { Text("No se eliminarán los doujinshi ni sus favoritos.") },
            confirmButton = { TextButton(onClick = { deleteOpen = false; viewModel.delete(collectionId, onDeleted) { actionError = it } }) { Text("Eliminar") } },
            dismissButton = { TextButton(onClick = { deleteOpen = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun CollectionEditDialog(
    title: String,
    initialName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember(initialName) { mutableStateOf(initialName) }
    var validationError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it; validationError = null }, label = { Text("Nombre") }, singleLine = true)
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val trimmed = name.trim()
                if (trimmed.length !in 1..80) validationError = "El nombre debe tener entre 1 y 80 caracteres."
                else onConfirm(trimmed)
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
