package es.manabe.yomiyasu.core.updates

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateModelsTest {
    private val candidate = UpdateCandidate(
        versionCode = 5,
        versionName = "0.4.0",
        releaseUrl = "https://github.com/arashir93-hue/nukiyasu/releases/tag/latest",
    )

    @Test
    fun `equal and older versions are ignored`() {
        assertNull(detectUpdate(5, "0.4.0", candidate))
        assertNull(detectUpdate(6, "0.5.0", candidate))
    }

    @Test
    fun `newer version is available`() {
        val update = detectUpdate(4, "0.3.0", candidate)

        assertTrue(update != null)
        assertFalse(update!!.isMandatory)
    }

    @Test
    fun `minimum supported version makes an otherwise equal release mandatory`() {
        val update = detectUpdate(
            installedVersionCode = 4,
            installedVersionName = "0.3.0",
            candidate = candidate.copy(versionCode = 4, minimumSupportedVersionCode = 5),
        )

        assertTrue(update?.isMandatory == true)
    }

    @Test
    fun `snooze suppresses only the same non-mandatory version before expiry`() {
        val update = detectUpdate(4, "0.3.0", candidate)!!

        assertTrue(shouldSuppressUpdate(update, 5, 2_000L, 1_000L))
        assertFalse(shouldSuppressUpdate(update, 6, 2_000L, 1_000L))
        assertFalse(shouldSuppressUpdate(update, 5, 1_000L, 1_000L))
        assertFalse(
            shouldSuppressUpdate(
                update.copy(minimumSupportedVersionCode = 5),
                5,
                2_000L,
                1_000L,
            ),
        )
    }

    @Test
    fun `unsafe release urls are rejected`() {
        assertNull(detectUpdate(4, "0.3.0", candidate.copy(releaseUrl = "http://example.com/update")))
        assertNull(detectUpdate(4, "0.3.0", candidate.copy(releaseUrl = "javascript:alert(1)")))
    }
}
