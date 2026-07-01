import { describe, it, expect } from 'vitest';
import { RPGLE_WORD_CHAR_PATTERN, RPGLE_WORD_WITH_HYPHEN_PATTERN, buildRpgleWordPattern } from '../../language/utils/wordPattern';

describe('wordPattern', () => {
  describe('buildRpgleWordPattern', () => {
    // Guards the behaviour-preserving refactor of config.ts: the rebuilt wordPattern
    // must be byte-identical to the original literal that used to live there.
    const ORIGINAL_SOURCE =
      "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)";

    it('should produce the original wordPattern regex source', () => {
      expect(buildRpgleWordPattern().source).toBe(ORIGINAL_SOURCE);
      expect(buildRpgleWordPattern().flags).toBe('g');
    });

    it('should treat RPGLE special characters as part of a word', () => {
      const re = buildRpgleWordPattern();
      // A whole special-char name is a single word match.
      expect('£end'.match(re)).toEqual(['£end']);
      expect('W#End'.match(re)).toEqual(['W#End']);
      expect('my$var'.match(re)).toEqual(['my$var']);
      expect('my@field'.match(re)).toEqual(['my@field']);
    });
  });

  describe('RPGLE_WORD_CHAR_PATTERN', () => {
    const wordChar = new RegExp(`^${RPGLE_WORD_CHAR_PATTERN}$`);

    it('should match RPGLE identifier characters', () => {
      for (const ch of ['a', 'Z', '0', '_', '$', '@', '#', '£', '¥']) {
        expect(wordChar.test(ch)).toBe(true);
      }
    });

    it('should not match delimiters', () => {
      for (const ch of [' ', ';', '(', ')', '-', '+', '.', ',', '*', '/', '=']) {
        expect(wordChar.test(ch)).toBe(false);
      }
    });
  });

  // Mirrors the cursor-word lookup in bracketMatcher.ts (getWordRangeAtPosition): the
  // word at the cursor must include special-char names whole AND hyphenated keywords whole.
  describe('RPGLE_WORD_WITH_HYPHEN_PATTERN', () => {
    // Approximates getWordRangeAtPosition by returning every whole word on a line.
    const wordsOf = (line: string) => line.match(new RegExp(RPGLE_WORD_WITH_HYPHEN_PATTERN, 'g')) ?? [];

    it('should capture special-character names whole', () => {
      expect(wordsOf('dcl-s £end ind inz(*off);')).toEqual(['dcl-s', '£end', 'ind', 'inz', 'off']);
      expect(wordsOf('dcl-subf W#End ind;')).toEqual(['dcl-subf', 'W#End', 'ind']);
    });

    it('should capture hyphenated keywords whole', () => {
      expect(wordsOf('  end-proc;')).toEqual(['end-proc']);
      expect(wordsOf('dcl-ds data qualified;')).toEqual(['dcl-ds', 'data', 'qualified']);
      expect(wordsOf('for-each item in list;')).toEqual(['for-each', 'item', 'in', 'list']);
    });

    it('should not match a lone hyphen used as an operator', () => {
      // The pattern must start with a word character, so the standalone '-' is not a word.
      expect(wordsOf('x = end - 1;')).toEqual(['x', 'end', '1']);
    });
  });
});
