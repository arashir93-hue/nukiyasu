package es.manabe.yomiyasu.core.services

import kotlinx.serialization.Serializable

@Serializable
data class DictionaryManifest(
    val schemaVersion: Int = 0,
    val dictionaryVersion: String = "",
    val dictionaryDate: String = "",
    val generatorVersion: String = "",
    val sourceFile: String = "",
    val entryCount: Long = 0,
    val kanjiCount: Long = 0,
    val readingCount: Long = 0,
    val senseCount: Long = 0,
    val glossCount: Long = 0,
    val sqliteSize: Long = 0,
    val compressedSize: Long = 0,
    val sha256: String = "",
    val asset: String = "",
    val generationTimeMs: Long? = null,
    val features: DictionaryFeatures = DictionaryFeatures(),
)

@Serializable
data class DictionaryFeatures(
    val frequency: Boolean = false,
    val pitch: Boolean = false,
)

data class RemoteDictionaryPackage(
    val manifest: DictionaryManifest,
    val assetUrl: String,
)

enum class OfflineDictionaryManagerStatus {
    NOT_INSTALLED,
    CHECKING,
    AVAILABLE,
    DOWNLOADING,
    VERIFYING,
    INSTALLING,
    INSTALLED,
    UPDATE_AVAILABLE,
    CANCELLED,
    ERROR,
}

data class OfflineDictionaryState(
    val status: OfflineDictionaryManagerStatus,
    val installedManifest: DictionaryManifest? = null,
    val remoteManifest: DictionaryManifest? = null,
    val bytesDownloaded: Long = 0,
    val bytesTotal: Long = 0,
    val error: String? = null,
)
