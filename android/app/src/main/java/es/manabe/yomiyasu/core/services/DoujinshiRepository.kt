package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.di.ApplicationScope
import es.manabe.yomiyasu.core.models.DoujinshiCollection
import es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest
import es.manabe.yomiyasu.core.models.DoujinshiOrganization
import es.manabe.yomiyasu.core.session.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Estado compartido de la organización privada de doujinshi.
 *
 * Las series y los volúmenes siguen procediendo de [LibraryApi]. Este repositorio
 * solo mantiene la organización del usuario para que detalle, biblioteca y
 * colecciones no tengan copias contradictorias de favorito/colecciones.
 */
@Singleton
class DoujinshiRepository @Inject constructor(
    private val api: LibraryApi,
    private val session: SessionStore,
    @ApplicationScope scope: CoroutineScope,
) {
    private val _organizations = MutableStateFlow<Map<String, DoujinshiOrganization>>(emptyMap())
    val organizations: StateFlow<Map<String, DoujinshiOrganization>> = _organizations.asStateFlow()

    private val _collections = MutableStateFlow<List<DoujinshiCollection>>(emptyList())
    val collections: StateFlow<List<DoujinshiCollection>> = _collections.asStateFlow()

    init {
        scope.launch {
            session.state.collect { state ->
                if (state !is SessionStore.State.LoggedIn) clear()
            }
        }
    }

    suspend fun refreshOrganization(serieIds: Collection<String>) {
        val ids = serieIds.map(String::trim).filter(String::isNotEmpty).distinct()
        if (ids.isEmpty()) return

        val loaded = buildMap {
            organizationChunks(ids).forEach { chunk ->
                putAll(api.doujinshiOrganization(chunk).items)
            }
        }
        _organizations.value = _organizations.value + loaded
    }

    suspend fun refreshCollections() {
        _collections.value = api.doujinshiCollections()
            .sortedWith(compareByDescending<DoujinshiCollection> { it.isFavorite }.thenBy { it.sortOrder })
    }

    suspend fun setFavorite(serieId: String, desiredState: Boolean) {
        val result = api.setDoujinshiFavorite(serieId, desiredState)
        val current = _organizations.value[serieId] ?: DoujinshiOrganization()
        _organizations.value = _organizations.value + (serieId to current.copy(isFavorite = result.isFavorite))
    }

    fun setFavoriteLocally(serieId: String, desiredState: Boolean) {
        val current = _organizations.value[serieId] ?: DoujinshiOrganization()
        _organizations.value = _organizations.value + (serieId to current.copy(isFavorite = desiredState))
    }

    suspend fun setCollectionItem(collectionId: String, serieId: String, included: Boolean) {
        api.setDoujinshiCollectionItem(collectionId, serieId, included)
        val current = _organizations.value[serieId] ?: DoujinshiOrganization()
        val ids = if (included) {
            (current.collectionIds + collectionId).distinct()
        } else {
            current.collectionIds.filterNot { it == collectionId }
        }
        _organizations.value = _organizations.value + (serieId to current.copy(collectionIds = ids))
        refreshCollections()
    }

    suspend fun createCollection(name: String): DoujinshiCollection {
        val created = api.createDoujinshiCollection(name.trim())
        _collections.value = (_collections.value + created)
            .sortedWith(compareByDescending<DoujinshiCollection> { it.isFavorite }.thenBy { it.sortOrder })
        return created
    }

    suspend fun updateCollection(
        collectionId: String,
        request: DoujinshiCollectionUpdateRequest,
    ): DoujinshiCollection {
        val updated = api.updateDoujinshiCollection(collectionId, request)
        _collections.value = _collections.value
            .map { if (it.id == collectionId) updated else it }
            .sortedWith(compareByDescending<DoujinshiCollection> { it.isFavorite }.thenBy { it.sortOrder })
        return updated
    }

    suspend fun deleteCollection(collectionId: String) {
        api.deleteDoujinshiCollection(collectionId)
        _collections.value = _collections.value.filterNot { it.id == collectionId }
        _organizations.value = _organizations.value.mapValues { (_, organization) ->
            organization.copy(collectionIds = organization.collectionIds.filterNot { it == collectionId })
        }
    }

    fun clear() {
        _organizations.value = emptyMap()
        _collections.value = emptyList()
    }

    companion object {
        const val MAX_BATCH_SIZE = 100

        internal fun organizationChunks(serieIds: Collection<String>): List<List<String>> =
            serieIds.toList().chunked(MAX_BATCH_SIZE)
    }
}
