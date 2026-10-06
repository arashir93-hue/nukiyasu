package es.manabe.yomiyasu.core.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.InputStream

interface DictionaryRemoteSource {
    suspend fun latest(): RemoteDictionaryPackage

    suspend fun openAsset(url: String): DictionaryAssetStream
}

class DictionaryAssetStream(
    private val source: InputStream,
    val contentLength: Long,
) : InputStream() {
    override fun read(): Int = source.read()
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = source.read(buffer, offset, length)
    override fun close() = source.close()
}

/**
 * Locates dictionary releases independently from APK releases. A release is
 * considered a dictionary release only when its tag starts with
 * `dictionary-` and it contains both dictionary assets.
 */
class GitHubDictionarySource(
    private val client: OkHttpClient,
    private val json: Json,
    private val apiBaseUrl: String,
    private val repositoryOwner: String = "arashir93-hue",
    private val repositoryName: String = "nukiyasu",
) : DictionaryRemoteSource {

    override suspend fun latest(): RemoteDictionaryPackage = withContext(Dispatchers.IO) {
        val releases = requestJson<List<GitHubRelease>>(
            "${apiBaseUrl.trimEnd('/')}/repos/$repositoryOwner/$repositoryName/releases?per_page=100",
        )
        val release = releases.firstOrNull { candidate ->
            candidate.tagName.startsWith("dictionary-") && !candidate.draft &&
                candidate.assets.any { it.name == MANIFEST_ASSET } &&
                candidate.assets.any { it.name == SQLITE_ASSET }
        } ?: error("No hay una release de diccionario disponible")

        val manifestAsset = release.assets.first { it.name == MANIFEST_ASSET }
        val sqliteAsset = release.assets.first { it.name == SQLITE_ASSET }
        require(isSafeHttpsUrl(manifestAsset.browserDownloadUrl)) { "URL de manifest no segura" }
        require(isSafeHttpsUrl(sqliteAsset.browserDownloadUrl)) { "URL de diccionario no segura" }
        val rawManifest = requestText(manifestAsset.browserDownloadUrl)
        val manifest = json.decodeFromString<DictionaryManifest>(rawManifest)
        validateDictionaryManifest(manifest)
        RemoteDictionaryPackage(manifest, sqliteAsset.browserDownloadUrl)
    }

    override suspend fun openAsset(url: String): DictionaryAssetStream = withContext(Dispatchers.IO) {
        require(isSafeHttpsUrl(url)) { "Solo se permiten descargas HTTPS" }
        val response = client.newCall(Request.Builder().url(url).get().build()).execute()
        if (!response.isSuccessful) {
            response.close()
            error("Descarga del diccionario HTTP ${response.code}")
        }
        val body = response.body
        DictionaryAssetStream(body.byteStream(), body.contentLength())
    }

    private inline fun <reified T> requestJson(url: String): T {
        return json.decodeFromString(requestText(url))
    }

    private fun requestText(url: String): String {
        require(isSafeHttpsUrl(url)) { "Solo se permiten respuestas HTTPS" }
        val response = client.newCall(
            Request.Builder().url(url).header("Accept", "application/vnd.github+json").get().build(),
        ).execute()
        response.use {
            check(it.isSuccessful) { "GitHub HTTP ${it.code}" }
            return it.body.string().takeIf(String::isNotBlank) ?: error("Respuesta vacía")
        }
    }

    private companion object {
        const val MANIFEST_ASSET = "nukiyasu-dictionary.json"
        const val SQLITE_ASSET = "nukiyasu-dictionary.sqlite.gz"
    }
}

@Serializable
private data class GitHubRelease(
    @SerialName("tag_name") val tagName: String = "",
    val draft: Boolean = false,
    val assets: List<GitHubDictionaryAsset> = emptyList(),
)

@Serializable
private data class GitHubDictionaryAsset(
    val name: String = "",
    @SerialName("browser_download_url") val browserDownloadUrl: String = "",
)

internal fun isSafeHttpsUrl(value: String): Boolean =
    runCatching { java.net.URI(value) }.getOrNull()?.let { uri ->
        uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
    } == true

internal fun validateDictionaryManifest(manifest: DictionaryManifest) {
    require(manifest.schemaVersion == LocalDictionary.SUPPORTED_SCHEMA_VERSION) { "Schema no soportado" }
    require(manifest.dictionaryVersion.isNotBlank()) { "dictionaryVersion vacío" }
    require(manifest.dictionaryDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "dictionaryDate inválida" }
    require(manifest.generatorVersion.isNotBlank()) { "generatorVersion vacío" }
    require(manifest.sqliteSize > 0) { "sqliteSize inválido" }
    require(manifest.compressedSize > 0) { "compressedSize inválido" }
    require(manifest.sqliteSize <= MAX_SQLITE_BYTES) { "sqliteSize demasiado grande" }
    require(manifest.compressedSize <= MAX_COMPRESSED_BYTES) { "compressedSize demasiado grande" }
    require(manifest.sha256.matches(Regex("[0-9a-fA-F]{64}"))) { "sha256 inválido" }
    require(manifest.asset == "nukiyasu-dictionary.sqlite.gz") { "asset no permitido" }
}

private const val MAX_SQLITE_BYTES = 512L * 1024L * 1024L
private const val MAX_COMPRESSED_BYTES = 512L * 1024L * 1024L
