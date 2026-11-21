import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFieldPack } from '../scripts/validate-field-pack.mjs';

function validFixtures() {
  return {
    field: {
      schema_version: 1,
      id: 'computer-vision',
      slug: 'computer-vision',
      name_zh: '计算机视觉',
      name_en: 'Computer Vision',
      status: 'active',
    },
    venueDocument: {
      schema_version: 1,
      field_id: 'computer-vision',
      venues: [
        {
          id: 'cvpr',
          slug: 'cvpr',
          name: 'IEEE/CVF Conference on Computer Vision and Pattern Recognition',
          short_name: 'CVPR',
          type: 'conference',
          official_url: 'https://cvpr.thecvf.com/',
          field_ids: ['computer-vision'],
          evidence: [
            {
              url: 'https://cvpr.thecvf.com/',
              last_verified_at: '2026-11-20',
            },
          ],
        },
      ],
    },
  };
}

test('valid field pack returns no errors', () => {
  const { field, venueDocument } = validFixtures();
  assert.deepEqual(validateFieldPack(field, venueDocument), []);
});

test('duplicate venue id returns a readable error', () => {
  const { field, venueDocument } = validFixtures();
  const duplicate = structuredClone(venueDocument.venues[0]);
  duplicate.slug = 'cvpr-duplicate';
  venueDocument.venues.push(duplicate);

  const errors = validateFieldPack(field, venueDocument);
  assert.ok(errors.some((error) => error.includes('duplicate id: cvpr')));
});

test('non-HTTPS official URL returns a readable error', () => {
  const { field, venueDocument } = validFixtures();
  venueDocument.venues[0].official_url = 'http://cvpr.thecvf.com/';

  const errors = validateFieldPack(field, venueDocument);
  assert.ok(errors.some((error) => error.includes('official_url must be a valid HTTPS URL')));
});

test('venue outside the current field returns a readable error', () => {
  const { field, venueDocument } = validFixtures();
  venueDocument.venues[0].field_ids = ['robotics'];

  const errors = validateFieldPack(field, venueDocument);
  assert.ok(errors.some((error) => error.includes('field_ids must include field.id')));
});
