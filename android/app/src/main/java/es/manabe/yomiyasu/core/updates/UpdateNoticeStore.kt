package es.manabe.yomiyasu.core.updates

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UpdateNoticeStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private object Keys {
        val versionCode = intPreferencesKey("update_snooze_version_code")
        val until = longPreferencesKey("update_snooze_until")
    }

    suspend fun isSnoozed(
        update: UpdateInfo,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): Boolean {
        val preferences = dataStore.data.first()
        return shouldSuppressUpdate(
            update = update,
            snoozedVersionCode = preferences[Keys.versionCode],
            snoozedUntilEpochMs = preferences[Keys.until],
            nowEpochMs = nowEpochMs,
        )
    }

    suspend fun snooze(
        update: UpdateInfo,
        nowEpochMs: Long = System.currentTimeMillis(),
    ) {
        dataStore.edit { preferences ->
            preferences[Keys.versionCode] = update.availableVersionCode
            preferences[Keys.until] = nowEpochMs + snoozeDurationMs
        }
    }

    private companion object {
        const val snoozeDurationMs = 24L * 60L * 60L * 1000L
    }
}
