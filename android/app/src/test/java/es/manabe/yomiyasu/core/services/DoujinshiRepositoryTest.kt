package es.manabe.yomiyasu.core.services

import org.junit.Assert.assertEquals
import org.junit.Test

class DoujinshiRepositoryTest {
    @Test
    fun `organization requests are split into chunks of one hundred`() {
        val chunks = DoujinshiRepository.organizationChunks((1..205).map { "s$it" })
        assertEquals(listOf(100, 100, 5), chunks.map { it.size })
        assertEquals("s1", chunks.first().first())
        assertEquals("s205", chunks.last().last())
    }
}
