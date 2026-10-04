package es.manabe.yomiyasu.features.updates

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import es.manabe.yomiyasu.BuildConfig
import es.manabe.yomiyasu.core.updates.GitHubReleaseSource
import es.manabe.yomiyasu.core.updates.UpdateInfo
import es.manabe.yomiyasu.core.updates.UpdateNoticeStore
import es.manabe.yomiyasu.core.updates.detectUpdate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val source: GitHubReleaseSource,
    private val noticeStore: UpdateNoticeStore,
) : ViewModel() {
    sealed interface State {
        data object Idle : State
        data object Checking : State
        data class Available(val update: UpdateInfo) : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        checkForUpdate()
    }

    private fun checkForUpdate() {
        viewModelScope.launch {
            _state.value = State.Checking
            val update = runCatching {
                source.fetchLatest()?.let {
                    detectUpdate(
                        installedVersionCode = BuildConfig.VERSION_CODE,
                        installedVersionName = BuildConfig.VERSION_NAME,
                        candidate = it,
                    )
                }
            }.getOrNull()

            if (update != null && !noticeStore.isSnoozed(update)) {
                _state.value = State.Available(update)
            } else {
                _state.value = State.Idle
            }
        }
    }

    fun snooze(update: UpdateInfo) {
        viewModelScope.launch {
            noticeStore.snooze(update)
            _state.value = State.Idle
        }
    }

    fun updateOpened(update: UpdateInfo) {
        if (!update.isMandatory) {
            _state.value = State.Idle
        }
    }
}
