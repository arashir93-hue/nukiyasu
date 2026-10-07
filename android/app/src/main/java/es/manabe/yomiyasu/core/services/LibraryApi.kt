package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.models.AlphabetGroup
import es.manabe.yomiyasu.core.models.Book
import es.manabe.yomiyasu.core.models.BooksQuery
import es.manabe.yomiyasu.core.models.CreateReviewRequest
import es.manabe.yomiyasu.core.models.DoujinshiCollection
import es.manabe.yomiyasu.core.models.DoujinshiCollectionPage
import es.manabe.yomiyasu.core.models.DoujinshiCollectionRequest
import es.manabe.yomiyasu.core.models.DoujinshiCollectionUpdateRequest
import es.manabe.yomiyasu.core.models.DoujinshiFavoritePage
import es.manabe.yomiyasu.core.models.DoujinshiFavoriteStatus
import es.manabe.yomiyasu.core.models.DoujinshiOrganizationBatch
import es.manabe.yomiyasu.core.models.GenresAndArtists
import es.manabe.yomiyasu.core.models.LibraryVariant
import es.manabe.yomiyasu.core.models.ReadlistEntry
import es.manabe.yomiyasu.core.models.ReadlistRequest
import es.manabe.yomiyasu.core.models.Review
import es.manabe.yomiyasu.core.models.Serie
import es.manabe.yomiyasu.core.models.SeriesPage
import es.manabe.yomiyasu.core.models.SeriesQuery
import es.manabe.yomiyasu.core.networking.ApiClient
import es.manabe.yomiyasu.core.networking.Endpoint
import es.manabe.yomiyasu.core.networking.jsonBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LibraryApi @Inject constructor(
    private val api: ApiClient,
) {

    suspend fun seriesPage(query: SeriesQuery): SeriesPage = api.send(
        Endpoint.get("api/series/${query.variant.rawValue}", query.queryItems),
        SeriesPage.serializer(),
    )

    suspend fun seriesList(query: SeriesQuery): List<Serie> = seriesPage(query).data

    suspend fun randomSerie(query: SeriesQuery): Serie = api.send(
        Endpoint.get("api/series/${query.variant.rawValue}/random", query.randomQueryItems),
        Serie.serializer(),
    )

    suspend fun alphabet(query: SeriesQuery): List<AlphabetGroup> = api.send(
        Endpoint.get("api/series/${query.variant.rawValue}/alphabet", query.alphabetQueryItems),
        kotlinx.serialization.builtins.ListSerializer(AlphabetGroup.serializer()),
    )

    suspend fun genresAndArtists(): GenresAndArtists =
        api.send(Endpoint.get("api/series/genresAndArtists"), GenresAndArtists.serializer())

    suspend fun serieDetail(id: String): Serie =
        api.send(Endpoint.get("api/series/serie/$id"), Serie.serializer())

    suspend fun books(query: BooksQuery): List<Book> = api.send(
        Endpoint.get("api/books/${query.variant.rawValue}", query.queryItems),
        kotlinx.serialization.builtins.ListSerializer(Book.serializer()),
    )

    suspend fun book(id: String): Book =
        api.send(Endpoint.get("api/books/book/$id"), Book.serializer())

    suspend fun reading(): List<Book> = api.send(
        Endpoint.get("api/readprogress/reading"),
        kotlinx.serialization.builtins.ListSerializer(Book.serializer()),
    )

    suspend fun tablero(): List<Book> = api.send(
        Endpoint.get("api/readprogress/tablero"),
        kotlinx.serialization.builtins.ListSerializer(Book.serializer()),
    )

    suspend fun readlist(variant: LibraryVariant): List<Serie> = api.send(
        Endpoint.get("api/series/${variant.rawValue}/readlist"),
        kotlinx.serialization.builtins.ListSerializer(Serie.serializer()),
    )

    suspend fun pausedSeries(variant: LibraryVariant): List<Serie> = api.send(
        Endpoint.get("api/series/${variant.rawValue}/paused"),
        kotlinx.serialization.builtins.ListSerializer(Serie.serializer()),
    )

    suspend fun addToReadlist(serieId: String) {
        api.send(
            Endpoint.post("api/readlists", body = jsonBody(ReadlistRequest(serieId))),
            ReadlistEntry.serializer(),
        )
    }

    suspend fun removeFromReadlist(serieId: String) {
        api.send(Endpoint.post("api/readlists/delete", body = jsonBody(ReadlistRequest(serieId))))
    }

    suspend fun markSerieRead(serieId: String) {
        api.send(Endpoint.post("api/readprogress/$serieId"))
    }

    suspend fun setSeriePaused(paused: Boolean, serieId: String) {
        val action = if (paused) "pause" else "resume"
        api.send(Endpoint.post("api/serieprogress/$action/$serieId"))
    }

    suspend fun createReview(request: CreateReviewRequest): Review =
        api.send(
            Endpoint.post("api/reviews", body = jsonBody(request)),
            Review.serializer(),
        )

    suspend fun editReview(id: String, request: CreateReviewRequest): Review =
        api.send(
            Endpoint.patch("api/reviews/$id", body = jsonBody(request)),
            Review.serializer(),
        )

    suspend fun deleteReview(id: String) {
        api.send(Endpoint.delete("api/reviews/$id"))
    }

    suspend fun doujinshiFavorites(page: Int = 1, limit: Int = 24): DoujinshiFavoritePage = api.send(
        Endpoint.get(
            "api/doujinshi/favorites",
            listOf("page" to page.toString(), "limit" to limit.toString()),
        ),
        DoujinshiFavoritePage.serializer(),
    )

    suspend fun setDoujinshiFavorite(serieId: String, desiredState: Boolean): DoujinshiFavoriteStatus =
        if (desiredState) {
            api.send(
                Endpoint.put("api/doujinshi/series/$serieId/favorite", jsonBody(Unit)),
                DoujinshiFavoriteStatus.serializer(),
            )
        } else {
            api.send(
                Endpoint.delete("api/doujinshi/series/$serieId/favorite"),
                DoujinshiFavoriteStatus.serializer(),
            )
        }

    suspend fun doujinshiCollections(): List<DoujinshiCollection> = api.send(
        Endpoint.get("api/doujinshi/collections"),
        kotlinx.serialization.builtins.ListSerializer(DoujinshiCollection.serializer()),
    )

    suspend fun createDoujinshiCollection(name: String): DoujinshiCollection = api.send(
        Endpoint.post(
            "api/doujinshi/collections",
            body = jsonBody(DoujinshiCollectionRequest(name)),
        ),
        DoujinshiCollection.serializer(),
    )

    suspend fun updateDoujinshiCollection(
        collectionId: String,
        request: DoujinshiCollectionUpdateRequest,
    ): DoujinshiCollection = api.send(
        Endpoint.patch(
            "api/doujinshi/collections/$collectionId",
            body = jsonBody(request),
        ),
        DoujinshiCollection.serializer(),
    )

    suspend fun deleteDoujinshiCollection(collectionId: String) {
        api.send(Endpoint.delete("api/doujinshi/collections/$collectionId"))
    }

    suspend fun doujinshiCollectionItems(
        collectionId: String,
        page: Int = 1,
        limit: Int = 24,
    ): DoujinshiCollectionPage = api.send(
        Endpoint.get(
            "api/doujinshi/collections/$collectionId/items",
            listOf("page" to page.toString(), "limit" to limit.toString()),
        ),
        DoujinshiCollectionPage.serializer(),
    )

    suspend fun setDoujinshiCollectionItem(collectionId: String, serieId: String, included: Boolean) {
        if (included) {
            api.send(
                Endpoint.put("api/doujinshi/collections/$collectionId/items/$serieId", jsonBody(Unit)),
            )
        } else {
            api.send(Endpoint.delete("api/doujinshi/collections/$collectionId/items/$serieId"))
        }
    }

    suspend fun doujinshiOrganization(serieIds: List<String>): DoujinshiOrganizationBatch = api.send(
        Endpoint.post(
            "api/doujinshi/organization/batch",
            body = jsonBody(mapOf("serieIds" to serieIds)),
        ),
        DoujinshiOrganizationBatch.serializer(),
    )

}
