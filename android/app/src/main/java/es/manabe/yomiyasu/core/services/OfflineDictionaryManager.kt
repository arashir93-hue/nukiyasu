package es.manabe.yomiyasu.core.services

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

class OfflineDictionaryManager internal constructor(
    private val directory: File,
    private val remote: DictionaryRemoteSource,
    private val validator: DictionaryFileValidator,
    private val json: Json,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    constructor(
        @ApplicationContext context: Context,
        remote: DictionaryRemoteSource,
        validator: DictionaryFileValidator,
        json: Json,
    ) : this(File(context.filesDir, DEFAULT_RELATIVE_DIRECTORY), remote, validator, json)

    companion object {
        const val DEFAULT_RELATIVE_DIRECTORY = "Yomiyasu/Dictionary"
        private const val SQLITE = "dictionary.sqlite"
        private const val METADATA = "dictionary.metadata.json"
        private const val PART = "dictionary.sqlite.gz.part"
        private const val NEW = "dictionary.sqlite.new"
        private const val PREVIOUS = "dictionary.sqlite.previous"
        private const val METADATA_NEW = "dictionary.metadata.json.new"
        private const val METADATA_PREVIOUS = "dictionary.metadata.json.previous"
        private const val BUFFER_SIZE = 64 * 1024
        private const val MAX_MANIFEST_BYTES = 128 * 1024
    }

    private val operationLock = Any()
    private val operationScope = CoroutineScope(SupervisorJob() + dispatcher)
    private var activeJob: Job? = null
    private var backgroundInstallJob: Job? = null
    private var latestPackage: RemoteDictionaryPackage? = null
    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<OfflineDictionaryState> = _state.asStateFlow()

    init {
        directory.mkdirs()
        recoverInterruptedFiles()
        _state.value = installedState()
    }

    suspend fun checkForUpdates(): OfflineDictionaryState = withOperation {
        try {
            _state.value = _state.value.copy(status = OfflineDictionaryManagerStatus.CHECKING, error = null)
            val packageInfo = remote.latest()
            validateDictionaryManifest(packageInfo.manifest)
            latestPackage = packageInfo
            val installed = readInstalledManifest()
            _state.value = if (installed != null && sameIdentity(installed, packageInfo.manifest)) {
                OfflineDictionaryState(OfflineDictionaryManagerStatus.INSTALLED, installed, packageInfo.manifest)
            } else if (installed == null) {
                OfflineDictionaryState(OfflineDictionaryManagerStatus.AVAILABLE, null, packageInfo.manifest)
            } else {
                OfflineDictionaryState(OfflineDictionaryManagerStatus.UPDATE_AVAILABLE, installed, packageInfo.manifest)
            }
        } catch (error: Exception) {
            _state.value = installedState(OfflineDictionaryManagerStatus.ERROR, error.message)
            throw error
        }
        _state.value
    }

    suspend fun installLatest(): OfflineDictionaryState = withOperation {
        try {
            val packageInfo = latestPackage ?: remote.latest().also {
                validateDictionaryManifest(it.manifest)
                latestPackage = it
            }
            validateDictionaryManifest(packageInfo.manifest)
            val manifest = packageInfo.manifest
            _state.value = OfflineDictionaryState(
                OfflineDictionaryManagerStatus.DOWNLOADING,
                readInstalledManifest(), manifest, 0, manifest.compressedSize,
            )
            downloadToPart(packageInfo.assetUrl, manifest)
            _state.value = _state.value.copy(status = OfflineDictionaryManagerStatus.VERIFYING)
            decompressAndValidate(manifest)
            _state.value = _state.value.copy(status = OfflineDictionaryManagerStatus.INSTALLING)
            installAtomically(manifest)
            _state.value = OfflineDictionaryState(
                OfflineDictionaryManagerStatus.INSTALLED,
                manifest,
                manifest,
                manifest.compressedSize,
                manifest.compressedSize,
            )
        } catch (cancelled: CancellationException) {
            cleanupTemporaryFiles()
            _state.value = installedState(status = OfflineDictionaryManagerStatus.CANCELLED)
            throw cancelled
        } catch (error: Exception) {
            cleanupTemporaryFiles()
            _state.value = installedState(
                status = OfflineDictionaryManagerStatus.ERROR,
                error = error.message ?: "No se pudo instalar el diccionario",
            )
        }
        _state.value
    }

    fun cancel() {
        synchronized(operationLock) { activeJob?.cancel() }
    }

    /** Starts an installation owned by the application manager, not a screen's lifecycle. */
    fun installLatestInBackground(): Job = synchronized(operationLock) {
        backgroundInstallJob?.takeIf { it.isActive } ?: operationScope.launch {
            try {
                installLatest()
            } finally {
                synchronized(operationLock) { backgroundInstallJob = null }
            }
        }.also { backgroundInstallJob = it }
    }

    fun deleteDictionary() {
        synchronized(operationLock) {
            check(activeJob == null) { "Hay una operación del diccionario en curso" }
        }
        listOf(SQLITE, METADATA, PART, NEW, PREVIOUS, METADATA_NEW, METADATA_PREVIOUS)
            .map(::file)
            .forEach { it.delete() }
        _state.value = OfflineDictionaryState(OfflineDictionaryManagerStatus.NOT_INSTALLED)
        latestPackage = null
    }

    private suspend fun <T> withOperation(block: suspend () -> T): T {
        val operationJob = kotlinx.coroutines.currentCoroutineContext()[Job]
        synchronized(operationLock) {
            check(activeJob == null) { "Ya hay una operación del diccionario en curso" }
            activeJob = operationJob
        }
        return try {
            withContext(dispatcher) { block() }
        } catch (error: Exception) {
            if (error !is CancellationException) {
                _state.value = installedState(OfflineDictionaryManagerStatus.ERROR, error.message)
            }
            throw error
        } finally {
            synchronized(operationLock) { activeJob = null }
        }
    }

    private suspend fun downloadToPart(url: String, manifest: DictionaryManifest) {
        require(isSafeHttpsUrl(url)) { "Solo se permiten descargas HTTPS" }
        val asset = remote.openAsset(url)
        val cancellationHandle = kotlinx.coroutines.currentCoroutineContext()[Job]
            ?.invokeOnCompletion { asset.close() }
        try {
            asset.use { stream ->
            require(stream.contentLength < 0 || stream.contentLength == manifest.compressedSize) {
                "Tamaño HTTP distinto al manifest"
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var downloaded = 0L
            FileOutputStream(file(PART)).use { output ->
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    kotlinx.coroutines.currentCoroutineContext().ensureActive()
                    val count = stream.read(buffer)
                    if (count < 0) break
                    if (count == 0) continue
                    downloaded += count
                    require(downloaded <= manifest.compressedSize) { "El archivo supera compressedSize" }
                    digest.update(buffer, 0, count)
                    output.write(buffer, 0, count)
                    _state.value = _state.value.copy(bytesDownloaded = downloaded, bytesTotal = manifest.compressedSize)
                }
                output.fd.sync()
            }
            require(downloaded == manifest.compressedSize) { "Descarga incompleta" }
            require(digest.digest().toHex() == manifest.sha256.lowercase()) { "SHA-256 no coincide" }
            }
        } finally {
            cancellationHandle?.dispose()
        }
    }

    private suspend fun decompressAndValidate(manifest: DictionaryManifest) {
        var extracted = 0L
        GZIPInputStream(BufferedInputStream(FileInputStream(file(PART))), BUFFER_SIZE).use { input ->
            FileOutputStream(file(NEW)).use { output ->
                val buffered = BufferedOutputStream(output, BUFFER_SIZE)
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    kotlinx.coroutines.currentCoroutineContext().ensureActive()
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (count == 0) continue
                    extracted += count
                    require(extracted <= manifest.sqliteSize) { "La extracción supera sqliteSize" }
                    buffered.write(buffer, 0, count)
                }
                buffered.flush()
                output.fd.sync()
            }
        }
        require(extracted == manifest.sqliteSize) { "Tamaño SQLite distinto al manifest" }
        check(validator.validate(file(NEW), manifest)) { "SQLite no válida" }
    }

    private fun installAtomically(manifest: DictionaryManifest) {
        file(METADATA_NEW).writeText(json.encodeToString(DictionaryManifest.serializer(), manifest))
        try {
            file(PREVIOUS).delete()
            file(METADATA_PREVIOUS).delete()
            if (file(SQLITE).exists()) check(file(SQLITE).renameTo(file(PREVIOUS))) { "No se pudo guardar previous" }
            if (file(METADATA).exists()) check(file(METADATA).renameTo(file(METADATA_PREVIOUS))) { "No se pudo guardar metadata previous" }
            check(file(NEW).renameTo(file(SQLITE))) { "No se pudo instalar SQLite" }
            check(file(METADATA_NEW).renameTo(file(METADATA))) { "No se pudo instalar metadata" }
            check(validator.validate(file(SQLITE), manifest)) { "La instalación final no es válida" }
            file(PREVIOUS).delete()
            file(METADATA_PREVIOUS).delete()
            file(PART).delete()
        } catch (error: Exception) {
            if (!file(SQLITE).exists() && file(PREVIOUS).exists()) file(PREVIOUS).renameTo(file(SQLITE))
            if (!file(METADATA).exists() && file(METADATA_PREVIOUS).exists()) file(METADATA_PREVIOUS).renameTo(file(METADATA))
            throw error
        }
    }

    private fun recoverInterruptedFiles() {
        file(PART).delete()
        val currentValid = validator.isValidInstalled(file(SQLITE))
        val previousValid = validator.isValidInstalled(file(PREVIOUS))
        if (!currentValid && previousValid) {
            file(SQLITE).delete()
            file(METADATA).delete()
            file(PREVIOUS).renameTo(file(SQLITE))
            if (file(METADATA_PREVIOUS).exists()) file(METADATA_PREVIOUS).renameTo(file(METADATA))
        } else if (currentValid) {
            file(PREVIOUS).delete()
            file(METADATA_PREVIOUS).delete()
        }
        file(NEW).delete()
        file(METADATA_NEW).delete()
    }

    private fun cleanupTemporaryFiles() {
        listOf(PART, NEW, METADATA_NEW).map(::file).forEach { it.delete() }
    }

    private fun installedState(
        status: OfflineDictionaryManagerStatus = if (validator.isValidInstalled(file(SQLITE))) {
            OfflineDictionaryManagerStatus.INSTALLED
        } else {
            OfflineDictionaryManagerStatus.NOT_INSTALLED
        },
        error: String? = null,
    ) = OfflineDictionaryState(status, readInstalledManifest(), error = error)

    private fun initialState() = OfflineDictionaryState(OfflineDictionaryManagerStatus.NOT_INSTALLED)

    private fun readInstalledManifest(): DictionaryManifest? = runCatching {
        file(METADATA).takeIf(File::isFile)?.readText()?.let {
            json.decodeFromString<DictionaryManifest>(it).also(::validateDictionaryManifest)
        }
    }.getOrNull()

    private fun sameIdentity(left: DictionaryManifest, right: DictionaryManifest): Boolean =
        left.dictionaryVersion == right.dictionaryVersion &&
            left.dictionaryDate == right.dictionaryDate &&
            left.sha256.equals(right.sha256, ignoreCase = true)

    private fun file(name: String) = File(directory, name)

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }
}
