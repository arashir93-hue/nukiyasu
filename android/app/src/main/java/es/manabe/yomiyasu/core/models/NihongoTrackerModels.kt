package es.manabe.yomiyasu.core.models

import kotlinx.serialization.Serializable

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
