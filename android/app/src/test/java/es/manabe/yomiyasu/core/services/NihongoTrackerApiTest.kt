package es.manabe.yomiyasu.core.services

import es.manabe.yomiyasu.core.networking.ApiClient
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NihongoTrackerApiTest {

    private lateinit var server: MockWebServer
    private lateinit var tracker: NihongoTrackerApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        tracker = NihongoTrackerApi(
            ApiClient(baseUrl = server.url("/"), client = OkHttpClient()),
        )
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `uses backend status link book status and log endpoints`() = runTest {
        server.enqueue(MockResponse(code = 200, body = """{"connected":true,"linkedSeries":2}"""))
        val status = tracker.status()
        assertTrue(status.connected)
        assertEquals(2, status.linkedSeries)
        assertEquals("/api/nihongo-tracker/status", server.takeRequest().url.encodedPath)

        server.enqueue(MockResponse(code = 200, body = """{"mode":"linked","mediaType":"manga","mediaId":"123","mediaTitle":"Serie"}"""))
        val link = tracker.linkForSerie("s1")
        assertEquals("123", link?.mediaId)
        assertEquals("/api/nihongo-tracker/series/s1", server.takeRequest().url.encodedPath)

        server.enqueue(MockResponse(code = 200, body = """{"connected":true,"linked":true,"completed":true,"volumeNumber":4,"volumeSource":"manual","logCount":1}"""))
        val bookStatus = tracker.bookStatus("b1")
        assertTrue(bookStatus.linked)
        assertEquals(4.0, bookStatus.volumeNumber, 0.001)
        assertEquals("/api/nihongo-tracker/books/b1/status", server.takeRequest().url.encodedPath)

        server.enqueue(MockResponse(code = 200, body = """{"status":"logged","externalLogId":"log-1"}"""))
        val response = tracker.logBook(
            "b1",
            volumeNumber = 4.5,
            requestId = "550e8400-e29b-41d4-a716-446655440000",
        )
        assertEquals("logged", response.status)
        assertEquals("log-1", response.externalLogId)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/nihongo-tracker/books/b1/log", request.url.encodedPath)
        assertTrue(request.body!!.utf8().contains("550e8400-e29b-41d4-a716-446655440000"))
        assertTrue(request.body!!.utf8().contains("\"volumeNumber\":4.5"))
        assertFalse(request.body!!.utf8().contains("apiKey"))
    }

    @Test
    fun `null series link is accepted for an unlinked series`() = runTest {
        server.enqueue(MockResponse(code = 200, body = "null"))

        assertEquals(null, tracker.linkForSerie("s-unlinked"))
    }
}
