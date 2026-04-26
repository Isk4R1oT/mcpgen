// Idempotency-key validators across all 4 surfaces (FND-14 / D-11).
// Each surface accepts a distinct shape; cross-prefix collisions are impossible
// by construction (`gen_*`, `deploy_*`, composite-shape Stripe Meters key).

import { describe, expect, it } from 'vitest';

import {
  DEPLOY_ID_REGEX,
  GEN_ID_REGEX,
  STRIPE_METERS_KEY_REGEX,
  TOOL_NAME_REGEX,
  ULID_REGEX,
  validateCfWorkerName,
  validateIdempotencyKey,
  validateStripeMetersKey,
  validateUlid,
} from '../src/idempotency.js';

const VALID_ULID = '01HXP3J8Y0K9V8R7N6M5K4K3J2'; // 26 chars, Crockford base32 (no I/L/O/U)
const VALID_UUID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';

describe('ULID regex', () => {
  it('accepts a 26-char Crockford base32 string', () => {
    expect(ULID_REGEX.test(VALID_ULID)).toBe(true);
    expect(validateUlid(VALID_ULID)).toBe(true);
  });

  it('rejects 25-char string', () => {
    expect(validateUlid(VALID_ULID.slice(1))).toBe(false);
  });

  it('rejects 27-char string', () => {
    expect(validateUlid(`${VALID_ULID}A`)).toBe(false);
  });

  it('rejects forbidden Crockford chars (I, L, O, U)', () => {
    expect(validateUlid('I'.repeat(26))).toBe(false);
    expect(validateUlid('L'.repeat(26))).toBe(false);
    expect(validateUlid('O'.repeat(26))).toBe(false);
    expect(validateUlid('U'.repeat(26))).toBe(false);
  });

  it('rejects lowercase letters', () => {
    expect(validateUlid(VALID_ULID.toLowerCase())).toBe(false);
  });
});

describe('Surface 1+2: BFF Idempotency-Key + Inngest job dedup (gen_${ULID})', () => {
  it('accepts a valid gen_ prefixed ULID', () => {
    expect(GEN_ID_REGEX.test(`gen_${VALID_ULID}`)).toBe(true);
    expect(validateIdempotencyKey(`gen_${VALID_ULID}`)).toBe(true);
  });

  it('rejects without `gen_` prefix', () => {
    expect(validateIdempotencyKey(VALID_ULID)).toBe(false);
  });

  it('rejects with `deploy_` prefix (cross-surface guard)', () => {
    expect(validateIdempotencyKey(`deploy_${VALID_ULID}`)).toBe(false);
  });

  it('rejects malformed ULID body', () => {
    expect(validateIdempotencyKey('gen_too_short')).toBe(false);
    expect(validateIdempotencyKey('gen_lowercase_letters_inside')).toBe(false);
  });
});

describe('Surface 4: CF dispatch tenant Worker name (deploy_${UUID})', () => {
  it('accepts a valid deploy_ prefixed UUID', () => {
    expect(DEPLOY_ID_REGEX.test(`deploy_${VALID_UUID}`)).toBe(true);
    expect(validateCfWorkerName(`deploy_${VALID_UUID}`)).toBe(true);
  });

  it('rejects UUID without dashes', () => {
    expect(validateCfWorkerName(`deploy_${VALID_UUID.replace(/-/g, '')}`)).toBe(false);
  });

  it('rejects without `deploy_` prefix', () => {
    expect(validateCfWorkerName(VALID_UUID)).toBe(false);
  });

  it('rejects with `gen_` prefix (cross-surface guard)', () => {
    expect(validateCfWorkerName(`gen_${VALID_ULID}`)).toBe(false);
  });
});

describe('Surface 3: Stripe Meters dedup key (composite shape)', () => {
  const validKey = `${VALID_UUID}_2026-04-26T15:00_charges_create`;

  it('accepts the documented shape ${deployment_id}_${minute_bucket}_${tool_name}', () => {
    expect(STRIPE_METERS_KEY_REGEX.test(validKey)).toBe(true);
    expect(validateStripeMetersKey(validKey)).toBe(true);
  });

  it('rejects a missing minute bucket segment', () => {
    expect(validateStripeMetersKey(`${VALID_UUID}_charges_create`)).toBe(false);
  });

  it('rejects a non-UUID deployment_id segment', () => {
    expect(validateStripeMetersKey(`not-a-uuid_2026-04-26T15:00_charges_create`)).toBe(false);
  });

  it('rejects an uppercase tool_name segment', () => {
    expect(validateStripeMetersKey(`${VALID_UUID}_2026-04-26T15:00_Charges_Create`)).toBe(false);
  });

  it('rejects a minute_bucket with seconds (must be minute granularity)', () => {
    expect(validateStripeMetersKey(`${VALID_UUID}_2026-04-26T15:00:00_charges_create`)).toBe(false);
  });
});

describe('TOOL_NAME_REGEX', () => {
  it('accepts canonical snake_case names', () => {
    expect(TOOL_NAME_REGEX.test('charges_create')).toBe(true);
    expect(TOOL_NAME_REGEX.test('search')).toBe(true);
    expect(TOOL_NAME_REGEX.test('list_objects')).toBe(true);
  });

  it('rejects uppercase, leading digit, or > 64 chars', () => {
    expect(TOOL_NAME_REGEX.test('Charges_Create')).toBe(false);
    expect(TOOL_NAME_REGEX.test('1charge')).toBe(false);
    expect(TOOL_NAME_REGEX.test('a' + 'b'.repeat(64))).toBe(false);
  });
});
