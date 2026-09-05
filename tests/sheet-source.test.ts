// The rules-spreadsheet link shown on both pages (2026-09-04) comes from
// data/sheet-urls.json `sheet_edit_url`. This locks two things a future edit
// could quietly break: the link is the sheet's human (edit/view) address — never
// one of the published-CSV addresses the app fetches, which open as a raw CSV
// download — and the footer text keeps its faculty-only promise.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SHEET_EDIT_URL, SHEET_NAME } from '../src/ui/sheet-source.ts';

describe('rules-spreadsheet link', () => {
  it('is the human edit/view link of a Google Sheet, not a published-CSV link', () => {
    assert.match(SHEET_EDIT_URL, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}\/edit/);
    assert.doesNotMatch(SHEET_EDIT_URL, /\/d\/e\/|output=csv|\/pub\b/);
  });

  it('matches data/sheet-urls.json exactly (the one place the sheet addresses live)', () => {
    const json = JSON.parse(readFileSync(new URL('../data/sheet-urls.json', import.meta.url), 'utf8'));
    assert.equal(SHEET_EDIT_URL, json.sheet_edit_url);
    // The published-CSV links belong to the same spreadsheet family; the human
    // link must not be one of them by mistake.
    for (const key of ['courses', 'parameters', 'categories', 'external']) {
      assert.notEqual(SHEET_EDIT_URL, json[key]);
    }
  });

  it('names the sheet as it appears in Google Drive', () => {
    assert.equal(SHEET_NAME, 'CSE-Degree-Checking-Rules'); // renamed 2026-09-05 (DGS)
  });
});
