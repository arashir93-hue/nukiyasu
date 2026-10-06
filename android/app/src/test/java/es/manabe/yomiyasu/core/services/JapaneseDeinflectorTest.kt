package es.manabe.yomiyasu.core.services

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class JapaneseDeinflectorTest {

    @Test
    fun `shared rules reproduce the current Trie oracle cases`() {
        val deinflector = JapaneseDeinflector.fromJson(sharedRulesJson())

        val expected = mapOf(
            "食べました" to "食べる",
            "食べない" to "食べる",
            "行った" to "行く",
            "飲んでいる" to "飲むうる",
            "食べさせられました" to "食べるいせるられる",
            "見ました" to "見る",
            "しない" to "する",
            "した" to "する",
            "来た" to "来る",
            "食べた" to "食べる",
            "飲んだ" to "飲む",
            "読んで" to "読む",
            "食べます" to "食べる",
            "食べられる" to "食べる",
            "食べさせる" to "食べるする",
            "高かった" to "高い",
            "行きます" to "行くる",
            "来ました" to "来る",
            "飲みませんでした" to "飲む",
            "食べましょう" to "食べる",
        )

        expected.forEach { (input, output) ->
            assertEquals(input, output, deinflector.convert(input))
        }
    }

    @Test
    fun `ordered duplicate rules keep the last value and longest match wins`() {
        val deinflector = JapaneseDeinflector.fromRules(
            listOf(
                JapaneseDeinflectionRule("て", "short"),
                JapaneseDeinflectionRule("ている", "long"),
                JapaneseDeinflectionRule("っちゃう", "う"),
                JapaneseDeinflectionRule("っちゃう", "る"),
            ),
        )

        assertEquals("long", deinflector.convert("ている"))
        assertEquals("る", deinflector.convert("っちゃう"))
        assertEquals("そのまま", deinflector.convert("そのまま"))
    }

    @Test
    fun `final historical rur u correction is preserved`() {
        val deinflector = JapaneseDeinflector.fromRules(
            listOf(JapaneseDeinflectionRule("る", "るる")),
        )

        assertEquals("る", deinflector.convert("る"))
    }

    private fun sharedRulesJson(): String {
        val candidates = listOf(
            File("../back/src/utils/deinflection-rules.json"),
            File("../../back/src/utils/deinflection-rules.json"),
        )
        val file = candidates.firstOrNull { it.isFile }
            ?: error("Shared deinflection rules not found from ${System.getProperty("user.dir")}")
        val text = file.readText()
        assertTrue("shared resource must contain all backend rules", Regex("\"input\"").findAll(text).count() >= 568)
        return text
    }
}
