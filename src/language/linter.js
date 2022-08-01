
const vscode = require(`vscode`);

const Cache = require(`./models/cache`);
const Declaration = require(`./models/declaration`);
const Statement = require(`./statement`);
const oneLineTriggers = require(`./models/oneLineTriggers`);

const errorText = {
  'BlankStructNamesCheck': `Struct names cannot be blank (\`*N\`).`,
  'QualifiedCheck': `Struct names must be qualified (\`QUALIFIED\`).`,
  'PrototypeCheck': `Prototypes can only be defined with either \`EXT\`, \`EXTPGM\` or \`EXTPROC\``,
  'ForceOptionalParens': `Expressions must be surrounded by brackets.`,
  'NoOCCURS': `\`OCCURS\` is not allowed.`,
  'NoSELECTAll': `\`SELECT *\` is not allowed in Embedded SQL.`,
  'UselessOperationCheck': `Redundant operation codes (EVAL, CALLP) not allowed.`,
  'UppercaseConstants': `Constants must be in uppercase.`,
  'SpecificCasing': `Does not match required case.`,
  'InvalidDeclareNumber': `Variable names cannot start with a number`,
  'IncorrectVariableCase': `Variable name casing does not match definition.`,
  'RequiresParameter': `Procedure calls require brackets.`,
  'RequiresProcedureDescription': `Procedures require a title and description.`,
  'StringLiteralDupe': `Same string literal used more than once. Consider using a constant instead.`,
  'RequireBlankSpecial': `\`*BLANK\` should be used over empty string literals.`,
  'CopybookDirective': `Directive does not match requirement.`,
  'UppercaseDirectives': `Directives must be in uppercase.`,
  'NoSQLJoins': `SQL joins are not allowed. Consider creating a view instead.`,
  'NoGlobalsInProcedures': `Global variables should not be referenced in procedures.`,
  'NoCTDATA': `\`CTDATA\` is not allowed.`,
  'PrettyComments': `Comments must be correctly formatted.`,
  'NoGlobalSubroutines': `Subroutines should not be defined in the global scope.`,
  'NoLocalSubroutines': `Subroutines should not be defined in procedures.`,
  'UnexpectedEnd': `Statement unexpected. Likely missing the equivalent \`DCL..\``,
  'NoUnreferenced': `No reference to definition.`,
  'NoExternalTo': `Cannot declare prototype to this external API.`,
  'NoExecuteImmediate': `EXECUTE IMMEDIATE is not allowed.`,
  'NoExtProgramVariable': `Not allowed to use variable in EXTPGM or EXTPROC.`
}

