import {Injectable, Logger} from "@nestjs/common";
import {AbstractIterator, AbstractLevelDOWN} from "abstract-leveldown";
import {Word, kanjiBeginning, readingBeginning, setup as setupJmdict} from "jmdict-simplified-node";
import levelup from "levelup";
import {join} from "path";
import {WordWithDisplay} from "./interfaces/word";
import deinflectRules from "../utils/Trie";
import {promises as fs} from "fs";
import {JapaneseParser} from "nlcst-parse-japanese";

interface FreqWord extends Word {
    frequency?:string;
    pitches?:{position:number}[]
}

export interface FreqDisplay {
    surface?:string,
    words:FreqWord[]
}

@Injectable()
export class DictionaryService {
    private readonly dbPromise: Promise<levelup.LevelUp<AbstractLevelDOWN<unknown, unknown>, AbstractIterator<unknown, unknown>>>;
  private readonly logger = new Logger(DictionaryService.name);
  private db: levelup.LevelUp<AbstractLevelDOWN<unknown, unknown>, AbstractIterator<unknown, unknown>> | null = null;
  private freqDict:Record<string, {reading:string, freq:string}[]> = {};
  private pitchDict:Record<string, {reading:string, pitches:{position:number}[]}> = {};

  constructor() {
      this.dbPromise = this.setupDB();
  }

  returnWords(words:WordWithDisplay[]) {
      const newWords:FreqDisplay[] = [];

      words.forEach((word) => {
          const newWord:FreqDisplay = word;
          const newDefs:FreqWord[] = word.words;
          word.words.forEach((def: FreqWord) => {
              const name = def.kanji.length > 0 ? def.kanji[0].text : def.kana[0].text;
              // Add frequency
              const frequency = this.freqDict[name];
              if (frequency) {
                  if (frequency.length === 1) {
                      def.frequency = frequency[0].freq;
                  } else if (frequency.length > 1) {
                      const foundFreq = frequency.find((x) => x.reading === def.kana[0].text);
                      if (foundFreq) {
                          def.frequency = foundFreq.freq;
                      }
                  }
              }

              // Add pitch
              const pitches = this.pitchDict[name];
              if (pitches) {
                  def.pitches = pitches.pitches;
              }

              newDefs.push(def);
          });
          newWord.words = newDefs.filter((v, i, a)=>a.findIndex(x=>(x.id === v.id)) === i);

          //   Sort by frequency
          newWord.words.sort((a, b)=>{
              if (a.frequency && b.frequency) {
                  return parseInt(a.frequency) - parseInt(b.frequency);
              }
              return 0;
          });
          newWords.push(newWord);
      });
      return newWords;
  }

  private async setupDB(): Promise<levelup.LevelUp<AbstractLevelDOWN<unknown, unknown>, AbstractIterator<unknown, unknown>>> {
      const dictFolder = join(process.cwd(), "..", "dicts");

      this.freqDict = await this.readOptionalDictionary<Record<string, {reading:string, freq:string}[]>>(join(dictFolder, "frequency.json"));
      this.pitchDict = await this.readOptionalDictionary<Record<string, {reading:string, pitches:{position:number}[]}>>(join(dictFolder, "pitch.json"));

      const jmdictPromise = setupJmdict(join(dictFolder, "jmdict"), join(dictFolder, "jmdict-eng-3.5.0.json"));
      const {db} = await jmdictPromise;
      this.logger.log("Diccionario JMDict cargado");
      return db;
  }

  private async readOptionalDictionary<T extends Record<string, unknown>>(path:string):Promise<T> {
      try {
          return JSON.parse(await fs.readFile(path, "utf-8")) as T;
      } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              this.logger.warn(`Diccionario auxiliar no encontrado: ${path}`);
              return {} as T;
          }
          throw error;
      }
  }

  async getDb(): Promise<levelup.LevelUp<AbstractLevelDOWN<unknown, unknown>, AbstractIterator<unknown, unknown>>> {
      if (!this.db) {
          // La creación inicial del índice puede tardar. Las consultas esperan
          // la misma promesa en vez de fallar mientras el servidor arranca.
          this.db = await this.dbPromise;
      }
      return this.db;
  }
  
  async getWordMeaning(word:string):Promise<WordWithDisplay | null> {
      const db = await this.getDb();

      const wholeResult:WordWithDisplay = {display:word, words:[]};

      wholeResult.words = await readingBeginning(db, word, 3);

      if (wholeResult.words.length === 0) {
          wholeResult.words = await kanjiBeginning(db, word, 3);
      }
    
      return wholeResult;
  }

  convertKana(text:string) {
      let result = "";
      let i = 0;
      while (i < text.length) {
          let node = deinflectRules.root;
          let j = i;
          let replacement = null;
  
          while (j < text.length && node.children[text[j]]) {
              node = node.children[text[j]];
              if (node.isEndOfWord) {
                  replacement = node.value;
                  i = j + 1;
              }
              j++;
          }
  
          if (replacement) {
              result += replacement;
          } else {
              result += text[i];
              i++;
          }
      }
      return result.replaceAll("るる", "る");
  }

  async searchBySelection(w:string) {
      const japaneseParser = new JapaneseParser();

      await japaneseParser.ready();

      const result = japaneseParser.parse(w);

      const words:WordWithDisplay[] = [];

      const paragraph = result.children[0];

      for (const sentence of paragraph.children) {
          for (const word of sentence.children) {
              if (word.type === "WordNode") {
                  let text = word.children[0];
                  if (["動詞", "形容詞"].includes(text.data.pos)) {
                      text = text.data.basic_form;
                  } else {
                      text = text.value;
                  }
                  const def = await this.getWordMeaning(text);
    
                  if (def && def?.words.length > 0) {
                      words.push({display:word.children[0].value, words:def.words});
                  } else {
                      words.push({display:word.children[0].value, words:[]});
                  }
              }
          }
      }

      return this.returnWords(words);
  }

  async searchByWord(queryWord:string) {
      const regex = /[^\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

      let word = queryWord.replace(regex, "").trim();

      if (word.length > 10) {
          word = queryWord.substring(0, 15);
      }

      let auxWord = word;
      for (let index = word.length; index >= 0; index--) {
          const def = await this.getWordMeaning(auxWord);

          if ( def && def?.words.length > 0 && def.words.some(x=>{
              if (x.kana.some(y=>y.text === auxWord)) return true;
              if (x.kanji.some(y=>y.text === auxWord)) return true;
              return false;
          })) {
              return this.returnWords([def]);
          }

          const parsed = this.convertKana(auxWord);
          const parsedDef = await this.getWordMeaning(parsed);

          if ( parsedDef && parsedDef?.words.length > 0) {
              return this.returnWords([parsedDef]);
          }

          auxWord = word.substring(0, index); 
      }

      const parsedWord = this.convertKana(word);

      auxWord = parsedWord;
      for (let index = parsedWord.length; index >= 0; index--) {
          const def = await this.getWordMeaning(auxWord);

          if ( def && def?.words.length > 0) {
              return this.returnWords([def]);
          }
          auxWord = parsedWord.substring(0, index); 
      }

      return [];
  }
}
