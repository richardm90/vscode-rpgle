// Tests for the shared `isDclDsLikeDsOrLikeRec` predicate in language/utils/dclDs.ts.
// This helper backs BOTH the client bracket matcher (extension/client/src/language/
// bracketMatcher.ts) and the server folding provider (extension/server/src/providers/
// foldingRange.ts): both use it to decide whether a dcl-ds is a self-contained
// likeds()/likerec() declaration that needs no end-ds. Changes here affect both features.
import { describe, it, expect } from 'vitest';
import { isDclDsLikeDsOrLikeRec } from '../../language/utils/dclDs';

// Helper: locate the offset of the dcl-ds keyword the way the providers do (the
// offset of an opening keyword match), then ask whether it is a self-contained
// likeds()/likerec() declaration that does NOT require end-ds.
function check(code: string, search = 'dcl-ds'): boolean {
  const offset = code.toLowerCase().indexOf(search.toLowerCase());
  expect(offset).toBeGreaterThanOrEqual(0);
  return isDclDsLikeDsOrLikeRec(code, offset);
}

describe('isDclDsLikeDsOrLikeRec', () => {
  it('detects likeds() on the same line', () => {
    expect(check(`dcl-ds myData likeds(MyDs);`)).toBe(true);
  });

  it('detects likeds() on a continuation line', () => {
    const code = `dcl-ds myData\n  likeds(MyDs);`;
    expect(check(code)).toBe(true);
  });

  it('detects likerec() on a continuation line', () => {
    const code = `dcl-ds myData\n  likerec(MyRecord);`;
    expect(check(code)).toBe(true);
  });

  it('detects likeds() when the statement spans several lines with extra clauses', () => {
    const code = `dcl-ds myData\n  likeds(MyDs)\n  inz(*likeds);`;
    expect(check(code)).toBe(true);
  });

  it('handles whitespace between keyword and paren across lines', () => {
    const code = `dcl-ds myData\n  likeds (MyDs);`;
    expect(check(code)).toBe(true);
  });

  it('returns false for a plain multi-line block dcl-ds', () => {
    const code = `dcl-ds myStruct;\n  field1 int(10);\n  field2 char(50);\nend-ds;`;
    expect(check(code)).toBe(false);
  });

  it('returns false for an extname() data structure (block opener)', () => {
    const code = `dcl-ds data extname('QIWS/QCUSTCDT') qualified;\nend-ds;`;
    expect(check(code)).toBe(false);
  });

  it('does not false-positive on likeds() inside a comment', () => {
    const code = `dcl-ds shouldBeBlock;  // likeds(fake) in comment\n  field1 int(10);\nend-ds;`;
    expect(check(code)).toBe(false);
  });

  it('stops scanning at the statement terminator (next statement ignored)', () => {
    // The likeds belongs to a different, later statement; the dcl-ds itself is a block.
    const code = `dcl-ds first;\n  field1 int(10);\nend-ds;\ndcl-ds second likeds(MyDs);`;
    expect(check(code)).toBe(false);
  });

  it('detects likeds() when the dcl-ds line carries a trailing comment', () => {
    const code = `dcl-ds myData  // a comment\n  likeds(MyDs);`;
    expect(check(code)).toBe(true);
  });

  it('does not false-positive on a commented likeds() on a continuation line', () => {
    // A real block DS whose continuation line merely mentions likeds in a comment.
    const code = `dcl-ds myStruct\n  // likeds(fake)\n  qualified;\n  field1 int(10);\nend-ds;`;
    expect(check(code)).toBe(false);
  });
});
