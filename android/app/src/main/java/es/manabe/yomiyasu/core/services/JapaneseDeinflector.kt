package es.manabe.yomiyasu.core.services

import android.content.res.AssetManager
import es.manabe.yomiyasu.core.networking.YomiyasuJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

data class JapaneseDeinflectionRule(
    val input: String,
    val output: String,
)

/**
 * The same single-pass longest-match algorithm used by back/src/utils/Trie.ts.
 * The ordered rule list is loaded once; duplicate inputs intentionally keep the
 * last value, matching Trie.insert().
 */
class JapaneseDeinflector private constructor(
    rules: List<JapaneseDeinflectionRule>,
) {
    private class Node {
        val children = HashMap<Char, Node>()
        var isEndOfWord = false
        var value = ""
    }

    private val root = Node()

    init {
        rules.forEach { rule ->
            var node = root
            rule.input.forEach { char ->
                node = node.children.getOrPut(char) { Node() }
            }
            node.isEndOfWord = true
            node.value = rule.output
        }
    }

    fun convert(text: String): String {
        var result = ""
        var index = 0

        while (index < text.length) {
            var node = root
            var cursor = index
            var replacement: String? = null
            var replacementEnd = index

            while (cursor < text.length) {
                node = node.children[text[cursor]] ?: break
                if (node.isEndOfWord) {
                    replacement = node.value
                    replacementEnd = cursor + 1
                }
                cursor++
            }

            if (replacement != null) {
                result += replacement
                index = replacementEnd
            } else {
                result += text[index]
                index++
            }
        }

        return result.replace("るる", "る")
    }

    companion object {
        const val ASSET_PATH = "dictionary/deinflection-rules.json"
        private const val RESOURCE_VERSION = 1

        fun fromAssets(assetManager: AssetManager): JapaneseDeinflector {
            val json = assetManager.open(ASSET_PATH).bufferedReader(Charsets.UTF_8).use { it.readText() }
            return fromJson(json)
        }

        fun fromJson(json: String, parser: Json = YomiyasuJson): JapaneseDeinflector {
            val resource = parser.decodeFromString(DeinflectionRuleResource.serializer(), json)
            require(resource.version == RESOURCE_VERSION) {
                "Unsupported deinflection rule resource version: ${resource.version}"
            }
            return JapaneseDeinflector(
                resource.rules.map { JapaneseDeinflectionRule(it.input, it.output) },
            )
        }

        fun fromRules(rules: List<JapaneseDeinflectionRule>): JapaneseDeinflector =
            JapaneseDeinflector(rules)

        fun empty(): JapaneseDeinflector = JapaneseDeinflector(emptyList())
    }
}

@Serializable
private data class DeinflectionRuleResource(
    val version: Int,
    val rules: List<DeinflectionRuleJson>,
)

@Serializable
private data class DeinflectionRuleJson(
    val input: String,
    val output: String,
)
