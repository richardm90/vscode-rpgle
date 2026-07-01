import { languages } from "vscode";
import { buildRpgleWordPattern } from "../../../../language/utils/wordPattern";

export function setLanguageSettings() {
  return languages.setLanguageConfiguration(`rpgle`, {
    wordPattern: buildRpgleWordPattern()
  });
}