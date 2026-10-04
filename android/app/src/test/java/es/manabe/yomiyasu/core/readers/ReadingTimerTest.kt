package es.manabe.yomiyasu.core.readers

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadingTimerTest {

    private var current = 1_000_000L

    private fun timer() = ReadingTimer(
        scope = CoroutineScope(Dispatchers.Unconfined),
        now = { current },
    )

    @Test
    fun `idle timeout pauses after inactivity and activity resumes`() {
        val timer = timer()
        timer.idleTimeoutMinutes = 5

        timer.start()
        timer.tick()
        assertTrue(timer.isRunning.value)

        current += 4 * 60_000
        timer.tick()
        assertTrue(timer.isRunning.value)

        current += 60_000
        timer.tick()
        assertFalse(timer.isRunning.value)

        timer.notifyActivity()
        timer.tick()
        assertTrue(timer.isRunning.value)

        current += 4 * 60_000
        timer.tick()
        assertTrue(timer.isRunning.value)

        current += 60_000
        timer.tick()
        assertFalse(timer.isRunning.value)
    }

    @Test
    fun `manual pause does not auto resume`() {
        val timer = timer()
        timer.idleTimeoutMinutes = 5

        timer.start()
        timer.tick()
        timer.pause()

        assertFalse(timer.isRunning.value)

        current += 60 * 60_000
        timer.tick()
        assertFalse(timer.isRunning.value)

        timer.notifyActivity()
        assertFalse(timer.isRunning.value)
    }

    @Test
    fun `resuming manually restarts idle clock`() {
        val timer = timer()
        timer.idleTimeoutMinutes = 5

        timer.start()
        timer.tick()

        current += 5 * 60_000
        timer.tick()
        assertFalse(timer.isRunning.value)

        timer.start()
        timer.tick()

        current += 4 * 60_000
        timer.tick()
        assertTrue(timer.isRunning.value)

        current += 60_000
        timer.tick()
        assertFalse(timer.isRunning.value)
    }

    @Test
    fun `idle timeout zero disables auto pause`() {
        val timer = timer()
        timer.idleTimeoutMinutes = 0

        timer.start()
        timer.tick()

        current += 60 * 60_000
        timer.tick()
        assertTrue(timer.isRunning.value)
    }

    @Test
    fun `reloading progress while running keeps the timer ticking`() {
        val timer = timer()

        timer.start()
        current += 2_000
        timer.resume(fromSeconds = 30)

        assertTrue(timer.isRunning.value)

        current += 1_000
        timer.tick()

        assertTrue(timer.isRunning.value)
        assertTrue(timer.seconds.value >= 31)
    }
}
