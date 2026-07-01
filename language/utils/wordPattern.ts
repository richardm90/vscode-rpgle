// Shared, vscode-free definition of what characters make up an RPGLE word/identifier.
// Defined by EXCLUSION (a negated character class) rather than an allow-list, so it
// covers letters, digits, the special name characters `_ $ @ # £`, and any
// CCSID-variant glyph (e.g. `¥`, `¤`) a non-37 source might decode to.
//
// This is the single source of truth behind both:
//   - the client's editor `wordPattern` (see buildRpgleWordPattern / config.ts), and
//   - the block-keyword boundary matching used by bracket matching and folding
//     (see buildBlockKeywordRegex in blockParser.ts and the cursor-word lookup in
//     bracketMatcher.ts).
//
// Regex pattern matching a single RPGLE word character. Authored as a regex literal
// (single backslashes) for readability; `.source` is the string form for embedding in
// other regexes — the block-keyword boundary lookarounds and the cursor-word lookup.
// A "word char" is anything NOT in this delimiter set, mirroring the original wordPattern
// in extension/client/src/language/config.ts.
export const RPGLE_WORD_CHAR_PATTERN = /[^\`\~\!\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]/.source;

// Regex pattern matching a whole RPGLE "word" at a cursor position. It starts with a word
// character (so it never matches a lone delimiter) and then allows further word characters
// or hyphens, so hyphenated block keywords (end-proc, dcl-ds, for-each) are captured as a
// single unit while special-character names (£end, W#End) are captured whole. Used by
// bracketMatcher's getWordRangeAtPosition.
export const RPGLE_WORD_WITH_HYPHEN_PATTERN = `${RPGLE_WORD_CHAR_PATTERN}(?:${RPGLE_WORD_CHAR_PATTERN}|-)*`;

// Builds the RPGLE editor word pattern used by VS Code (client-side language config):
// either a decimal-number form, or a run of word characters. Kept here so the editor's
// word definition and the bracket/folding boundary logic share one source.
export function buildRpgleWordPattern(): RegExp {
  return new RegExp(`(-?\\d*\\.\\d\\w*)|(${RPGLE_WORD_CHAR_PATTERN}+)`, "g");
}
