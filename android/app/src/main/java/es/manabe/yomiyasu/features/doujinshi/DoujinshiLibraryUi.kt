package es.manabe.yomiyasu.features.doujinshi

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import es.manabe.yomiyasu.components.SerieCard
import es.manabe.yomiyasu.components.SerieCardActions
import es.manabe.yomiyasu.components.rememberStaticUrls
import es.manabe.yomiyasu.core.models.DoujinshiCollection
import es.manabe.yomiyasu.core.models.DoujinshiOrganization
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.features.library.LibraryViewModel

@Composable
fun DoujinshiLibrarySections(
    viewModel: LibraryViewModel,
    onOpenSerie: (String) -> Unit,
    onOpenCollection: (String) -> Unit,
) {
    val favorites by viewModel.doujinshiFavorites.collectAsStateWithLifecycle()
    val collections by viewModel.doujinshiCollections.collectAsStateWithLifecycle()
    val organizations by viewModel.doujinshiOrganizations.collectAsStateWithLifecycle()
    val pendingFavorites by viewModel.pendingFavoriteIds.collectAsStateWithLifecycle()
    val favoritePage by viewModel.doujinshiFavoritePage.collectAsStateWithLifecycle()
    val favoritePages by viewModel.doujinshiFavoritePages.collectAsStateWithLifecycle()
    val favoritesLoading by viewModel.doujinshiFavoritesLoading.collectAsStateWithLifecycle()
    val doujinshiError by viewModel.doujinshiError.collectAsStateWithLifecycle()
    var createOpen by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        SectionTitle("Favoritos")
        if (favorites.isEmpty()) {
            Text(
                text = "Todavía no tienes doujinshi favoritos.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        } else {
            LazyRow(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(favorites, key = { it.id }) { serie ->
                    DoujinshiSerieCard(
                        serie = serie,
                        organization = organizations[serie.id],
                        coverUrl = rememberStaticUrls().serieCover(serie)?.toString(),
                        onOpen = { onOpenSerie(serie.id) },
                        onToggleFavorite = {
                            viewModel.setDoujinshiFavorite(serie.id, false)
                        },
                        onOpenCollection = { },
                        favoritePending = pendingFavorites.contains(serie.id),
                    )
                }
                if (favoritePage < favoritePages) {
                    item {
                        TextButton(
                            onClick = viewModel::loadMoreDoujinshiFavorites,
                            enabled = !favoritesLoading,
                        ) { Text(if (favoritesLoading) "Cargando…" else "Más") }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SectionTitle("Colecciones", Modifier.weight(1f))
            TextButton(onClick = { createOpen = true }) { Text("+ Nueva") }
        }
        if (collections.isEmpty()) {
            Text(
                text = "Crea una colección para organizar tus doujinshi.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                collections.forEach { collection ->
                    CollectionRow(
                        collection = collection,
                        onOpen = { onOpenCollection(collection.id) },
                        onError = { error = it },
                        onUpdated = { request -> viewModel.updateDoujinshiCollection(collection.id, request) { error = it } },
                        onDeleted = { viewModel.deleteDoujinshiCollection(collection.id) { error = it } },
                    )
                }
            }
        }
        doujinshiError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }

    if (createOpen) {
        CollectionNameDialog(
            title = "Nueva colección",
            initialName = "",
            onDismiss = { createOpen = false },
            onConfirm = { name ->
                createOpen = false
                viewModel.createDoujinshiCollection(name) { error = it }
            },
        )
    }
}

@Composable
fun DoujinshiSerieCard(
    serie: Serie,
    organization: DoujinshiOrganization?,
    coverUrl: String?,
    onOpen: () -> Unit,
    onToggleFavorite: () -> Unit,
    onOpenCollection: () -> Unit,
    favoritePending: Boolean = false,
    actions: SerieCardActions = SerieCardActions(onOpen = onOpen),
) {
    var organizationOpen by remember(serie.id) { mutableStateOf(false) }
    val wrappedActions = SerieCardActions(
        onOpen = actions.onOpen,
        onContinueReading = actions.onContinueReading,
        onMarkRead = actions.onMarkRead,
        onTogglePaused = actions.onTogglePaused,
        onToggleReadlist = actions.onToggleReadlist,
        isFavorite = organization?.isFavorite == true,
        onToggleFavorite = if (favoritePending) null else onToggleFavorite,
        onOrganize = { organizationOpen = true },
    )
    SerieCard(serie = serie, coverUrl = coverUrl, actions = wrappedActions)
    if (organizationOpen) {
        DoujinshiOrganizationDialog(
            serieId = serie.id,
            serieName = serie.visibleName,
            initialOrganization = organization,
            open = true,
            onOpenChange = { organizationOpen = it },
        )
    }
}

@Composable
private fun CollectionRow(
    collection: DoujinshiCollection,
    onOpen: () -> Unit,
    onError: (String) -> Unit,
    onUpdated: (es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest) -> Unit,
    onDeleted: () -> Unit,
) {
    var menuOpen by remember(collection.id) { mutableStateOf(false) }
    var editOpen by remember(collection.id) { mutableStateOf(false) }
    var deleteOpen by remember(collection.id) { mutableStateOf(false) }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(4.dp)) {
            IconButton(onClick = onOpen) {
                Icon(if (collection.isFavorite) Icons.Filled.Favorite else Icons.Filled.Folder, contentDescription = "Abrir colección")
            }
            Column(modifier = Modifier.weight(1f).clickable(onClick = onOpen)) {
                Text(collection.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${collection.visibleItemCount} doujinshi", style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = { menuOpen = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Gestionar colección") }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(if (collection.isFavorite) "Quitar de favoritas" else "Marcar como favorita") },
                    leadingIcon = { Icon(if (collection.isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, null) },
                    onClick = { menuOpen = false; onUpdated(es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest(isFavorite = !collection.isFavorite)) },
                )
                DropdownMenuItem(
                    text = { Text("Renombrar") },
                    leadingIcon = { Icon(Icons.Filled.Edit, null) },
                    onClick = { menuOpen = false; editOpen = true },
                )
                DropdownMenuItem(
                    text = { Text("Eliminar") },
                    leadingIcon = { Icon(Icons.Filled.Delete, null) },
                    onClick = { menuOpen = false; deleteOpen = true },
                )
            }
        }
    }
    if (editOpen) {
        CollectionNameDialog(
            title = "Renombrar colección",
            initialName = collection.name,
            onDismiss = { editOpen = false },
            onConfirm = { name -> editOpen = false; onUpdated(es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest(name = name)) },
        )
    }
    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { deleteOpen = false },
            title = { Text("¿Eliminar colección?") },
            text = { Text("Se eliminará la colección, pero no los doujinshi ni sus favoritos.") },
            confirmButton = { TextButton(onClick = { deleteOpen = false; onDeleted() }) { Text("Eliminar") } },
            dismissButton = { TextButton(onClick = { deleteOpen = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun CollectionNameDialog(
    title: String,
    initialName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember(initialName) { mutableStateOf(initialName) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it; error = null }, label = { Text("Nombre") }, singleLine = true)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val trimmed = name.trim()
                if (trimmed.length !in 1..80) error = "El nombre debe tener entre 1 y 80 caracteres."
                else onConfirm(trimmed)
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun SectionTitle(title: String, modifier: Modifier = Modifier) {
    Text(title, style = MaterialTheme.typography.titleMedium, modifier = modifier.padding(horizontal = 16.dp))
}
