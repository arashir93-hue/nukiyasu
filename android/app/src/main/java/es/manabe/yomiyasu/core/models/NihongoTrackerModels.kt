package es.manabe.yomiyasu.core.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class NihongoTrackerStatus(
    val connected: Boolean = false,
    val keyPrefix: String? = null,
    val linkedSeries: Int = 0,
)

@Serializable
data class NihongoTrackerLink(
    val mode: String = "linked",
    val mediaType: String = "manga",
    val mediaId: String? = null,
    val mediaTitle: String? = null,
)

/** Search result returned by Nukiyasu after it combines local and AniList results. */
@Serializable
data class NihongoTrackerMedia(
    val id: JsonElement? = null,
    @SerialName("_id") val documentId: JsonElement? = null,
    val contentId: JsonElement? = null,
    val mediaId: JsonElement? = null,
    val title: JsonElement? = null,
    val mediaTitle: String? = null,
    val titleNative: String? = null,
    val titleRomaji: String? = null,
    val titleEnglish: String? = null,
    val nativeTitle: String? = null,
    val romajiTitle: String? = null,
    val englishTitle: String? = null,
    val originalTitle: String? = null,
    val name: String? = null,
    val media: NihongoTrackerMedia? = null,
) {
    val resolvedId: String?
        get() = listOf(contentId, mediaId, id, documentId)
            .firstNotNullOfOrNull { it.textValue() }
            ?: media?.resolvedId

    val resolvedTitle: String
        get() = mediaTitle?.takeIf { it.isNotBlank() }
            ?: title.textValue("contentTitleNative", "contentTitleRomaji", "contentTitleEnglish", "native", "romaji", "english", "default")
            ?: media?.resolvedTitle
            ?: listOf(titleNative, titleEnglish, titleRomaji, nativeTitle, englishTitle, romajiTitle, originalTitle, name)
                .firstOrNull { !it.isNullOrBlank() }
            ?: "Sin título"
}

private fun JsonElement?.textValue(vararg objectKeys: String): String? {
    if (this == null) return null
    runCatching { jsonPrimitive.contentOrNull }
        .getOrNull()
        ?.takeIf { it.isNotBlank() }
        ?.let { return it }
    val objectValue = runCatching { jsonObject }.getOrNull() ?: return null
    return objectKeys.asSequence()
        .mapNotNull { key -> runCatching { objectValue[key]?.jsonPrimitive?.contentOrNull }.getOrNull() }
        .firstOrNull { it.isNotBlank() }
}

@Serializable
data class NihongoTrackerBookStatus(
    val connected: Boolean = false,
    val linked: Boolean = false,
    val linkMode: String? = null,
    val trackerTitle: String? = null,
    val completed: Boolean = false,
    val alreadyLogged: Boolean = false,
    val hasPreviousLogs: Boolean = false,
    val logCount: Int = 0,
    val lastLoggedAt: String? = null,
    val volumeNumber: Double = 1.0,
    val volumeSource: String = "position",
    val serieName: String = "",
    val pages: Int? = null,
    val timeSeconds: Int = 0,
    val characters: Int = 0,
)

@Serializable
data class NihongoTrackerLogRequest(
    val volumeNumber: Double? = null,
    val requestId: String,
)

@Serializable
data class NihongoTrackerLogResponse(
    val status: String = "logged",
    val externalLogId: String? = null,
)
