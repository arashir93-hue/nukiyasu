package es.manabe.yomiyasu.features.doujinshi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import es.manabe.yomiyasu.components.rememberDoujinshiRepository
import es.manabe.yomiyasu.core.models.DoujinshiOrganization
import es.manabe.yomiyasu.core.networking.ApiException
import kotlinx.coroutines.launch

@Composable
fun DoujinshiOrganizationDialog(
    serieId: String,
    serieName: String,
    initialOrganization: DoujinshiOrganization? = null,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
) {
    val repository = rememberDoujinshiRepository()
    val collections by repository.collections.collectAsState()
    val organizations by repository.organizations.collectAsState()
    val scope = rememberCoroutineScope()
    var selectedIds by remember(serieId) {
        mutableStateOf(initialOrganization?.collectionIds.orEmpty())
    }
    var loading by remember { mutableStateOf(false) }
    var pendingId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var createOpen by remember { mutableStateOf(false) }

    val organization = organizations[serieId] ?: initialOrganization

    LaunchedEffect(open, serieId) {
        if (open) {
            loading = true
            error = null
            try {
                repository.refreshOrganization(listOf(serieId))
                repository.refreshCollections()
            } catch (exception: ApiException) {
                error = exception.userMessage
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(organization?.collectionIds) {
        selectedIds = organization?.collectionIds.orEmpty()
    }

    fun toggleCollection(collectionId: String) {
        if (pendingId != null) return
        val included = !selectedIds.contains(collectionId)
        val previous = selectedIds
        selectedIds = if (included) {
            (selectedIds + collectionId).distinct()
        } else {
            selectedIds.filterNot { it == collectionId }
        }
        pendingId = collectionId
        error = null
        scope.launch {
            try {
                repository.setCollectionItem(collectionId, serieId, included)
            } catch (exception: ApiException) {
                selectedIds = previous
                error = exception.userMessage
            } finally {
                pendingId = null
            }
        }
    }

    AlertDialog(
        onDismissRequest = { if (pendingId == null) onOpenChange(false) },
        title = { Text("Organizar doujinshi") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(serieName, style = MaterialTheme.typography.bodyMedium)
                if (loading) {
                    CircularProgressIndicator()
                } else if (collections.isEmpty()) {
                    Text("Todavía no tienes colecciones.")
                } else {
                    LazyColumn {
                        items(collections, key = { it.id }) { collection ->
                            val selected = selectedIds.contains(collection.id)
                            ListItem(
                                headlineContent = { Text(collection.name) },
                                supportingContent = { Text("${collection.visibleItemCount} doujinshi") },
                                leadingContent = {
                                    Icon(
                                        imageVector = if (selected) Icons.Filled.Check else Icons.Filled.Star,
                                        contentDescription = null,
                                        tint = if (collection.isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                },
                                trailingContent = {
                                    TextButton(
                                        onClick = { toggleCollection(collection.id) },
                                        enabled = pendingId == null,
                                    ) { Text(if (selected) "Quitar" else "Añadir") }
                                },
                            )
                            HorizontalDivider()
                        }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(
                    onClick = { createOpen = true },
                    enabled = pendingId == null,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("+ Crear colección") }
            }
        },
        confirmButton = { TextButton(onClick = { onOpenChange(false) }) { Text("Cerrar") } },
    )

    if (createOpen) {
        CreateDoujinshiCollectionDialog(
            onDismiss = { createOpen = false },
            onCreated = { name ->
                createOpen = false
                scope.launch {
                    try {
                        val created = repository.createCollection(name)
                        repository.setCollectionItem(created.id, serieId, true)
                        selectedIds = (selectedIds + created.id).distinct()
                    } catch (exception: ApiException) {
                        error = exception.userMessage
                    }
                }
            },
        )
    }
}

@Composable
private fun CreateDoujinshiCollectionDialog(
    onDismiss: () -> Unit,
    onCreated: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nueva colección") },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; error = null },
                    label = { Text("Nombre") },
                    singleLine = true,
                    supportingText = { Text("1–80 caracteres") },
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmed = name.trim()
                    if (trimmed.length !in 1..80) {
                        error = "El nombre debe tener entre 1 y 80 caracteres."
                    } else {
                        onCreated(trimmed)
                    }
                },
            ) { Text("Crear") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
