package es.manabe.yomiyasu.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainShellNavigationTest {

    @Test
    fun `reader does not reserve permanent rail space on expanded layouts`() {
        assertFalse(shouldShowPermanentNavigationRail(expanded = true, immersive = true))
    }

    @Test
    fun `normal expanded destinations keep the permanent rail`() {
        assertTrue(shouldShowPermanentNavigationRail(expanded = true, immersive = false))
    }

    @Test
    fun `compact layouts never reserve a permanent rail`() {
        assertFalse(shouldShowPermanentNavigationRail(expanded = false, immersive = false))
    }
}
