package es.manabe.yomiyasu.features.nihongotracker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import dagger.hilt.android.EntryPointAccessors
import es.manabe.yomiyasu.components.LibraryEntryPoint
import es.manabe.yomiyasu.core.models.NihongoTrackerLink
import es.manabe.yomiyasu.core.models.NihongoTrackerMedia
import es.manabe.yomiyasu.core.models.Serie
import kotlinx.coroutines.launch

/**
 * Matching UI backed exclusively by Nukiyasu. The backend performs both the
 * NihongoTracker and AniList searches and keeps the API key server-side.
 */
@Composable
fun NihongoTrackerMatchDialog(
    serie: Serie,
    initialLink: NihongoTrackerLink?,
    open: Boolean,
    onOpenChange: (Boolean) -> Unit,
    onLinkChanged: (NihongoTrackerLink?) -> Unit,
) {
    if (!open) return

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val api = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            LibraryEntryPoint::class.java,
        ).nihongoTrackerApi()
    }
    val mediaType = if (serie.variant == es.manabe.yomiyasu.core.models.Variant.Novela) {
        "light-novel"
    } else {
        "manga"
    }
    var query by remember(serie.id) { mutableStateOf(serie.visibleName) }
    var results by remember(serie.id) { mutableStateOf<List<NihongoTrackerMedia>>(emptyList()) }
    var currentLink by remember(serie.id) { mutableStateOf(initialLink) }
    var connected by remember(serie.id) { mutableStateOf<Boolean?>(null) }
    var busy by remember(serie.id) { mutableStateOf(false) }

    LaunchedEffect(open, serie.id) {
        if (!open) return@LaunchedEffect
        query = serie.visibleName
        results = emptyList()
        currentLink = initialLink
        connected = runCatching { api.status().connected }.getOrDefault(false)
        if (connected == true) {
            currentLink = runCatching { api.linkForSerie(serie.id) }.getOrNull()
        }
    }

    fun showError(message: String) {
        android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
    }

    fun search() {
        val value = query.trim()
        if (value.isEmpty() || busy) return
        busy = true
        scope.launch {
            try {
                results = api.searchMedia(value, mediaType)
                if (results.isEmpty()) showError("No se encontraron resultados")
            } catch (_: Exception) {
                showError("No se pudo buscar en NihongoTracker")
            } finally {
                busy = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onOpenChange(false) },
        title = { Text("Vincular con NihongoTracker") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                when (connected) {
                    null -> CircularProgressIndicator()
                    false -> Text("Primero conecta tu cuenta de NihongoTracker desde Ajustes.")
                    true -> {
                        currentLink?.let { link ->
                            Text(
                                if (link.mode == "manual") {
                                    "Configurada sin coincidencia: ${link.mediaTitle ?: serie.visibleName}"
                                } else {
                                    "Vinculada a: ${link.mediaTitle ?: link.mediaId ?: serie.visibleName}"
                                },
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            androidx.compose.material3.OutlinedTextField(
                                value = query,
                                onValueChange = { query = it },
                                label = { Text("Título") },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                            )
                            Button(onClick = ::search, enabled = !busy) {
                                Text("Buscar")
                            }
                        }
                        LazyColumn(
                            modifier = Modifier.heightIn(max = 260.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(results) { media ->
                                val id = media.resolvedId
                                if (id != null) {
                                    TextButton(
                                        onClick = {
                                            if (busy) return@TextButton
                                            busy = true
                                            scope.launch {
                                                try {
                                                    val link = api.linkSeries(
                                                        serieId = serie.id,
                                                        mediaType = mediaType,
                                                        mediaId = id,
                                                        mediaTitle = media.resolvedTitle,
                                                    )
                                                    currentLink = link
                                                    onLinkChanged(link)
                                                    onOpenChange(false)
                                                } catch (_: Exception) {
                                                    showError("No se pudo vincular la serie")
                                                } finally {
                                                    busy = false
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Column(modifier = Modifier.fillMaxWidth()) {
                                            Text(media.resolvedTitle)
                                            Text("ID: $id")
                                        }
                                    }
                                }
                            }
                        }
                        currentLink?.let {
                            TextButton(
                                onClick = {
                                    if (busy) return@TextButton
                                    busy = true
                                    scope.launch {
                                        try {
                                            api.unlinkSeries(serie.id)
                                            currentLink = null
                                            onLinkChanged(null)
                                            onOpenChange(false)
                                        } catch (_: Exception) {
                                            showError("No se pudo desvincular la serie")
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                                enabled = !busy,
                            ) {
                                Text("Desvincular")
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onOpenChange(false) }, enabled = !busy) {
                Text("Cerrar")
            }
        },
    )
}
