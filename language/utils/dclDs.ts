/**
 * Returns true when a `dcl-ds` declaration uses `likeds()` or `likerec()`, which makes it a
 * self-contained, single-statement declaration that does NOT require a matching `end-ds`.
 *
 * A dcl-ds statement can span multiple lines until its terminating `;`, and the
 * likeds()/likerec() keyword is frequently written on a continuation line, so this scans
 * the whole statement rather than just the line containing the `dcl-ds` keyword.
 *
 * @param text   The full document text.
 * @param offset The offset of the `dcl-ds` keyword within `text`.
 */
export function isDclDsLikeDsOrLikeRec(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf('\n', offset) + 1;

  let statement = '';
  let pos = lineStart;
  while (pos < text.length) {
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = text.length;

    let line = text.substring(pos, lineEnd);

    // Strip line comments before scanning.
    const comment = line.indexOf('//');
    if (comment !== -1) line = line.substring(0, comment);

    // Stop at the statement terminator.
    const semicolon = line.indexOf(';');
    if (semicolon !== -1) {
      statement += line.substring(0, semicolon);
      break;
    }

    statement += line + '\n';
    pos = lineEnd + 1;
  }

  // `\s*` spans newlines, so a keyword/paren split across lines still matches.
  const lowered = statement.toLowerCase();
  return /likeds\s*\(/.test(lowered) || /likerec\s*\(/.test(lowered);
}
