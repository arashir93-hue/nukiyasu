package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.networking.ApiClient
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DoujinshiLibraryApiTest {
    private lateinit var server: MockWebServer
    private lateinit var library: LibraryApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        library = LibraryApi(ApiClient(baseUrl = server.url("/"), client = OkHttpClient()))
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `set favorite uses explicit PUT and DELETE semantics`() = runTest {
        server.enqueue(MockResponse(code = 200, body = """{"isFavorite":true}"""))
        assertTrue(library.setDoujinshiFavorite("s1", true).isFavorite)
        val add = server.takeRequest()
        assertEquals("PUT", add.method)
        assertEquals("/api/doujinshi/series/s1/favorite", add.url.encodedPath)

        server.enqueue(MockResponse(code = 200, body = """{"isFavorite":false}"""))
        assertEquals(false, library.setDoujinshiFavorite("s1", false).isFavorite)
        val remove = server.takeRequest()
        assertEquals("DELETE", remove.method)
        assertEquals("/api/doujinshi/series/s1/favorite", remove.url.encodedPath)
    }

    @Test
    fun `organization batch sends all ids in one backend request`() = runTest {
        server.enqueue(MockResponse(code = 200, body = """{"items":{"s1":{"isFavorite":true,"collectionIds":[]}}}"""))
        val result = library.doujinshiOrganization(listOf("s1"))
        assertTrue(result.items["s1"]?.isFavorite == true)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/doujinshi/organization/batch", request.url.encodedPath)
        assertTrue(request.body!!.utf8().contains("s1"))
    }
}
