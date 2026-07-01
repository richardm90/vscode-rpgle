**free

ctl-opt actgrp(*new);
ctl-opt main(BRACKETS);

dcl-ds outputData_t qualified inz;
  subf1 char(10);
  subf2 int(10);
end-ds;

dcl-proc BRACKETS;

  dcl-s rc int(10);

  proc1('Hello':'Richard':rc);

end-proc;

dcl-proc proc1;
  dcl-pi *n likeds(outputData_t);
    parm1 char(10) const;
    parm2 char(10) const;
    parm3 int(10);
  end-pi;

  dcl-ds outputData likeds(outputData_t) inz(*likeds);

  dcl-ds myds1 qualified inz;
    field1 char(10);
    field2 char(10);
    dcl-ds myds2;
      field3 char(10);
      field4 char(10);
    end-ds;
    dcl-ds myds3 likeds(outputData_t);
    dcl-ds myds4;
      field5 char(10);
    end-ds;
    dcl-subf chain ind;
  end-ds;

  return outputData;
end-proc;

dcl-proc proc2_whitespace;
  dcl-pi *n;
  end-pi;

  // Test whitespace variations
  dcl-ds data1 likeds (outputData_t);  // Space before paren
  dcl-ds data2 likeds( outputData_t );  // Spaces inside parens
  dcl-ds data3  likeds  (  outputData_t  );  // Multiple spaces

end-proc;

dcl-proc proc3_case;
  dcl-pi *n;
  end-pi;

  // Test case variations
  dcl-ds data4 LIKEDS(outputData_t);  // Uppercase LIKEDS
  dcl-ds data5 LiKeDs(outputData_t);  // Mixed case
  DCL-DS data6 likeds(outputData_t);  // Uppercase DCL-DS

end-proc;

dcl-proc proc4_comments;
  dcl-pi *n;
  end-pi;

  // Test comments and additional keywords
  dcl-ds data7 likeds(outputData_t);  // This is a comment
  dcl-ds data8 likeds(outputData_t) inz(*likeds);  // With INZ
  dcl-ds data9 likeds(outputData_t) inz dim(10);  // An array DS

end-proc;

dcl-proc proc5_multiline;
  dcl-pi *n;
  end-pi;

  // Test normal multi-line dcl-ds still works
  dcl-ds normalStruct;
    field1 int(10);
    field2 char(50);
  end-ds;

end-proc;

dcl-proc proc6_deeply_nested;
  dcl-pi *n;
  end-pi;

  // Test deeply nested structures
  dcl-ds level1 qualified inz;
    field1 char(10);
    dcl-ds level2;
      field2 char(10);
      dcl-ds level3 likeds(outputData_t);  // Single-line
      dcl-ds level4;
        field3 char(10);
      end-ds;
    end-ds;
  end-ds;

end-proc;

dcl-proc proc7_likerec;
  dcl-pi *n;
  end-pi;

  dcl-f QSYSPRT rename(QSYSPRT:QSYSPRTR);

  // Test likerec variations
  dcl-ds data10 likerec(QSYSPRTR);  // Standard likerec
  dcl-ds data11 likerec (QSYSPRTR);  // Space before paren
  dcl-ds data12 LIKEREC(QSYSPRTR);  // Uppercase

end-proc;

dcl-proc proc8_comment_edge_case;
  dcl-pi *n end-pi;

  // Edge case: likeds in comment should create block
  dcl-ds shouldBeBlock;  // likeds(fake) in comment
    field1 int(10);
  end-ds;

end-proc;

dcl-proc proc9_comment_close;
  dcl-pi *n int(10) end-pi;

  // Edge case: end-ds in comment should create block
  dcl-ds shouldBeBlock;  // end-ds in comment
    field1 int(10);
  end-ds;

  return field1;
end-proc;

dcl-proc proc10_extname;

  // extname requires end-ds (unlike likeds/likerec). Both valid forms below should
  // highlight/fold dcl-ds <-> end-ds as a pair.

  // Block form: extname with extra subfields and a real end-ds
  dcl-ds data13 extname('QIWS/QCUSTCDT') qualified;
    extraField char(10);
  end-ds;

  // One-line balanced: extname with end-ds on the same line
  dcl-ds data14 extname('QIWS/QCUSTCDT') qualified inz end-ds;

end-proc;

dcl-proc proc11_multiline_likeds;
  dcl-pi *n;
  end-pi;

  dcl-f QSYSPRT rename(QSYSPRT:QSYSPRTR);

  // likeds/likerec on a continuation line - self-contained, no end-ds
  dcl-ds data15
    likeds(outputData_t);

  dcl-ds data16
    likerec(QSYSPRTR);

  // keyword plus extra clauses spanning several lines
  dcl-ds data17
    likeds(outputData_t)
    inz(*likeds);

end-proc;  // must still match dcl-proc, not the dcl-ds above

dcl-proc proc12_multiline_nested;
  dcl-pi *n;
  end-pi;

  // contrast: a real multi-line block DS still needs end-ds, even split across lines
  dcl-ds outer
    qualified;
    field1 int(10);
    dcl-ds inner likeds(outputData_t);  // single, no end-ds
  end-ds;                               // closes outer

end-proc;

dcl-proc proc13_multiline_comments;
  dcl-pi *n;
  end-pi;

  // comment on the dcl-ds line, likeds on the continuation - still no end-ds
  dcl-ds data18  // leading comment
    likeds(outputData_t);

  // a real block DS whose continuation line only mentions likeds in a comment
  dcl-ds data19
    // likeds(fake) - just a comment, this is still a block
    qualified;
    field6 char(10);
  end-ds;

end-proc;

dcl-proc proc14_fields_with_end;

  dcl-s bend ind inz(*off);
  dcl-s end2 ind inz(*off);
  dcl-s £end ind inz(*off);
  dcl-s W#End ind inz(*off);

  dcl-ds data20 qualified;
    bend ind;
    end2 ind;
    dcl-subf £end ind;
    dcl-subf W#End ind;
  end-ds;

end-proc;
