import { IBMiMember } from '@halcyontech/vscode-ibmi-types';

import {
	createConnection,
	DidChangeWatchedFilesParams,
	ProposedFeatures,
	_Connection,
	WorkspaceFolder
} from 'vscode-languageserver/node';

import PQueue from 'p-queue';

import { documents, findFile, parser } from './providers';
import { includePath } from './providers/project';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
export const connection: _Connection = createConnection(ProposedFeatures.all);

const queue = new PQueue();

export let watchedFilesChangeEvent: ((params: DidChangeWatchedFilesParams) => void)[] = [];
connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
	watchedFilesChangeEvent.forEach(editEvent => editEvent(params));
})

let validatedUriCache: {[key: string]: string | undefined} = {};
let pendingValidationRequests: {[key: string]: Promise<string | undefined>} = {};

export async function validateUri(stringUri: string, scheme = ``) {
	const cacheKey = `${scheme}:${stringUri}`;

	// First, check validation cache
	if (cacheKey in validatedUriCache) {
		return validatedUriCache[cacheKey];
	}

	// Second, check local cache
	const possibleCachedFile = findFile(stringUri, scheme);
	if (possibleCachedFile) {
		validatedUriCache[cacheKey] = possibleCachedFile;
		return possibleCachedFile;
	}

	// Check if there's already a pending validation for this URI
	if (cacheKey in pendingValidationRequests) {
		return pendingValidationRequests[cacheKey];
	}

	// Create a new validation request
	const validationPromise = (async () => {
		console.log(`Validating file from server: ${stringUri}`);

		try {
			// Reach out to the extension to find it
			const uri: string | undefined = await connection.sendRequest("getUri", stringUri);
			validatedUriCache[cacheKey] = uri;
			return uri;
		} finally {
			// Clean up the pending request
			delete pendingValidationRequests[cacheKey];
		}
	})();

	// Store the promise so concurrent requests can reuse it
	pendingValidationRequests[cacheKey] = validationPromise;

	return validationPromise;
}

export function clearValidatedUriCache(uri?: string) {
	if (uri) {
		// Clear all cache entries that match this URI
		Object.keys(validatedUriCache).forEach(key => {
			if (key.includes(uri) || validatedUriCache[key] === uri) {
				delete validatedUriCache[key];
			}
		});
		// Also clear pending requests
		Object.keys(pendingValidationRequests).forEach(key => {
			if (key.includes(uri)) {
				delete pendingValidationRequests[key];
			}
		});
	} else {
		validatedUriCache = {};
		pendingValidationRequests = {};
	}
}

let fileContentCache: {[uri: string]: string} = {};
let pendingFileRequests: {[uri: string]: Promise<string | undefined>} = {};

export async function getFileRequest(uri: string) {
	// First, check if it's local
	const localCacheDoc = documents.get(uri);
	if (localCacheDoc) return localCacheDoc.getText();

	// Check the cache
	if (fileContentCache[uri]) return fileContentCache[uri];

	// Check if there's already a pending request for this file
	if (uri in pendingFileRequests) {
		return pendingFileRequests[uri];
	}

	// Create a new request
	const requestPromise = (async () => {
		console.log(`Fetching file from server: ${uri}`);

		try {
			// Grab it from remote
			const body: string | undefined = await connection.sendRequest("getFile", uri);
			if (body) {
				// Cache the fetched content
				fileContentCache[uri] = body;
				return body;
			}
			return undefined;
		} finally {
			// Clean up the pending request
			delete pendingFileRequests[uri];
		}
	})();

	// Store the promise so concurrent requests can reuse it
	pendingFileRequests[uri] = requestPromise;

	return requestPromise;
}

export function clearFileContentCache(uri?: string) {
	if (uri) {
		delete fileContentCache[uri];
		delete pendingFileRequests[uri];
	} else {
		fileContentCache = {};
		pendingFileRequests = {};
	}
}

export let resolvedMembers: {[baseUri: string]: {[fileKey: string]: IBMiMember}} = {};
export let resolvedStreamfiles: {[baseUri: string]: {[fileKey: string]: string}} = {};

export async function memberResolve(baseUri: string, member: string, file: string): Promise<IBMiMember|undefined> {
	const fileKey = file+member;

	if (resolvedMembers[baseUri] && resolvedMembers[baseUri][fileKey]) return resolvedMembers[baseUri][fileKey];

	try {
		const resolvedMember = await queue.add(() => {return connection.sendRequest("memberResolve", [member, file])}) as IBMiMember|undefined;
		// const resolvedMember = await connection.sendRequest("memberResolve", [member, file]) as IBMiMember|undefined;

		if (resolvedMember) {
			if (!resolvedMembers[baseUri]) resolvedMembers[baseUri] = {};
			resolvedMembers[baseUri][fileKey] = resolvedMember;
		}

		return resolvedMember;
	} catch (e) {
		console.log(`Member resolve failed.`);
		console.log(JSON.stringify({baseUri, member, file}));
		console.log(e);
	}

	return undefined;
}

export async function streamfileResolve(baseUri: string, base: string[]): Promise<string|undefined> {
	const baseString = base.join(`-`);
	if (resolvedStreamfiles[baseUri] && resolvedStreamfiles[baseUri][baseString]) return resolvedStreamfiles[baseUri][baseString];

	const workspace = await getWorkspaceFolder(baseUri);

	const paths = (workspace ? includePath[workspace.uri] : []) || [];

	try {
		const resolvedPath = await queue.add(() => {return connection.sendRequest("streamfileResolve", [base, paths])}) as string|undefined;
		//  const resolvedPath = await connection.sendRequest("streamfileResolve", [base, paths]) as string|undefined;

		if (resolvedPath) {
			if (!resolvedStreamfiles[baseUri]) resolvedStreamfiles[baseUri] = {};
			resolvedStreamfiles[baseUri][baseString] = resolvedPath;
		}

		return resolvedPath;
	} catch (e) {
		console.log(`Streamfile resolve failed.`);
		console.log(JSON.stringify({baseUri, base, paths}));
		console.log(e);
	}

	return undefined;
}

export function getWorkingDirectory(): Promise<string|undefined> {
	return connection.sendRequest("getWorkingDirectory");
}

export function getObject(objectPath: string): Promise<object[]> {
	return connection.sendRequest("getObject", objectPath);
}

export interface PossibleInclude {
	uri: string;
	relative: string
};

export async function getWorkspaceFolder(baseUri: string) {
	let workspaceFolder: WorkspaceFolder | undefined;

	const workspaceFolders = await connection.workspace.getWorkspaceFolders();

	if (workspaceFolders) {
		workspaceFolder = workspaceFolders.find(folderUri => baseUri.startsWith(folderUri.uri))
	}

	return workspaceFolder
}

export function handleClientRequests() {
	connection.onRequest(`clearTableCache`, () => {
		parser.clearTableCache();
	});

	connection.onRequest(`getCache`, (uri: string) => {
		const doc = parser.getParsedCache(uri);
		if (!doc) return undefined;
		return {
			keyword: doc.keyword,
			parameters: doc.parameters,
			subroutines: doc.subroutines,
			procedures: doc.procedures.map(p => ({
				...p,
				prototype: p.prototype
			})),
			files: doc.files,
			variables: doc.variables,
			structs: doc.structs,
			constants: doc.constants,
			sqlReferences: doc.sqlReferences,
			indicators: doc.indicators,
			tags: doc.tags,
			includes: doc.includes,
		}
	});
}

export interface BindingDirectory {
	lib?: string;
	name: string;
}