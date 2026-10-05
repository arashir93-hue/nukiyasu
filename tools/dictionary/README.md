# Generador del diccionario offline

Este directorio genera el artefacto SQLite que utilizará Android en una fase posterior.

## Requisitos

Se necesita Node.js 22.5 o posterior, porque el generador utiliza `node:sqlite` y no añade dependencias pesadas al proyecto.

## Generar

Desde la raíz del repositorio:

```powershell
node .\tools\dictionary\generate.mjs
```

La fuente predeterminada es:

```text
dicts/jmdict-eng-3.5.0.json
```

La versión y fecha se leen de la metadata interna de JMDict. El nombre histórico `3.5.0` del archivo no se utiliza como versión.

Se pueden proporcionar datos auxiliares cuando existan:

```powershell
node .\tools\dictionary\generate.mjs `
  --frequency .\dicts\frequency.json `
  --pitch .\dicts\pitch.json
```

Los resultados se escriben en `tools/dictionary/dist/`:

```text
nukiyasu-dictionary.sqlite
nukiyasu-dictionary.sqlite.gz
nukiyasu-dictionary.json
```

Los artefactos están ignorados por Git y no deben subirse como código fuente.

## Validar

Después de generar:

```powershell
node .\tools\dictionary\validate.mjs
node --test .\tools\dictionary\test\dictionary.test.mjs
```

La validación comprueba `PRAGMA quick_check`, recuentos, relaciones huérfanas, checksum, descompresión gzip, búsquedas por kanji/kana y `EXPLAIN QUERY PLAN`.

## Esquema

- `metadata`: versión del esquema y del diccionario.
- `entries`: identificadores JMDict.
- `kanji`: formas escritas y orden original.
- `readings`: lecturas y restricciones.
- `senses`: información gramatical y restricciones estructuradas.
- `glosses`: traducciones y orden original.
- `lookup`: índice de prefijos para `kanjiBeginning` y `readingBeginning`.
- `frequency` y `pitch`: tablas preparadas para los datos auxiliares opcionales.

Los campos estructurados pequeños se almacenan como JSON por columna; no se guarda una entrada JMDict completa serializada en una única columna.

## Actualizar JMDict

Sustituye el JSON de `dicts/`, comprueba que contiene `version`, `dictDate` y `words`, y vuelve a ejecutar el generador y las validaciones. La metadata del manifiesto debe proceder siempre del JSON interno.

## Componentes que todavía no incluye

Este generador no implementa:

- deconjugación;
- `Trie.ts` en Kotlin;
- análisis de frases o tokenización V2;
- `DictionaryRepository` Android;
- descarga o instalación dentro de Android;
- sincronización de palabras guardadas.

El artefacto solo prepara los datos y las búsquedas necesarias para una fase Android posterior.

