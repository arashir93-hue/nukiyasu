package es.manabe.yomiyasu.core.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import es.manabe.yomiyasu.core.networking.YomiyasuJson
import es.manabe.yomiyasu.core.services.AndroidDictionaryFileValidator
import es.manabe.yomiyasu.core.services.DictionaryRemoteSource
import es.manabe.yomiyasu.core.services.GitHubDictionarySource
import es.manabe.yomiyasu.core.services.OfflineDictionaryManager
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DictionaryModule {
    @Provides
    @Singleton
    fun provideDictionaryRemoteSource(
        client: OkHttpClient,
        json: Json,
        @Named("GitHubApiBaseUrl") apiBaseUrl: String,
    ): DictionaryRemoteSource = GitHubDictionarySource(client, json, apiBaseUrl)

    @Provides
    @Singleton
    fun provideOfflineDictionaryManager(
        @ApplicationContext context: Context,
        remote: DictionaryRemoteSource,
        json: Json,
    ): OfflineDictionaryManager = OfflineDictionaryManager(
        context = context,
        remote = remote,
        validator = AndroidDictionaryFileValidator(),
        json = json,
    )
}
