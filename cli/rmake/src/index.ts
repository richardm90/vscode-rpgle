// rpglint CLI
// --files [glob]
// --cwd "[path]"

import glob from "glob";
import { readFileSync } from 'fs';

import Parser from '../../../server/src/language/parser';
import { setupParser } from './parser';

main();

async function main() {
	const parms = process.argv.slice(2);

	let cwd = process.cwd();
	let scanGlob = `**/*.{SQLRPGLE,sqlrpgle,RPGLE,rpgle}`;

	for (let i = 0; i < parms.length; i++) {
		switch (parms[0]) {
			case `-f`:
			case `--files`:
				scanGlob = parms[i + 1];
				i++;
				break;

			case `-h`:
			case `--help`:
				process.exit(0);
		}
	}

	let parser: Parser;
	let files: string[];

	try {
		parser = setupParser(cwd, scanGlob);
		files = getFiles(cwd, scanGlob);
	} catch (e) {
		error(e.message || e);
		process.exit(1);
	}

	for (const filePath of files) {
		try {
			const content = readFileSync(filePath, { encoding: `utf-8` });

			const docs = await parser.getDocs(
				filePath,
				content,
				{
					withIncludes: true
				}
			);

		} catch (e) {
			error(`Failed to lint ${filePath}: ${e.message || e}`);
			error(`Report this issue to us with an example: github.com/halcyon-tech/vscode-rpgle/issues`);
		}
	}
}

function getFiles(cwd: string, globPath: string): string[] {
	return glob.sync(globPath, {
		cwd,
		absolute: true,
		nocase: true,
	});
}

function error(line: string) {
	process.stdout.write(line + `\n`);
}
