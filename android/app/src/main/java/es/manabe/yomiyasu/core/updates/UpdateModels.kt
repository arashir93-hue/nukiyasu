package es.manabe.yomiyasu.core.updates

import java.net.URI

data class UpdateCandidate(
    val versionCode: Int,
    val versionName: String,
    val minimumSupportedVersionCode: Int = 0,
    val releaseUrl: String,
    val releaseNotes: String = "",
)

data class UpdateInfo(
    val installedVersionCode: Int,
    val installedVersionName: String,
    val availableVersionCode: Int,
    val availableVersionName: String,
    val minimumSupportedVersionCode: Int,
    val releaseUrl: String,
    val releaseNotes: String,
) {
    val isMandatory: Boolean
        get() = installedVersionCode < minimumSupportedVersionCode
}

/**
 * Determines whether the candidate should be shown. Version codes are the
 * only values used for ordering; version names are presentation data.
 */
fun detectUpdate(
    installedVersionCode: Int,
    installedVersionName: String,
    candidate: UpdateCandidate?,
): UpdateInfo? {
    candidate ?: return null
    if (candidate.versionCode <= 0 || candidate.versionName.isBlank()) return null
    if (!isSafeHttpsUrl(candidate.releaseUrl)) return null

    val mandatory = installedVersionCode < candidate.minimumSupportedVersionCode
    if (candidate.versionCode <= installedVersionCode && !mandatory) return null

    return UpdateInfo(
        installedVersionCode = installedVersionCode,
        installedVersionName = installedVersionName,
        availableVersionCode = candidate.versionCode,
        availableVersionName = candidate.versionName,
        minimumSupportedVersionCode = candidate.minimumSupportedVersionCode,
        releaseUrl = candidate.releaseUrl,
        releaseNotes = candidate.releaseNotes,
    )
}

internal fun isSafeHttpsUrl(value: String): Boolean = runCatching {
    val uri = URI(value)
    uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
}.getOrDefault(false)

internal fun shouldSuppressUpdate(
    update: UpdateInfo,
    snoozedVersionCode: Int?,
    snoozedUntilEpochMs: Long?,
    nowEpochMs: Long,
): Boolean = !update.isMandatory &&
    snoozedVersionCode == update.availableVersionCode &&
    (snoozedUntilEpochMs ?: 0L) > nowEpochMs
