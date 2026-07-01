      *=================================================================
      * brackets-fixed.rpgle
      *
      * Fully fixed-format (columnar) RPG IV - the fixed-format companion
      * to brackets.rpgle. Data structures are D-specs, which have no
      * free-form closer, so they never participate in dcl-ds/end-ds
      * folding. Instead this file exercises bracket matching and folding
      * on the fixed-format C-spec structured operation codes.
      *
      * NOTE: full-line fixed-format comments (a `*` in column 6 or 7) are
      * recognised as comments, so block keywords named in them - such as
      * the opcode lists in the banners below - are correctly ignored, just
      * like keywords inside // comments.
      *=================================================================
     H DftActGrp(*No) ActGrp(*New)

     FQSYSPRT   O    E             PRINTER Rename(QSYSPRT:QSYSPRTR)

      * Qualified / template data structures as D-specs. A fixed-format
      * DS is closed by the next standalone definition, never by a closer.
     D outputData_t    DS                  Qualified Template Inz
     D  subf1                        10A
     D  subf2                        10I 0

     D myds            DS                  Qualified
     D  field1                       10A
     D  field2                       10A
     D  nested                       20A

      *-----------------------------------------------------------------
      * LIKEDS / LIKEREC are D-spec keywords in fixed format. Such a DS
      * lives entirely on its own D-spec line - no subfields, no end-ds -
      * so, like the free-form `dcl-ds ... likeds()` form, it is self-
      * contained and must produce no fold.
      *-----------------------------------------------------------------
      * LIKEDS: a DS shaped like another DS (cf. proc1 in brackets.rpgle)
     D outputData      DS                  LikeDS(outputData_t)

      * LIKEREC: a DS shaped like a record format, with whitespace and
      * case variations (cf. proc7_likerec in brackets.rpgle)
     D data10          DS                  LikeRec(QSYSPRTR)
     D data11          DS                  LikeRec (QSYSPRTR)
     D data12          DS                  LIKEREC(QSYSPRTR)

      * A prototype is also a D-spec block with no explicit closer.
     D proc1           PR
     D  parm1                        10A   Const
     D  parm2                        10A   Const
     D  parm3                        10I 0

     D proc2           PR            10I 0
     D  code                          5I 0 Const

     D rc              S             10I 0
     D idx             S             10I 0
     D state           S             10A

      *-----------------------------------------------------------------
      * Conditional branch (IF / ELSEIF / ELSE / ENDIF)
      *-----------------------------------------------------------------
     C                   IF        rc = 0
     C                   EVAL      state = 'zero'
     C                   ELSEIF    rc > 0
     C                   EVAL      state = 'high'
     C                   ELSE
     C                   EVAL      state = 'low'
     C                   ENDIF

      *-----------------------------------------------------------------
      * Loop tested at the top (DOW / ENDDO)
      *-----------------------------------------------------------------
     C                   EVAL      idx = 0
     C                   DOW       idx < 10
     C                   EVAL      idx = idx + 1
     C                   ENDDO

      *-----------------------------------------------------------------
      * Loop tested at the bottom (DOU / ENDDO)
      *-----------------------------------------------------------------
     C                   DOU       idx >= 20
     C                   EVAL      idx = idx + 1
     C                   ENDDO

      *-----------------------------------------------------------------
      * Counted loop (DO / ENDDO)
      *-----------------------------------------------------------------
     C     1             DO        5             idx
     C                   EVAL      rc = rc + idx
     C                   ENDDO

      *-----------------------------------------------------------------
      * Case structure (SELECT / WHEN / OTHER / ENDSL)
      *-----------------------------------------------------------------
     C                   SELECT
     C                   WHEN      rc = 0
     C                   EVAL      state = 'a'
     C                   WHEN      rc = 1
     C                   EVAL      state = 'b'
     C                   OTHER
     C                   EVAL      state = 'c'
     C                   ENDSL

      *-----------------------------------------------------------------
      * Exception handling (MONITOR / ON-ERROR / ENDMON)
      *-----------------------------------------------------------------
     C                   MONITOR
     C                   EVAL      rc = idx / rc
     C                   ON-ERROR
     C                   EVAL      rc = -1
     C                   ENDMON

      *-----------------------------------------------------------------
      * Nesting plus the generic closer (closes the innermost block that
      * accepts it - here the inner counted loop).
      *-----------------------------------------------------------------
     C                   IF        rc > 0
     C                   DOW       idx > 0
     C                   EVAL      idx = idx - 1
     C                   END
     C                   ENDIF

      *-----------------------------------------------------------------
      * Opcodes are matched without regard to case.
      *-----------------------------------------------------------------
     C                   if        rc = 0
     C                   EvAl      state = 'z'
     C                   EndIf

      *-----------------------------------------------------------------
      * Call a subroutine defined later in the source.
      *-----------------------------------------------------------------
     C                   EXSR      cleanup

      *-----------------------------------------------------------------
      * Legacy case operation (CASxx / ENDCS)
      *-----------------------------------------------------------------
     C     rc            CASEQ     0             cleanup
     C                   ENDCS

     C                   EVAL      *INLR = *ON

      *-----------------------------------------------------------------
      * Subroutine (BEGSR / ENDSR)
      *-----------------------------------------------------------------

     C     cleanup       BEGSR
     C                   EVAL      rc = 0
     C                   ENDSR

      *=================================================================
      * Subprocedures (fixed-format P-specs).
      *
      * A fixed-format procedure opens with `P name B` and closes with
      * `P name E`. These use no dcl-proc/end-proc keywords, so - like the
      * D-spec data structures above - the procedure boundaries do not
      * keyword-fold. The C-spec structured opcodes inside each procedure
      * body still fold normally.
      *=================================================================
     P proc1           B                   EXPORT
     D proc1           PI
     D  parm1                        10A   Const
     D  parm2                        10A   Const
     D  parm3                        10I 0

     D local           S             10I 0
     D outData         DS                  LikeDS(outputData_t)

      * Conditional branch inside the procedure body.
     C                   IF        parm3 > 0
     C                   EVAL      local = parm3
     C                   ELSE
     C                   EVAL      local = 0
     C                   ENDIF

      * Loop inside the procedure body.
     C                   DOW       local > 0
     C                   EVAL      local = local - 1
     C                   ENDDO
     P proc1           E

     P proc2           B                   EXPORT
     D proc2           PI            10I 0
     D  code                          5I 0 Const

     D result          S             10I 0

      * Case structure inside the procedure body.
     C                   SELECT
     C                   WHEN      code = 1
     C                   EVAL      result = 100
     C                   WHEN      code = 2
     C                   EVAL      result = 200
     C                   OTHER
     C                   EVAL      result = 0
     C                   ENDSL

      * Exception handling inside the procedure body.
     C                   MONITOR
     C                   EVAL      result = result / code
     C                   ON-ERROR
     C                   EVAL      result = -1
     C                   ENDMON

     C                   RETURN    result
     P proc2           E

     P proc3           B
     D proc3           PI

     D list            DS                  LikeDS(outputData_t) Dim(10)
     D item            DS                  LikeDS(outputData_t)

     D total           S             10I 0
     D i               S             10I 0

     C                   FOR-EACH  item in list
     C                   EVAL      total += item.subf2
     C                   ENDFOR

     C                   FOR       i = 1 to 10
     C                   EVAL      total += i
     C                   END

     P proc3           E
