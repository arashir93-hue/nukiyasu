package es.manabe.yomiyasu.features.updates

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import es.manabe.yomiyasu.core.updates.UpdateInfo

@Composable
fun UpdateDialog(
    update: UpdateInfo,
    onLater: () -> Unit,
    onUpdateOpened: () -> Unit,
) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = { if (!update.isMandatory) onLater() },
        title = { Text(if (update.isMandatory) "Actualización obligatoria" else "Nueva versión disponible") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 320.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Row(modifier = Modifier.fillMaxWidth()) {
                    Text("Instalada: ${update.installedVersionName}")
                    Text("  →  ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Disponible: ${update.availableVersionName}")
                }
                if (update.isMandatory) {
                    Text(
                        text = "Esta versión ya no es compatible. Actualiza para continuar.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                if (update.releaseNotes.isNotBlank()) {
                    Text(
                        text = update.releaseNotes,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                if (openUpdateUrl(context, update.releaseUrl)) onUpdateOpened()
            }) {
                Text("Actualizar")
            }
        },
        dismissButton = if (!update.isMandatory) {
            {
                TextButton(onClick = onLater) { Text("Más tarde") }
            }
        } else {
            null
        },
    )
}

private fun openUpdateUrl(context: Context, url: String): Boolean = runCatching {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    true
}.getOrElse {
    Toast.makeText(context, "No se pudo abrir la página de actualización", Toast.LENGTH_LONG).show()
    false
}
