import { describe, it, expect } from 'vitest';
import { findAllBlockMatches, RPGLE_BLOCK_PAIRS } from '../../language/utils/blockParser';
import { isInCommentOrString, isInSqlBlock } from '../../language/utils/sqlDetection';

describe('blockParser', () => {
  describe('RPGLE_BLOCK_PAIRS', () => {
    it('should contain IF block with middle keywords', () => {
      const ifPair = RPGLE_BLOCK_PAIRS.find(p => p.open.includes('if'));
      expect(ifPair).to.exist;
      expect(ifPair?.middle).to.include('else');
      expect(ifPair?.middle).to.include('elseif');
      expect(ifPair?.close).to.include('endif');
      expect(ifPair?.close).to.include('end');
    });

    it('should contain SELECT block with WHEN keywords', () => {
      const selectPair = RPGLE_BLOCK_PAIRS.find(p => p.open.includes('select'));
      expect(selectPair).to.exist;
      expect(selectPair?.middle).to.include('when');
      expect(selectPair?.middle).to.include('other');
      expect(selectPair?.close).to.include('endsl');
    });

    it('should contain MONITOR block with ON-ERROR', () => {
      const monitorPair = RPGLE_BLOCK_PAIRS.find(p => p.open.includes('monitor'));
      expect(monitorPair).to.exist;
      expect(monitorPair?.middle).to.include('on-error');
      expect(monitorPair?.close).to.include('endmon');
    });
  });

  describe('findAllBlockMatches', () => {
    it('should find simple IF block', () => {
      const code = `if x > 0;
  y = 1;
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('endif');
    });

    it('should find nested blocks', () => {
      const code = `if x > 0;
  dow y < 10;
    y += 1;
  enddo;
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(4);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('dow');
      expect(matches[2].word).to.equal('enddo');
      expect(matches[3].word).to.equal('endif');
    });

    it('should skip keywords in comments', () => {
      const code = `if x > 0; // if this is true
  y = 1;
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('endif');
    });

    it('should skip keywords in strings', () => {
      const code = `if x > 0;
  msg = 'if endif';
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('endif');
    });

    it('should skip SELECT in SQL blocks', () => {
      const code = `exec sql
  select * from table;

if x > 0;
  y = 1;
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('endif');
    });

    it('should find SELECT outside SQL blocks', () => {
      const code = `select;
  when x = 1;
    y = 1;
  other;
    y = 0;
endsl;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('select');
      expect(matches[1].word).to.equal('endsl');
    });

    it('should not treat ENDIF and ENDSR after fixed-format SQL as SQL content', () => {
      const code = `00001C/EXEC SQL
00002C+ Set Option COMMIT = *NONE
00003C/END-EXEC

00004CSR   ELAB          BEGSR
00005C                   IF        IDARIF <> ''
00006C                   ENDIF
00007C                   ENDSR`;

      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      const words = matches.map(match => match.word);

      expect(words).to.include('begsr');
      expect(words).to.include('if');
      expect(words).to.include('endif');
      expect(words).to.include('endsr');
    });

    it('should find FOR-EACH blocks', () => {
      const code = `for-each item in list;
  process(item);
endfor;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches.length).toBe(2);
      expect(matches[0].word).toBe('for-each');
      expect(matches[1].word).toBe('endfor');
    });

    it('should find DCL-PROC blocks', () => {
      const code = `dcl-proc myProc;
  dcl-pi *n;
  end-pi;
  return;
end-proc;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches.length).toBe(4);
      expect(matches[0].word).toBe('dcl-proc');
      expect(matches[1].word).toBe('dcl-pi');
      expect(matches[2].word).toBe('end-pi');
      expect(matches[3].word).toBe('end-proc');
    });

    it('should handle END keyword', () => {
      const code = `if x > 0;
  y = 1;
end;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(2);
      expect(matches[0].word).to.equal('if');
      expect(matches[1].word).to.equal('end');
    });

    it('should find all IF variants', () => {
      const code = `ifeq x y;
endif;
ifne a b;
endif;
ifgt c d;
endif;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(6);
      expect(matches[0].word).to.equal('ifeq');
      expect(matches[2].word).to.equal('ifne');
      expect(matches[4].word).to.equal('ifgt');
    });

    // Regression: identifiers that embed a block keyword next to a special character
    // (£ # $ @) must NOT be matched as block keywords. JS \b treats £/# as word
    // boundaries, which previously caused 'end' inside £end / W#End to match falsely.
    it('should NOT match END inside identifiers with special characters', () => {
      const code = `dcl-proc p;
  dcl-s bend ind inz(*off);
  dcl-s end2 ind inz(*off);
  dcl-s £end ind inz(*off);
  dcl-s W#End ind inz(*off);
  dcl-ds data qualified;
    dcl-subf £end ind;
    dcl-subf W#End ind;
  end-ds;
end-proc;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      // Only the real block keywords: dcl-proc, dcl-ds, end-ds, end-proc.
      expect(matches.map(m => m.word)).toEqual(['dcl-proc', 'dcl-ds', 'end-ds', 'end-proc']);
    });

    it('should still match standalone END keywords', () => {
      const code = `if x > 0;
  £end = *on;
end;`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      // £end (assignment) is skipped; the bare 'end' closer is matched.
      expect(matches.map(m => m.word)).toEqual(['if', 'end']);
    });

    // The boundary is defined by exclusion, so any non-37 CCSID variant glyph (e.g. ¥)
    // adjacent to a keyword is also treated as part of the identifier, not a boundary.
    it('should NOT match keywords adjacent to other variant glyphs (CCSID-robust)', () => {
      const code = `dcl-s ¥end ind inz(*off);`;
      const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
      expect(matches).to.have.lengthOf(0);
    });

    // Regression (point 2): keywords must be sorted longest-first before the alternation
    // is built. JS regex alternation is first-match-wins, not longest-match, so a bare
    // keyword listed before its hyphenated sibling would match the prefix and truncate the
    // hyphenated keyword. The `length` assertions are the sharp part: under the old
    // unsorted matcher these matched the bare prefix (length 3), not the whole keyword.
    describe('longest-first keyword matching', () => {
      it('should match for-each as one keyword, not the bare for prefix', () => {
        const code = `for-each item in list;
  total += item.value;
endfor;`;
        const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
        expect(matches.map(m => m.word)).toEqual(['for-each', 'endfor']);
        // bug would yield word 'for', length 3, leaving '-each' dangling
        expect(matches[0].length).toBe('for-each'.length);
      });

      it('should match hyphenated end- closers, not the bare end prefix', () => {
        const code = `dcl-proc p;
  dcl-pi *n;
  end-pi;
  dcl-ds d qualified;
    field char(10);
  end-ds;
end-proc;`;
        const matches = findAllBlockMatches(code, isInCommentOrString, isInSqlBlock);
        expect(matches.map(m => m.word)).toEqual([
          'dcl-proc', 'dcl-pi', 'end-pi', 'dcl-ds', 'end-ds', 'end-proc',
        ]);
        // bug would tokenise each end-xx closer as bare 'end' (length 3)
        const endDs = matches.find(m => m.word === 'end-ds');
        expect(endDs?.length).toBe('end-ds'.length);
      });
    });
  });
});