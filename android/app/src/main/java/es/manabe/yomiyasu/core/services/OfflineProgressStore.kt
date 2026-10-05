package es.manabe.yomiyasu.core.services

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import es.manabe.yomiyasu.core.networking.YomiyasuJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collect
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class PendingProgress(val request: ReadProgressRequest, val queuedAt: Long)

internal interface PendingProgressRepository {
    fun all(): List<PendingProgress>
    fun upsert(request: ReadProgressRequest)
    fun remove(bookId: String)
}

@Singleton
class OfflineProgressStore @Inject constructor(
    @ApplicationContext context: Context,
    private val json: Json,
) : PendingProgressRepository {
    private val directory = File(context.filesDir, "Yomiyasu")
    private val file = File(directory, "offline-progress.json")

    private val delegate = PendingProgressFileStore(file, directory, json)

    @Synchronized
    override fun all(): List<PendingProgress> = delegate.all()

    @Synchronized
    override fun upsert(request: ReadProgressRequest) {
        delegate.upsert(request)
    }

    @Synchronized
    override fun remove(bookId: String) {
        delegate.remove(bookId)
    }
}

internal class PendingProgressFileStore(
    private val file: File,
    private val directory: File,
    private val json: Json,
) : PendingProgressRepository {
    @Synchronized override fun all(): List<PendingProgress> = runCatching {
        if (!file.exists()) return emptyList()
        json.decodeFromString(ListSerializer(PendingProgress.serializer()), file.readText())
    }.getOrDefault(emptyList())

    @Synchronized override fun upsert(request: ReadProgressRequest) {
        write(all().filterNot { it.request.book == request.book } + PendingProgress(request, System.currentTimeMillis()))
    }

    @Synchronized override fun remove(bookId: String) { write(all().filterNot { it.request.book == bookId }) }

    private fun write(items: List<PendingProgress>) {
        runCatching {
            directory.mkdirs()
            val temp = File(directory, "${file.name}.tmp")
            temp.writeText(json.encodeToString(ListSerializer(PendingProgress.serializer()), items))
            if (file.exists()) file.delete()
            check(temp.renameTo(file)) { "No se pudo guardar el progreso pendiente" }
        }
    }
}

internal class OfflineProgressSyncEngine(
    private val store: PendingProgressRepository,
    private val upload: suspend (ReadProgressRequest) -> Unit,
) {
    suspend fun saveOrQueue(request: ReadProgressRequest) {
        try {
            upload(request)
            store.remove(request.book)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            store.upsert(request)
        }
    }

    suspend fun syncPending() {
        for (pending in store.all()) {
            try {
                upload(pending.request)
                store.remove(pending.request.book)
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                return
            }
        }
    }
}

@Singleton
class OfflineProgressSync @Inject constructor(
    private val progress: ProgressApi,
    private val store: OfflineProgressStore,
    private val network: NetworkMonitor,
    @es.manabe.yomiyasu.core.di.ApplicationScope scope: kotlinx.coroutines.CoroutineScope,
) {
    private val engine = OfflineProgressSyncEngine(store) { progress.save(it) }

    init {
        scope.launch {
            network.isOnline.collect { if (it) syncPending() }
        }
    }

    suspend fun saveOrQueue(request: ReadProgressRequest) {
        if (!network.isOnline.value) {
            store.upsert(request)
            return
        }
        engine.saveOrQueue(request)
    }

    suspend fun syncPending() {
        engine.syncPending()
    }
}
