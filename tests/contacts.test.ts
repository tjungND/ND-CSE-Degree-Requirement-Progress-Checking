// Sheet-driven contacts (2026-09-04): the Parameters tab's contact_* keys
// overwrite the baked-in names/emails; missing or blank keys keep the
// fallback. contacts.ts touches the DOM only inside render functions, so the
// override logic itself runs fine under node.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Parameters } from '../src/data/types.ts';
import { CONTACTS, DGS, GRAD_ADMIN, applyContactOverrides } from '../src/ui/contacts.ts';

function paramsWith(entries: Record<string, string>): Parameters {
  const raw = new Map(Object.entries(entries).map(([k, v], i) => [k, { value: v, section: '', row: i + 2 }]));
  return { raw } as unknown as Parameters;
}

describe('sheet-driven contacts', () => {
  it('overrides names and emails from contact_* keys; blank/missing keep the fallback', () => {
    const before = CONTACTS.map((c) => ({ name: c.name, email: c.email }));
    try {
      applyContactOverrides(
        paramsWith({
          contact_dgs_name: 'Jane Future',
          contact_dgs_email: 'jfuture@nd.edu',
          contact_adgs_email: '   ', // blank → fallback stays
          contact_grad_admin_name: 'Pat Admin',
        }),
      );
      assert.equal(DGS.name, 'Jane Future');
      assert.equal(DGS.email, 'jfuture@nd.edu');
      assert.equal(CONTACTS[1]!.name, before[1]!.name); // no key → unchanged
      assert.equal(CONTACTS[1]!.email, before[1]!.email); // blank → unchanged
      assert.equal(GRAD_ADMIN.name, 'Pat Admin');
      assert.equal(GRAD_ADMIN.email, before[2]!.email);
      // DGS/GRAD_ADMIN are references into CONTACTS — both views must agree.
      assert.equal(CONTACTS[0]!.email, 'jfuture@nd.edu');
    } finally {
      // Restore so test order never matters.
      CONTACTS.forEach((c, i) => {
        c.name = before[i]!.name;
        c.email = before[i]!.email;
      });
    }
  });
});
