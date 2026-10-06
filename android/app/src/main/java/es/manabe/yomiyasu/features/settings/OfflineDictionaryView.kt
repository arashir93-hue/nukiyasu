package es.manabe.yomiyasu.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import es.manabe.yomiyasu.core.services.ConnectivityStatus
import es.manabe.yomiyasu.core.services.OfflineDictionaryManager
import es.manabe.yomiyasu.core.services.OfflineDictionaryManagerStatus
import es.manabe.yomiyasu.core.services.OfflineDictionaryState
import java.util.Locale
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OfflineDictionaryViewModel @Inject constructor(
    private val manager: OfflineDictionaryManager,
    private val connectivity: ConnectivityStatus,
) : ViewModel() {
    val state = manager.state
    val isOnline = connectivity.isOnline
    private var started = false

    fun onAppear() {
        if (started) return
        started = true
        if (connectivity.isOnline.value) refresh()
    }

    fun refresh() {
        if (!connectivity.isOnline.value) return
        viewModelScope.launch {
            runCatching { manager.checkForUpdates() }
        }
    }

    fun downloadOrUpdate() {
        if (state.value.status == OfflineDictionaryManagerStatus.DOWNLOADING ||
            state.value.status == OfflineDictionaryManagerStatus.VERIFYING ||
            state.value.status == OfflineDictionaryManagerStatus.INSTALLING
        ) return
        manager.installLatestInBackground()
    }

    fun cancel() = manager.cancel()

    fun delete() {
        runCatching { manager.deleteDictionary() }
    }
}

@Composable
fun OfflineDictionaryRoute(
    onBack: () -> Unit,
    viewModel: OfflineDictionaryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.onAppear() }

    OfflineDictionaryScreen(
        state = state,
        isOnline = isOnline,
        onBack = onBack,
        onRefresh = viewModel::refresh,
        onDownload = viewModel::downloadOrUpdate,
        onCancel = viewModel::cancel,
        onDelete = { showDeleteDialog = true },
    )

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("¿Eliminar el diccionario offline?") },
            text = {
                Text("Las búsquedas volverán a necesitar conexión a Internet. No se eliminarán tus palabras guardadas.")
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancelar") }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.delete()
                    },
                ) { Text("Eliminar") }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OfflineDictionaryScreen(
    state: OfflineDictionaryState,
    isOnline: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    onDelete: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Diccionario offline") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp)
                .testTag("offlineDictionaryScreen"),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val manifest = state.remoteManifest ?: state.installedManifest
            Text("Diccionario offline", style = MaterialTheme.typography.headlineSmall)

            when (state.status) {
                OfflineDictionaryManagerStatus.NOT_INSTALLED,
                OfflineDictionaryManagerStatus.AVAILABLE,
                -> {
                    manifest?.let { DictionaryInfo(it, installed = false) }
                    if (!isOnline) {
                        Text("No hay conexión. Necesitas Internet para descargar el diccionario.")
                    }
                    Button(onClick = onDownload, enabled = isOnline && manifest != null) {
                        Text("Descargar")
                    }
                }

                OfflineDictionaryManagerStatus.CHECKING -> {
                    CircularProgressIndicator()
                    Text("Comprobando actualizaciones…")
                }

                OfflineDictionaryManagerStatus.DOWNLOADING -> {
                    Text("Descargando diccionario")
                    val progress = if (state.bytesTotal > 0) {
                        state.bytesDownloaded.toFloat() / state.bytesTotal
                    } else 0f
                    LinearProgressIndicator(progress = { progress.coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                    Text("${formatBytes(state.bytesDownloaded)} / ${formatBytes(state.bytesTotal)} · ${(progress * 100).toInt()} %")
                    OutlinedButton(onClick = onCancel) { Text("Cancelar") }
                }

                OfflineDictionaryManagerStatus.VERIFYING -> {
                    CircularProgressIndicator()
                    Text("Verificando descarga…")
                }

                OfflineDictionaryManagerStatus.INSTALLING -> {
                    CircularProgressIndicator()
                    Text("Instalando diccionario…")
                }

                OfflineDictionaryManagerStatus.INSTALLED -> {
                    state.installedManifest?.let { DictionaryInfo(it, installed = true) }
                    Text("Actualizado")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onRefresh, enabled = isOnline) {
                            Text("Buscar actualizaciones")
                        }
                        OutlinedButton(onClick = onDelete) {
                            Icon(Icons.Filled.Delete, contentDescription = null)
                            Text("Eliminar")
                        }
                    }
                    if (!isOnline) Text("Sin conexión: se mantiene disponible la copia instalada.")
                }

                OfflineDictionaryManagerStatus.UPDATE_AVAILABLE -> {
                    Text("Actualización disponible", style = MaterialTheme.typography.titleLarge)
                    state.installedManifest?.let { DictionaryInfo(it, installed = true) }
                    Text("→")
                    state.remoteManifest?.let { DictionaryInfo(it, installed = false) }
                    Button(onClick = onDownload, enabled = isOnline) { Text("Actualizar") }
                    TextButton(onClick = onBack) { Text("Ahora no") }
                }

                OfflineDictionaryManagerStatus.CANCELLED -> {
                    Text("Descarga cancelada")
                    Button(onClick = onDownload, enabled = isOnline) { Text("Reintentar") }
                }

                OfflineDictionaryManagerStatus.ERROR -> {
                    Text("No se pudo completar la operación.", color = MaterialTheme.colorScheme.error)
                    Text("Comprueba la conexión e inténtalo de nuevo.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onRefresh, enabled = isOnline) { Text("Reintentar") }
                        state.installedManifest?.let { OutlinedButton(onClick = onDelete) { Text("Eliminar") } }
                    }
                }
            }
        }
    }
}

@Composable
private fun DictionaryInfo(
    manifest: es.manabe.yomiyasu.core.services.DictionaryManifest,
    installed: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("JMDict ${manifest.dictionaryVersion}")
        Text(formatDate(manifest.dictionaryDate))
        if (installed) Text("Espacio instalado: ${formatBytes(manifest.sqliteSize)}")
        else Text("Descarga: ${formatBytes(manifest.compressedSize)}")
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "—"
    val mib = bytes / (1024.0 * 1024.0)
    return if (mib >= 1) String.format(Locale.getDefault(), "%.1f MiB", mib) else "$bytes B"
}

private fun formatDate(value: String): String {
    val parts = value.split('-')
    return if (parts.size == 3) "${parts[2]}/${parts[1]}/${parts[0]}" else value
}
