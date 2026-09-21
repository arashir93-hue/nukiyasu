package es.manabe.yomiyasu.features.nihongotracker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.NihongoTrackerBookStatus
import kotlinx.coroutines.launch

/**
 * Manual registration action shown only at the end of a volume. All data is
 * obtained from Nukiyasu's authenticated backend; the external API key never
 * enters this process.
 */
@Composable
fun NihongoTrackerReaderButton(
    book: Book,
    completed: Boolean,
    saveProgress: suspend () -> Unit,
    startReread: suspend () -> Unit = {},
) {
    if (!completed) return

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val api = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            LibraryEntryPoint::class.java,
        ).nihongoTrackerApi()
    }

    var status by remember(book.id) { mutableStateOf<NihongoTrackerBookStatus?>(null) }
    var dialogOpen by remember(book.id) { mutableStateOf(false) }
    var saving by remember(book.id) { mutableStateOf(false) }

    LaunchedEffect(book.id) {
        status = runCatching { api.bookStatus(book.id) }.getOrNull()
    }

    val current = status ?: return
    if (!current.connected || (!current.linked && current.serieName.isBlank())) return
    val manual = !current.linked
    val hasPreviousLogs = current.hasPreviousLogs || current.logCount > 0 || current.alreadyLogged

    fun register(explicitReread: Boolean) {
        if (saving) return
        saving = true
        scope.launch {
            try {
                if (explicitReread) startReread()
                saveProgress()
                val refreshed = api.bookStatus(book.id)
                if (!refreshed.completed) {
                    android.widget.Toast.makeText(
                        context,
                        "No se pudo guardar el progreso terminado",
                        android.widget.Toast.LENGTH_SHORT,
                    ).show()
                    return@launch
                }

                if (!refreshed.linked) {
                    val serieId = book.serie
                    if (serieId.isNullOrBlank() || refreshed.serieName.isBlank()) {
                        throw IllegalStateException("No se pudo determinar la serie para el registro manual")
                    }
                    api.setManualSeriesLink(serieId, refreshed.serieName)
                }

                val response = api.logBook(book.id)
                status = api.bookStatus(book.id)
                android.widget.Toast.makeText(
                    context,
                    if (response.status == "already_logged") {
                        "Esta lectura ya estaba registrada"
                    } else {
                        "Volumen registrado en NihongoTracker"
                    },
                    android.widget.Toast.LENGTH_SHORT,
                ).show()
                dialogOpen = false
            } catch (_: Exception) {
                android.widget.Toast.makeText(
                    context,
                    "No se pudo registrar el volumen en NihongoTracker",
                    android.widget.Toast.LENGTH_SHORT,
                ).show()
            } finally {
                saving = false
            }
        }
    }

    IconButton(onClick = { dialogOpen = true }, enabled = !saving) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = "Registrar volumen en NihongoTracker",
            tint = androidx.compose.ui.graphics.Color.White,
        )
    }

    if (!dialogOpen) return

    AlertDialog(
        onDismissRequest = { if (!saving) dialogOpen = false },
        title = { Text("Registrar en NihongoTracker") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (manual) {
                    Text("Sin vínculo: se registrará manualmente como «${current.serieName}».")
                } else {
                    Text("Vinculado a «${current.trackerTitle ?: current.serieName}».")
                }
                Text("Volumen detectado: ${formatVolume(current.volumeNumber)}")
                if (current.volumeSource == "position") {
                    Text("El volumen se ha inferido por su posición.")
                }
                if (hasPreviousLogs) {
                    Text("Este volumen ya tiene registros. «Registrar» reintenta la misma operación; «Releer y registrar» crea una nueva lectura.")
                }
            }
        },
        confirmButton = {
            androidx.compose.foundation.layout.Row {
                if (hasPreviousLogs) {
                    TextButton(onClick = { register(true) }, enabled = !saving) {
                        Text("Releer y registrar")
                    }
                }
                TextButton(onClick = { register(false) }, enabled = !saving) {
                    if (saving) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                    Text("Registrar")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = { dialogOpen = false }, enabled = !saving) {
                Text("Cancelar")
            }
        },
    )
}

private fun formatVolume(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
