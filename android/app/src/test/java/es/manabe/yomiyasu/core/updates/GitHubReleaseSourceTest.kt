package es.manabe.yomiyasu.core.updates

import es.manabe.yomiyasu.core.networking.YomiyasuJson
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class GitHubReleaseSourceTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `release metadata markers are parsed without contacting configured server`() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body = """{
                    "tag_name":"v0.4.0",
                    "html_url":"https://github.com/arashir93-hue/nukiyasu/releases/tag/v0.4.0",
                    "body":"Nukiyasu-versionCode: 5\nNukiyasu-versionName: 0.4.0\nNukiyasu-minimumSupportedVersionCode: 4\nNotas"
                }""".trimIndent(),
            ),
        )

        val candidate = source().fetchLatest()

        assertNotNull(candidate)
        assertEquals(5, candidate!!.versionCode)
        assertEquals("0.4.0", candidate.versionName)
        assertEquals(4, candidate.minimumSupportedVersionCode)
        assertEquals("https://github.com/arashir93-hue/nukiyasu/releases/tag/v0.4.0", candidate.releaseUrl)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `failed or unsafe release responses are ignored`() = runTest {
        server.enqueue(MockResponse(code = 503))
        assertNull(source().fetchLatest())

        server.enqueue(
            MockResponse(
                code = 200,
                body = """{"tag_name":"v0.4.0","html_url":"http://example.com/release","body":"Nukiyasu-versionCode: 5"}""",
            ),
        )
        assertNull(source().fetchLatest())
    }

    @Test
    fun `update metadata json is parsed with minimum supported version`() {
        val metadata = parseUpdateMetadata(
            YomiyasuJson,
            """{"versionCode":7,"versionName":"0.5.0","minimumSupportedVersionCode":6,"releaseUrl":"https://github.com/arashir93-hue/nukiyasu/releases/tag/latest"}""",
        )

        assertNotNull(metadata)
        assertEquals(7, metadata!!.versionCode)
        assertEquals("0.5.0", metadata.versionName)
        assertEquals(6, metadata.minimumSupportedVersionCode)
    }

    private fun source() = GitHubReleaseSource(
        client = OkHttpClient.Builder()
            .build(),
        json = YomiyasuJson,
        apiBaseUrl = server.url("/").toString(),
    )
}