module.exports = class Linter {
  static getErrorText(error) {
    return errorText[error];
  }

  /**
   * @param {{uri: vscode.Uri, content: string}} data
   * @param {Rules} rules 
   * @param {Cache|null} [globalScope]
   */
  static getErrors(data, rules, globalScope) {
    const newLineLength = (data.content.indexOf(`\r\n`) !== -1) ? 2 : 1;

    /** @type {string[]} */
    const lines = data.content.replace(new RegExp(`\\\r`, `g`), ``).split(`\n`);

    const indentEnabled = rules.indent !== undefined;
    const indent = rules.indent || 2;

    // Excluding indent
    const ruleCount = Object.keys(rules).length - (rules.indent ? 1 : 0);

    if (!globalScope) 
      globalScope = new Cache();

    const globalProcs = globalScope.procedures;

    let inProcedure = false;
    let inPrototype = false;
    let inOnExit = false;

    let lineNumber = -1;

    /** @type {{line: number, expectedIndent: number, currentIndent: number}[]} */
    const indentErrors = [];

    // Offset is always the offset within the range

    /** @type {IssueRange[]} */
    const errors = [];

    /** @type {Number} */
    let expectedIndent = 0;
    let currentIndent = 0;

    /** @type {string[]} */
    let pieces;

    let continuedStatement = false;
    let isLineComment = false;
    let skipIndentCheck = false;
    let deferredIndent = false;

    let currentStatement = ``;
    let opcode;

    /** @type {vscode.Position} */
    let statementStart;
    /** @type {vscode.Position} */
    let statementEnd;

    if (rules.NoUnreferenced) {
      // We need to collect references for this to work correctly.
      rules.CollectReferences = true;
    }

    // Make all external refs uppercase.
    if (rules.NoExternalTo && rules.NoExternalTo.length) {
      rules.NoExternalTo = rules.NoExternalTo.map(val => val.toUpperCase());
    }

    /** @type {{value: string, definition?: string, list: {range: vscode.Range, offset: {position: number, length: number}}[]}[]} */
    const stringLiterals = [];

    for (lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const currentLine = lines[lineNumber];
      currentIndent = currentLine.search(/\S/);
      let line = currentLine.trimEnd();

      let upperLine = line.trim().toUpperCase();

      isLineComment = line.trimStart().startsWith(`//`);

      if (currentIndent >= 0) {
        skipIndentCheck = false;

        if (continuedStatement) {
          if (isLineComment) {
            currentStatement += currentLine + ``.padEnd(newLineLength, ` `);
          }
          
          skipIndentCheck = true;
          statementEnd = new vscode.Position(lineNumber, (currentLine.length));

          if (currentIndent < expectedIndent) {
            indentErrors.push({
              line: lineNumber,
              expectedIndent,
              currentIndent
            });
          }
        } else {
          statementStart = new vscode.Position(lineNumber, currentIndent);
          statementEnd = new vscode.Position(lineNumber, (currentLine.length));
        }

        if (isLineComment) {
          const comment = line.substring(currentIndent + 2).trimEnd();
          if (rules.PrettyComments) {
            if (comment === ``) {
              errors.push({
                range: new vscode.Range(
                  new vscode.Position(lineNumber, currentIndent),
                  new vscode.Position(lineNumber, currentIndent + 2)
                ),
                type: `PrettyComments`,
                newValue: ``
              });
            } else {
              // We check for the slash because the documentation requires ///.
              if (comment !== `/`) {
                const startSpaces = comment.search(/\S/);

                if (startSpaces === 0) {
                  errors.push({
                    range: new vscode.Range(
                      new vscode.Position(lineNumber, currentIndent),
                      new vscode.Position(lineNumber, currentIndent + 2)
                    ),
                    type: `PrettyComments`,
                    newValue: `// `,
                  });
                }
              }
            }
          } else {
            skipIndentCheck = true;
          }

          // Special comment check
          if (comment.trim() === `@rpglint-skip`) {
            lineNumber += 1;
            continue;
          }
        }

        if (!isLineComment) {
          if (line.endsWith(`;`)) {
            statementEnd = new vscode.Position(lineNumber, line.length - 1);
            line = line.substr(0, line.length-1);
            currentStatement += line;
            continuedStatement = false;

          } else {

            const semiIndex = line.lastIndexOf(`;`);
            const commentIndex = line.lastIndexOf(`//`);

            if (commentIndex > semiIndex && semiIndex >= 0) {
              statementEnd = new vscode.Position(lineNumber, line.lastIndexOf(`;`));
              line = line.substr(0, semiIndex);
              continuedStatement = false;
            } else {
              continuedStatement = true;
            }
            currentStatement += currentLine + ``.padEnd(newLineLength, ` `);
          }

          // We do it again for any changes to the line
          upperLine = line.trim().toUpperCase();

          // Generally ignore comments
          if (upperLine.startsWith(`//`)) {
            currentStatement = ``;
          } else if (upperLine.startsWith(`/`)) {
          // But not directives!
            continuedStatement = false;
          }

          // Ignore free directive.
          if (upperLine.startsWith(`**`)) {
            continuedStatement = false;
          }

          // Linter checking
          if (continuedStatement === false && currentStatement.length > 0) {
            if (ruleCount > 0) {
              const currentStatementUpper = currentStatement.toUpperCase();
              currentStatement = currentStatement.trim();

              const currentProcedure = globalScope.procedures.find(proc => lineNumber >= proc.range.start && lineNumber <= proc.range.end);
              const currentScope = globalScope.merge(inProcedure && currentProcedure ? currentProcedure.scope : undefined);

              const statement = Statement.parseStatement(currentStatement);
              let value;

              if (statement.length >= 1) {
                if (statement[0].type === `directive` && statement[0].value.toUpperCase() === `/EOF`) {
                  // End of file
                  break;
                }

                switch (statement[0].type) {
                case `format`:
                  if (statement[0].value.toUpperCase() === `**CTDATA`) {
                    if (rules.NoCTDATA) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                        type: `NoCTDATA`,
                      });
                    }
                  }
                  break;

                case `directive`:
                  value = statement[0].value;
                  if (rules.UppercaseDirectives) {
                    if (value !== value.toUpperCase()) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        offset: {position: statement[0].position, length: statement[0].position + value.length},
                        type: `UppercaseDirectives`,
                        newValue: value.toUpperCase()
                      });
                    }
                  }

                  if (rules.CopybookDirective) {
                    if ([`/COPY`, `/INCLUDE`].includes(value.toUpperCase())) {
                      const correctDirective = `/${rules.CopybookDirective.toUpperCase()}`;
                      if (value.toUpperCase() !== correctDirective) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + value.length},
                          type: `CopybookDirective`,
                          newValue: correctDirective
                        });
                      }
                    }
                  }
                  break;

                case `declare`:
                  if (statement.length < 2) break;

                  if (rules.SpecificCasing) {
                    const caseRule = rules.SpecificCasing.find(rule => [statement[0].value.toUpperCase(), `*DECLARE`].includes(rule.operation.toUpperCase()));
                    if (caseRule) {
                      let expected = caseRule.expected;
                      switch (expected.toUpperCase()) {
                      case `*UPPER`:
                        expected = statement[0].value.toUpperCase(); 
                        break;
                      case `*LOWER`:
                        expected = statement[0].value.toLowerCase(); 
                        break;
                      }
                      if (statement[0].value !== expected) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                          type: `SpecificCasing`,
                          newValue: expected
                        });
                      }
                    }
                  }

                  value = statement[1].value;

                  if (value.match(/^\d/)) {
                    errors.push({
                      range: new vscode.Range(
                        statementStart,
                        statementEnd
                      ),
                      offset: {position: statement[1].position, length: statement[1].position + value.length},
                      type: `InvalidDeclareNumber`,
                    });
                  }

                  switch (statement[0].value.toUpperCase()) {
                  case `BEGSR`:
                    if (inProcedure) {
                      if (rules.NoLocalSubroutines) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          type: `NoLocalSubroutines`,
                        });
                      }
                    } else {
                      if (rules.NoGlobalSubroutines) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                          type: `NoGlobalSubroutines`,
                          newValue: `Dcl-Proc`
                        });
                      }
                    }
                    break;
                  case `DCL-PROC`:
                    inProcedure = true;
                    if (statement.length < 2) break;
                    if (rules.RequiresProcedureDescription) {
                      value = statement[1].value;
                      const procDef = globalProcs.find(def => def.name.toUpperCase() === value.toUpperCase());
                      if (procDef) {
                        if (!procDef.description) {
                          errors.push({
                            range: new vscode.Range(
                              statementStart,
                              statementEnd
                            ),
                            type: `RequiresProcedureDescription`,
                          });
                        }
                      }
                    }
                    break;
                  case `DCL-C`:
                    if (rules.UppercaseConstants) {
                      if (value !== value.toUpperCase()) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[1].position, length: statement[1].position + value.length},
                          type: `UppercaseConstants`,
                          newValue: value.toUpperCase()
                        });
                      }
                    }

                    if (rules.StringLiteralDupe) {
                      if (statement[2].type === `string`) {
                        let foundBefore = stringLiterals.find(literal => literal.value === statement[2].value);
  
                        // If it does not exist on our list, we can add it
                        if (!foundBefore) {
                          foundBefore = {
                            definition: value,
                            value: statement[2].value,
                            list: []
                          };
  
                          stringLiterals.push(foundBefore);
                        }
                      }
                    }
                    break;

                  case `DCL-PI`:
                    if (!statement.some(s => s.type === `end`)) {
                      inPrototype = true;
                    }
                    break;

                  case `DCL-PR`:
                    inPrototype = true;
                    if (rules.PrototypeCheck || rules.NoExtProgramVariable) {
                      
                      const extIndex = statement.findIndex(part => part.value && part.value.toUpperCase().startsWith(`EXT`));
                      if (extIndex >= 0) {
                        if (rules.NoExtProgramVariable) {

                          const keywordValue = statement.find((part, index) => index > extIndex && part.type === `word`);
                          if (keywordValue) {
                            errors.push({
                              range: new vscode.Range(
                                statementStart,
                                statementEnd
                              ),
                              offset: {position: keywordValue.position, length: keywordValue.position + keywordValue.value.length},
                              type: `NoExtProgramVariable`
                            });
                          }
                        }

                      } else if (rules.PrototypeCheck) {
                        // Not EXTPROC / EXTPGM found. Likely don't need this PR if it's for local procedure.
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `PrototypeCheck`,
                        });
                      }
                    }
                    break;

                  case `DCL-DS`:
                    if (rules.NoOCCURS) {
                      if (statement.some(part => part.value && part.value.toUpperCase() === `OCCURS`)) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `NoOCCURS`,
                        });
                      }
                    }
    
                    if (rules.QualifiedCheck) {
                      if (!statement.some(part => part.value && [`LIKEDS`, `LIKEREC`, `QUALIFIED`].includes(part.value.toUpperCase()))) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `QualifiedCheck`,
                        });
                      }
                    }
    
                    if (rules.BlankStructNamesCheck) {
                      if (statement.some(part => part.type === `special` && part.value.toUpperCase() === `*N`)) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `BlankStructNamesCheck`,
                        });
                      }
                    }

                    if (rules.NoCTDATA) {
                      if (statement.some(part => [`CTDATA`, `*CTDATA`].includes(part.value.toUpperCase()))) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `NoCTDATA`,
                        });
                      }
                    }
                    break;
                  }

                  break;

                case `end`:
                  value = statement[0].value.toUpperCase();

                  if (rules.SpecificCasing) {
                    const caseRule = rules.SpecificCasing.find(rule => [value, `*DECLARE`].includes(rule.operation.toUpperCase()));
                    if (caseRule) {
                      let expected = caseRule.expected;
                      switch (expected.toUpperCase()) {
                      case `*UPPER`:
                        expected = statement[0].value.toUpperCase(); 
                        break;
                      case `*LOWER`:
                        expected = statement[0].value.toLowerCase(); 
                        break;
                      }
                      if (statement[0].value !== expected) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + value.length},
                          type: `SpecificCasing`,
                          newValue: expected
                        });
                      }
                    }
                  }

                  switch (value) {
                  case `ENDSR`:
                    if (inProcedure === false) {
                      if (rules.NoGlobalSubroutines) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                          type: `NoGlobalSubroutines`,
                          newValue: `End-Proc`
                        });
                      }
                    }
                    break;
                  case `END-PROC`:
                    if (inProcedure === false) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                        type: `UnexpectedEnd`,
                      });
                    }

                    inProcedure = false;
                    break;
                  case `END-PR`:
                  case `END-PI`:
                    if (inPrototype === false) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        offset: {position: statement[0].position, length: statement[0].position + statement[0].value.length},
                        type: `UnexpectedEnd`,
                      });
                    }

                    inPrototype = false;
                    break;
                  }
                  break;

                case `word`:
                  value = statement[0].value.toUpperCase();

                  if (rules.SpecificCasing) {
                    const caseRule = rules.SpecificCasing.find(rule => value === rule.operation.toUpperCase());
                    if (caseRule) {
                      let expected = caseRule.expected;
                      switch (expected.toUpperCase()) {
                      case `*UPPER`:
                        expected = statement[0].value.toUpperCase(); 
                        break;
                      case `*LOWER`:
                        expected = statement[0].value.toLowerCase(); 
                        break;
                      }
                      if (statement[0].value !== expected) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: statement[0].position, length: statement[0].position + value.length},
                          type: `SpecificCasing`,
                          newValue: expected
                        });
                      }
                    }
                  }

                  switch (value.toUpperCase()) {
                  case `EVAL`:
                  case `CALLP`:
                    if (rules.UselessOperationCheck) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        offset: {position: statement[0].position, length: statement[0].position + value.length + 1},
                        type: `UselessOperationCheck`,
                      });
                    }
                    break;
                  case `LEAVESR`:
                    if (rules.NoGlobalSubroutines && !inProcedure) {
                      errors.push({
                        range: new vscode.Range(
                          statementStart,
                          statementEnd
                        ),
                        type: `NoGlobalSubroutines`,
                        newValue: `return`
                      });
                    }
                    break;
                  case `EXSR`:
                    if (rules.NoGlobalSubroutines) {
                      if (statement.length === 2) {
                        if (globalScope.subroutines.find(sub => sub.name.toUpperCase() === statement[1].value.toUpperCase())) {
                          errors.push({
                            range: new vscode.Range(
                              statementStart,
                              statementEnd
                            ),
                            type: `NoGlobalSubroutines`,
                            newValue: `${statement[1].value}()`
                          });
                        }
                      }
                    }
                    break;
                  case `EXEC`:
                    if (rules.NoSELECTAll) {
                      if (currentStatementUpper.includes(`SELECT *`)) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `NoSELECTAll`,
                        });
                      }
                    }

                    if (rules.NoSQLJoins) {
                      if (statement.some(part => part.value && part.value.toUpperCase() === `JOIN`)) {
                        errors.push({
                          range: new vscode.Range(statementStart, statementEnd),
                          type: `NoSQLJoins`,
                        });
                      }
                    }

                    if (rules.NoExecuteImmediate) {
                      const executeIndex = statement.findIndex(part => part.value && part.value.toUpperCase() === `EXECUTE`);
                      const immediateIndex = statement.findIndex(part => part.value && part.value.toUpperCase() === `IMMEDIATE`);

                      if (executeIndex >= 0) {
                        if (executeIndex + 1 === immediateIndex) {
                          errors.push({
                            range: new vscode.Range(statementStart, statementEnd),
                            type: `NoExecuteImmediate`,
                          });
                        }
                      }
                    }
                    break;

                  case `IF`:
                  case `ELSEIF`:
                  case `WHEN`:
                  case `DOW`:
                  case `DOU`:
                    if (rules.ForceOptionalParens) {
                      const lastStatement = statement[statement.length-1];
                      if (statement[1].type !== `openbracket` || lastStatement.type !== `closebracket`) {
                        errors.push({
                          range: new vscode.Range(
                            new vscode.Position(statementStart.line, statementStart.character + statement[0].value.length + 1),
                            statementEnd
                          ),
                          type: `ForceOptionalParens`,
                        });
                      }
                    }
                    break;
                  }
                  break;
                }
              }
          
              let part;

              if (statement.length > 0 && [`declare`, `end`].includes(statement[0].type) === false) {

                for (let i = 0; i < statement.length; i++) {
                  part = statement[i];

                  if (part.value) {
                    switch (part.type) {
                    case `builtin`:
                      if (rules.SpecificCasing) {
                        const caseRule = rules.SpecificCasing.find(rule => [part.value.toUpperCase(), `*BIF`].includes(rule.operation.toUpperCase()));
                        if (caseRule) {
                          let expected = caseRule.expected;
                          switch (expected.toUpperCase()) {
                          case `*UPPER`:
                            expected = part.value.toUpperCase();
                            break;
                          case `*LOWER`:
                            expected = part.value.toLowerCase();
                            break;
                          }
                          if (part.value !== expected) {
                            errors.push({
                              range: new vscode.Range(
                                statementStart,
                                statementEnd
                              ),
                              offset: {position: part.position, length: part.position + part.value.length},
                              type: `SpecificCasing`,
                              newValue: expected
                            });
                          }
                        }
                      }
                      break;

                    
                    case `special`:
                      if (rules.CollectReferences) {
                        value = part.value.substring(1).toUpperCase();
                        const defRef = globalScope.find(value);
                  
                        if (defRef) {
                          defRef.references.push({
                            range: new vscode.Range(
                              statementStart,
                              statementEnd
                            ),
                            offset: {position: part.position, length: part.position + part.value.length},
                            type: null,
                          })
                        }
                      }
                      break;

                    case `word`:
                      const upperName = part.value.toUpperCase();

                      if (rules.NoGlobalsInProcedures) {
                        if (inProcedure && !inPrototype) {
                          const existingVariable = globalScope.variables.find(variable => variable.name.toUpperCase() === upperName);
                          if (existingVariable) {
                            errors.push({
                              range: new vscode.Range(
                                statementStart,
                                statementEnd
                              ),
                              offset: {position: part.position, length: part.position + part.value.length},
                              type: `NoGlobalsInProcedures`,
                            });
                          }
                        }
                      }
                
                      if (rules.IncorrectVariableCase) {
                        // Check the casing of the reference matches the definition
                        const definedNames = currentScope.getNames();
                        const definedName = definedNames.find(defName => defName.toUpperCase() === upperName);
                        if (definedName && definedName !== part.value) {
                          errors.push({
                            range: new vscode.Range(
                              statementStart,
                              statementEnd
                            ),
                            offset: {position: part.position, length: part.position + part.value.length},
                            type: `IncorrectVariableCase`,
                            newValue: definedName
                          });
                        }
                      }
  
                      if (rules.RequiresParameter && !inPrototype) {
                        // Check the procedure reference has a block following it
                        const definedProcedure = globalProcs.find(proc => proc.name.toUpperCase() === upperName);
                        if (definedProcedure) {
                          let requiresBlock = false;
                          if (statement.length <= i+1) {
                            requiresBlock = true;
                          } else if (statement[i+1].type !== `openbracket`) {
                            requiresBlock = true;
                          }
  
                          if (requiresBlock) {
                            errors.push({
                              range: new vscode.Range(
                                statementStart,
                                statementEnd
                              ),
                              offset: {position: part.position, length: part.position + part.value.length},
                              type: `RequiresParameter`,
                            });
                          }
                        }
                      }

                      if (rules.CollectReferences) {
                        let defRef;
                        if (currentProcedure) {
                          defRef = currentProcedure.scope.find(upperName);

                          if (!defRef) {
                            defRef = currentProcedure.subItems.find(def => def.name.toUpperCase() === upperName)
                          }
                        }

                        if (!defRef) {
                          defRef = globalScope.find(upperName);
                        }

                        if (defRef) {
                          if (defRef.position.line !== statementStart.line) {
                            defRef.references.push({
                              range: new vscode.Range(
                                statementStart,
                                statementEnd
                              ),
                              offset: {position: part.position, length: part.position + part.value.length},
                            })
                          }
                        }
                      }
                      break;

                    case `string`:
                      if (part.value.substring(1, part.value.length-1).trim() === `` && rules.RequireBlankSpecial) {
                        errors.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: part.position, length: part.position + part.value.length},
                          type: `RequireBlankSpecial`,
                          newValue: `*BLANK`
                        });
  
                      } else if (rules.StringLiteralDupe) {
                        let foundBefore = stringLiterals.find(literal => literal.value === part.value);
  
                        // If it does not exist on our list, we can add it
                        if (!foundBefore) {
                          foundBefore = {
                            value: part.value,
                            list: []
                          };
  
                          stringLiterals.push(foundBefore);
                        }
  
                        // Then add our new found literal location to the list
                        foundBefore.list.push({
                          range: new vscode.Range(
                            statementStart,
                            statementEnd
                          ),
                          offset: {position: part.position, length: part.position + part.value.length}
                        });
                      }
                      break;
                    }
                  }
                }
              }

            }

            // We don't want to lint CTDATA... so that's the end
            if (upperLine.startsWith(`**CTDATA`)) {
              break;
            }

            currentStatement = ``;
          }
        }
        
        // Next, check for indentation errors

        // Check to see if we are ending a multi-line conditional 
        // and now need to increase the expected indent level
        if (!continuedStatement && deferredIndent) {
          expectedIndent += indent;
          deferredIndent = false;
        }

        if (indentEnabled && skipIndentCheck === false) {
          pieces = upperLine.split(` `).filter(piece => piece !== ``);
          opcode = pieces[0];

          if ([
            `ENDIF`, `ENDFOR`, `ENDDO`, `ELSE`, `ELSEIF`, `ON-ERROR`, `ENDMON`, `ENDSR`, `WHEN`, `OTHER`, `END-PROC`, `END-PI`, `END-PR`, `END-DS`, `ENDSL`
          ].includes(opcode)) {
            expectedIndent -= indent; 

            //Special case for `ENDSL` and `END-PROC
            if ([
              `ENDSL`
            ].includes(opcode)) {
              expectedIndent -= indent; 
            }

            // Support for on-exit
            if (opcode === `END-PROC` && inOnExit) {
              inOnExit = false;
              expectedIndent -= indent;
            }
          }

          if (currentIndent !== expectedIndent) {
            indentErrors.push({
              line: lineNumber,
              expectedIndent,
              currentIndent
            });
          }

          if ([
            `IF`, `ELSE`, `ELSEIF`, `FOR`, `FOR-EACH`, `DOW`, `DOU`, `MONITOR`, `ON-ERROR`, `ON-EXIT`, `BEGSR`, `SELECT`, `WHEN`, `OTHER`, `DCL-PROC`, `DCL-PI`, `DCL-PR`, `DCL-DS`
          ].includes(opcode)) {
            if ([`DCL-DS`, `DCL-PI`, `DCL-PR`].includes(opcode) && oneLineTriggers[opcode].some(trigger => upperLine.includes(trigger))) {
              //No change
            } 
            else if (opcode === `SELECT`) {
              if (skipIndentCheck === false) expectedIndent += (indent*2); 
            }
            else if (opcode === `ON-EXIT`) {
              expectedIndent += indent; 
              inOnExit = true;
            }             
            // If we have a multi-line conditional, we don't want to increase
            // the required indent until we reach the end of the condition.
            else if (continuedStatement) {
              deferredIndent = true;
            } else {
              expectedIndent += indent; 
            }
          }
          
        }
      }
    }

    if (stringLiterals.length > 0) {
      const literalMinimum = rules.literalMinimum || 2;
      stringLiterals.forEach(literal => {
        if (literal.list.length >= literalMinimum) {
          literal.list.forEach(location => {
            errors.push({
              ...location,
              type: `StringLiteralDupe`,
              newValue: literal.definition
            })
          });
        }
      })
    }

    if (rules.NoExternalTo && rules.NoExternalTo.length) {
      [
        globalScope, 
        ...globalScope.procedures.filter(proc => proc.scope !== undefined).map(proc => proc.scope)
      ].forEach(scope => {
        scope.procedures.forEach(localDef => {
          if (localDef.keyword[`EXTPROC`] || localDef.keyword[`EXTPGM`]) {
            let callLoc = (localDef.keyword[`EXTPROC`] || localDef.keyword[`EXTPGM`]).toUpperCase();

            // Remove potential string around value
            callLoc = (callLoc.startsWith(`'`) && callLoc.endsWith(`'`) ? callLoc.substring(1, callLoc.length - 1) : callLoc);

            if (rules.NoExternalTo.includes(callLoc)) {
              errors.push({
                type: `NoExternalTo`,
                range: new vscode.Range(localDef.position.line, 0, localDef.position.line, 100),
              });
            }
          }
        })
      })
    }

    if (rules.NoUnreferenced) {
      [
        globalScope, 
        ...globalScope.procedures.filter(proc => proc.scope !== undefined).map(proc => proc.scope)
      ].forEach(dec => {
        [...dec.constants, ...dec.subroutines, ...dec.variables]
          .filter(def => def.position.path === data.uri.path)
          .forEach(def => {
            if (def.references.length === 0) {
              // Add an error to def
              errors.push({
                type: `NoUnreferenced`,
                range: new vscode.Range(def.position.line, 0, def.position.line, 100),
              });
            }
          });

        dec.procedures
          .filter(struct => struct.position.path === data.uri.path)
          .forEach(proc => {
            if (!proc.keyword[`EXPORT`]) {
              if (proc.references.length === 0) {
                // Add an error to proc
                errors.push({
                  type: `NoUnreferenced`,
                  range: new vscode.Range(proc.position.line, 0, proc.position.line, 100),
                });
              }

              if (!proc.keyword[`EXTPGM`] && !proc.keyword[`EXTPROC`]) {
                proc.subItems.forEach(parm => {
                  if (parm.references.length === 0) {
                    errors.push({
                      type: `NoUnreferenced`,
                      range: new vscode.Range(parm.position.line, 0, parm.position.line, 100),
                    });
                  }
                })
              }
            }
          })

        dec.structs
          .filter(struct => struct.position.path === data.uri.path)
          .forEach(struct => {
            const subFieldIsUsed = struct.subItems.some(subf => subf.references.length > 0)

            if (struct.references.length === 0) {
            // We only check the subfields if the parent is never references.

              struct.subItems.forEach(subf => {
                if (subf.references.length === 0) {
                // Add an error to subf
                  errors.push({
                    type: `NoUnreferenced`,
                    range: new vscode.Range(subf.position.line, 0, subf.position.line, 100),
                  });
                }
              });

              if (subFieldIsUsed === false) {
                errors.push({
                  type: `NoUnreferenced`,
                  range: new vscode.Range(struct.position.line, 0, struct.position.line, 100),
                });
              }
            }
          })
      })
    }

    return {
      indentErrors,
      errors
    };
  }

}