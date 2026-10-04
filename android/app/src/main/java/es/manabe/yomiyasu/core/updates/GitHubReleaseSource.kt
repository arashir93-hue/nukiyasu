package es.manabe.yomiyasu.core.updates

import javax.inject.Inject
import javax.inject.Named
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

@Serializable
private data class GitHubRelease(
    @SerialName("tag_name") val tagName: String = "",
    @SerialName("html_url") val htmlUrl: String = "",
    val body: String? = null,
    val assets: List<GitHubAsset> = emptyList(),
)

@Serializable
private data class GitHubAsset(
    val name: String = "",
    @SerialName("browser_download_url") val browserDownloadUrl: String = "",
)

@Serializable
internal data class UpdateMetadata(
    val versionCode: Int = 0,
    val versionName: String = "",
    val minimumSupportedVersionCode: Int = 0,
    val releaseUrl: String? = null,
)

internal fun parseUpdateMetadata(json: Json, raw: String): UpdateMetadata? =
    runCatching { json.decodeFromString<UpdateMetadata>(raw) }.getOrNull()

/** Public GitHub Releases source; it never uses the configured Nukiyasu server. */
class GitHubReleaseSource @Inject constructor(
    private val client: OkHttpClient,
    private val json: Json,
    @Named("GitHubApiBaseUrl") private val apiBaseUrl: String,
) {

    suspend fun fetchLatest(): UpdateCandidate? = withContext(Dispatchers.IO) {
        runCatching {
            val base = apiBaseUrl.trimEnd('/')
            val release = requestJson<GitHubRelease>(
                "$base/repos/$repositoryOwner/$repositoryName/releases/latest",
            ) ?: return@runCatching null

            val metadata = release.assets
                .firstOrNull { it.name == metadataAssetName }
                ?.let { asset ->
                    if (!isSafeHttpsUrl(asset.browserDownloadUrl)) null
                    else requestJson<UpdateMetadata>(asset.browserDownloadUrl)
                }

            val body = release.body.orEmpty()
            val versionCode = metadata?.versionCode ?: marker(body, "versionCode")?.toIntOrNull()
                ?: return@runCatching null
            val versionName = metadata?.versionName?.takeIf { it.isNotBlank() }
                ?: marker(body, "versionName")
                ?: release.tagName.removePrefix("v")
            val minimumSupportedVersionCode = metadata?.minimumSupportedVersionCode
                ?: marker(body, "minimumSupportedVersionCode")?.toIntOrNull()
                ?: 0
            val releaseUrl = metadata?.releaseUrl
                ?.takeIf(::isSafeHttpsUrl)
                ?: release.htmlUrl.takeIf(::isSafeHttpsUrl)
                ?: return@runCatching null

            UpdateCandidate(
                versionCode = versionCode,
                versionName = versionName,
                minimumSupportedVersionCode = minimumSupportedVersionCode,
                releaseUrl = releaseUrl,
                releaseNotes = body.trim(),
            )
        }.getOrNull()
    }

    private inline fun <reified T> requestJson(url: String): T? {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Nukiyasu-Android-Updater")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val body = response.body.string()
            if (body.isBlank()) return null
            return json.decodeFromString<T>(body)
        }
    }

    private fun marker(body: String, name: String): String? = Regex(
        "(?im)^\\s*nukiyasu[-_]$name\\s*:\\s*(.+?)\\s*$",
    ).find(body)?.groupValues?.getOrNull(1)?.trim()

    private companion object {
        const val repositoryOwner = "arashir93-hue"
        const val repositoryName = "nukiyasu"
        const val metadataAssetName = "nukiyasu-update.json"
    }
}
