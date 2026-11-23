import type { NotesConnector } from './kit.ts';
import granola from './granola.ts';

// Every notes app Cueboard can read from. Add yours here, in the order people should see them.
export const NOTES_APPS: NotesConnector[] = [granola];
