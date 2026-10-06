import {readFileSync} from "node:fs";
import {join} from "node:path";

interface TrieNode {
    children: {[key: string]: TrieNode};
    isEndOfWord: boolean;
    value: string;
}

interface DeinflectionRule {
    input: string;
    output: string;
}

interface DeinflectionRuleFile {
    version: number;
    rules: DeinflectionRule[];
}

class Trie {
    root: TrieNode;

    constructor() {
        this.root = {children: {}, isEndOfWord: false, value: ""};
    }

    insert(word:string, value:string) {
        let node = this.root;
        for (const char of word) {
            if (!node.children[char]) {
                node.children[char] = {children: {}, isEndOfWord: false, value: ""};
            }
            node = node.children[char];
        }
        node.isEndOfWord = true;
        // Deliberately keep the historical "last rule wins" behaviour for
        // duplicate kanaIn values in the ordered shared resource.
        node.value = value;
    }

    search(word:string):string | null {
        let node = this.root;
        for (const char of word) {
            if (!node.children[char]) {
                return null;
            }
            node = node.children[char];
        }
        return node.isEndOfWord ? node.value : null;
    }
}

const ruleFilePath = join(__dirname, "deinflection-rules.json");
const ruleFile = JSON.parse(readFileSync(ruleFilePath, "utf8")) as DeinflectionRuleFile;
if (ruleFile.version !== 1 || !Array.isArray(ruleFile.rules)) {
    throw new Error(`Unsupported deinflection rule resource: ${ruleFilePath}`);
}

const deinflectRules = new Trie();
for (const rule of ruleFile.rules) {
    deinflectRules.insert(rule.input, rule.output);
}

export default deinflectRules;
