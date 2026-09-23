import { describe, expect, it } from 'vitest';
import { PersistenceInvariantError } from '../persistence/errors';
import {
  assertValidCreateAddressInput,
  assertValidCreatePropertyCommand,
  type CreateAddressInput,
  type CreatePropertyCommand,
} from './property.types';

function validAddress(
  overrides: Partial<CreateAddressInput> = {},
): CreateAddressInput {
  return {
    addressLine1: '123 Main St',
    countryCode: 'US',
    regionCode: 'CA',
    locality: 'San Francisco',
    postalCode: '94105',
    latitude: 37.7749,
    longitude: -122.4194,
    ...overrides,
  };
}

function validCommand(
  overrides: Partial<CreatePropertyCommand> = {},
): CreatePropertyCommand {
  return {
    workspaceId: 'workspace-1',
    responsibleAgentUserId: 'agent-1',
    title: 'Cozy Loft',
    price: '250000.50',
    currency: 'USD',
    address: validAddress(),
    ...overrides,
  };
}

function expectInvalidPropertyInput(fn: () => void): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PersistenceInvariantError);
  expect((caught as PersistenceInvariantError).reason).toBe(
    'INVALID_PROPERTY_INPUT',
  );
}

describe('assertValidCreatePropertyCommand / assertValidCreateAddressInput', () => {
  it('accepts a fully valid command without throwing', () => {
    expect(() =>
      assertValidCreatePropertyCommand(validCommand()),
    ).not.toThrow();
  });

  it('rejects currency that is not exactly three uppercase letters', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreatePropertyCommand(validCommand({ currency: 'usd' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreatePropertyCommand(validCommand({ currency: 'US' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreatePropertyCommand(validCommand({ currency: 'USDD' })),
    );
  });

  it('rejects countryCode that is not exactly two uppercase letters', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ countryCode: 'us' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ countryCode: 'USA' })),
    );
  });

  it('rejects addressLine1 that is empty or has leading/trailing whitespace', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ addressLine1: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(
        validAddress({ addressLine1: ' 123 Main St' }),
      ),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(
        validAddress({ addressLine1: '123 Main St ' }),
      ),
    );
  });

  it('accepts addressLine2 when omitted, rejects it when provided but blank or untrimmed', () => {
    expect(() => assertValidCreateAddressInput(validAddress())).not.toThrow();
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ addressLine2: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ addressLine2: ' Suite 4' })),
    );
    expect(() =>
      assertValidCreateAddressInput(validAddress({ addressLine2: 'Suite 4' })),
    ).not.toThrow();
  });

  it('accepts district when omitted, rejects it when provided but blank or untrimmed', () => {
    expect(() => assertValidCreateAddressInput(validAddress())).not.toThrow();
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ district: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ district: 'Downtown ' })),
    );
    expect(() =>
      assertValidCreateAddressInput(validAddress({ district: 'Downtown' })),
    ).not.toThrow();
  });

  it('rejects regionCode that is empty or untrimmed', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ regionCode: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ regionCode: ' CA' })),
    );
  });

  it('rejects locality that is empty or untrimmed', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ locality: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(
        validAddress({ locality: 'San Francisco ' }),
      ),
    );
  });

  it('rejects postalCode that is empty or untrimmed', () => {
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ postalCode: '' })),
    );
    expectInvalidPropertyInput(() =>
      assertValidCreateAddressInput(validAddress({ postalCode: ' 94105' })),
    );
  });

  it('never normalizes: does not trim or throw away the exact rejected value, and never lowercases/uppercases silently', () => {
    // The guard only validates — it must never mutate `cmd`/`address` in
    // place, and a caller who passes a lowercase currency must see it
    // rejected, never silently accepted after an implicit toUpperCase().
    const command = validCommand({ currency: 'usd' });
    expect(() => assertValidCreatePropertyCommand(command)).toThrow();
    expect(command.currency).toBe('usd');
  });

  it('does not verify that the ISO code actually exists — any two/three uppercase letters pass format validation', () => {
    expect(() =>
      assertValidCreateAddressInput(validAddress({ countryCode: 'ZZ' })),
    ).not.toThrow();
    expect(() =>
      assertValidCreatePropertyCommand(validCommand({ currency: 'XXX' })),
    ).not.toThrow();
  });
});
