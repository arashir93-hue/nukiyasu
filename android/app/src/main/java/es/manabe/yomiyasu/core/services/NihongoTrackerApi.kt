package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.models.NihongoTrackerBookStatus
import es.manabe.yomiyasu.core.models.NihongoTrackerLink
import es.manabe.yomiyasu.core.models.NihongoTrackerLogRequest
import es.manabe.yomiyasu.core.models.NihongoTrackerLogResponse
import es.manabe.yomiyasu.core.models.NihongoTrackerStatus
import es.manabe.yomiyasu.core.networking.ApiClient
import es.manabe.yomiyasu.core.networking.Endpoint
import es.manabe.yomiyasu.core.networking.jsonBody
import kotlinx.serialization.builtins.nullable
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cliente únicamente del backend de Nukiyasu. La API key de NihongoTracker
 * nunca llega a Android: el backend la descifra y realiza las llamadas
 * externas en nombre del usuario autenticado.
 */
@Singleton
class NihongoTrackerApi @Inject constructor(
    private val api: ApiClient,
) {
    suspend fun status(): NihongoTrackerStatus = api.send(
        Endpoint.get("api/nihongo-tracker/status"),
        NihongoTrackerStatus.serializer(),
    )

    suspend fun linkForSerie(serieId: String): NihongoTrackerLink? {
        val data = api.sendBytes(Endpoint.get("api/nihongo-tracker/series/$serieId"))
        return api.json.decodeFromString(
            NihongoTrackerLink.serializer().nullable,
            data.decodeToString(),
        )
    }

    suspend fun bookStatus(bookId: String): NihongoTrackerBookStatus = api.send(
        Endpoint.get("api/nihongo-tracker/books/$bookId/status"),
        NihongoTrackerBookStatus.serializer(),
    )

    suspend fun logBook(
        bookId: String,
        volumeNumber: Double? = null,
        requestId: String = UUID.randomUUID().toString(),
    ): NihongoTrackerLogResponse = api.send(
        Endpoint.post(
            "api/nihongo-tracker/books/$bookId/log",
            body = jsonBody(NihongoTrackerLogRequest(volumeNumber, requestId)),
        ),
        NihongoTrackerLogResponse.serializer(),
    )
}
