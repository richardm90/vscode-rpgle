      *=================================================================
      * brackets-mixed.rpgle
      *
      * Mixed-format RPG IV - the mixed-format companion to brackets.rpgle.
      * This is a fixed-format source member (no **FREE) that interleaves
      * traditional fixed D-/C-specs with free-form declarations, a /free
      * calc block, and a fixed-format procedure (P-spec) with a free-form
      * body. It exercises dcl-ds/end-ds bracket matching and folding when
      * the free-form declarations live inside a fixed member.
      *
      * NOTE: full-line fixed-format comments (a `*` in column 6 or 7) are
      * recognised as comments, so block keywords named in them - such as
      * end-ds below - are correctly ignored, just like keywords inside
      * // comments.
      *=================================================================
     H DftActGrp(*No) ActGrp(*New)

     FQSYSPRT   O    E             PRINTER Rename(QSYSPRT:QSYSPRTR)

      * Fixed-format D-spec data structure - no free-form closer, so it
      * never folds as a dcl-ds/end-ds pair.
     D legacyDs        DS                  Inz
     D  fieldA                       10A
     D  fieldB                       10I 0

      // Free-form template DS in a fixed member - folds dcl-ds <-> end-ds
       dcl-ds outputData_t qualified template inz;
         subf1 char(10);
         subf2 int(10);
       end-ds;

      // Single-line likeds: self-contained, must NOT expect end-ds
       dcl-ds data1 likeds(outputData_t);

      // likerec, written both as a fixed D-spec and as a free-form decl
     D legacyRec       DS                  LikeRec(QSYSPRTR)
       dcl-ds data2 likerec(QSYSPRTR);

      // likeds on a continuation line - still self-contained, no end-ds
       dcl-ds data3
         likeds(outputData_t);

      // Real multi-line block DS - folds to the matching end-ds. The
      // single-line likeds subfield inside must NOT consume the end-ds.
       dcl-ds normalStruct qualified;
         field1 int(10);
         dcl-ds inner likeds(outputData_t);   // single, no closer here
         field2 char(50);
       end-ds;

      // Case variations are matched case-insensitively
       DCL-DS data4 LIKEDS(outputData_t);
       Dcl-Ds data5 LiKeDs(outputData_t);

      // extname requires a real end-ds (unlike likeds/likerec)
       dcl-ds data6 extname('QIWS/QCUSTCDT') qualified;
         extraField char(10);
       end-ds;

      // One-line balanced extname: dcl-ds <-> end-ds on the same line
       dcl-ds data7 extname('QIWS/QCUSTCDT') qualified inz end-ds;

      // Subfield / standalone names that merely contain 'end' must not be
      // mistaken for the end-ds closer (word-boundary handling).
       dcl-ds data8 qualified;
         bend ind;
         end2 ind;
         dcl-subf £end ind;
         dcl-subf W#End ind;
       end-ds;

      // Free-form prototype for the fixed-format procedure defined below
      // (dcl-pr / end-pr fold as a pair).
       dcl-pr calcTotal int(10);
         count int(5) const;
         base int(10) const;
       end-pr;

      * A fixed-format C-spec calc section still folds its structured
      * opcodes, side by side with the free-form declarations above.
     C                   IF        %parms > 0
     C                   DOW       fieldB < 10
     C                   EVAL      fieldB = fieldB + 1
     C                   ENDDO
     C                   ENDIF

      * A /free block mixes free-form calcs into the fixed member.
      /free
        select;
          when fieldB = 0;
            fieldB = 1;
          other;
            fieldB = 0;
        endsl;
      /end-free

     C                   EVAL      *INLR = *ON

      *=================================================================
      * Fixed-format procedure declaration with a free-format body.
      *
      * The `P calcTotal B` / `P calcTotal E` boundary and the PI are
      * fixed format - they use no dcl-proc/end-proc keywords, so they do
      * not keyword-fold. The free-form opcodes in the body (for/endfor,
      * if/endif, dow/enddo) fold normally.
      *=================================================================
     P calcTotal       B                   EXPORT
     D calcTotal       PI            10I 0
     D  count                         5I 0 Const
     D  base                         10I 0 Const

     D total           S             10I 0
     D i               S             10I 0

       // free-form body inside a fixed-format procedure
       total = 0;

       for i = 1 to count;
         if base > 0;
           total += base * i;
         else;
           total -= i;
         endif;
       endfor;

       dow total > 32767;
         total -= 1000;
       enddo;

       return total;
     P calcTotal       E
