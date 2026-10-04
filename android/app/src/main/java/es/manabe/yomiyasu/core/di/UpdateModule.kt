package es.manabe.yomiyasu.core.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object UpdateModule {
    @Provides
    @Singleton
    @Named("GitHubApiBaseUrl")
    fun provideGitHubApiBaseUrl(): String = "https://api.github.com"
}
