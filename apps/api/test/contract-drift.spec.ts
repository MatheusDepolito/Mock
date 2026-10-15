import { describe, expect, it } from 'vitest';
import {
  Controller,
  Get,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { applyHttpSetup } from '../src/app/configure-app';
import { createSwaggerDocument } from '../src/app/swagger';
import { compareContract } from '../src/contract/compare-contract';
import { serializeOpenApi } from '../src/contract/serialize-openapi';
import { TEST_SERVER_CONFIG } from './support/create-test-app';

/**
 * Pipeline drift proof (ADR 009, D17): the same generation path used by the
 * contract tooling (`applyHttpSetup` + `createSwaggerDocument`) produces a
 * different document when a DTO changes, and the byte comparison notices.
 * Everything is defined inside this test; no repository file is touched.
 */
function makeDriftController(withExtraProperty: boolean): Type<unknown> {
  class DriftDto {
    @ApiProperty({ type: String })
    name!: string;
  }
  if (withExtraProperty) {
    ApiProperty({ type: Number })(DriftDto.prototype, 'extra');
  }

  @Controller('drift')
  class DriftController {
    @Get()
    @ApiOkResponse({ type: DriftDto })
    get(): DriftDto {
      return { name: 'x' };
    }
  }

  return DriftController;
}

async function documentFor(withExtraProperty: boolean): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    controllers: [makeDriftController(withExtraProperty)],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();

  try {
    applyHttpSetup(app, TEST_SERVER_CONFIG);
    return serializeOpenApi(createSwaggerDocument(app));
  } finally {
    await app.close();
  }
}

describe('contract drift through the generation pipeline', () => {
  it('produces identical bytes for the same DTO', async () => {
    const first = await documentFor(false);
    const second = await documentFor(false);

    expect(first).toBe(second);
    expect(compareContract(first, second)).toEqual({ equal: true });
  });

  it('produces different bytes when a DTO gains a property, and the comparison reports it', async () => {
    const before = await documentFor(false);
    const after = await documentFor(true);

    expect(before).not.toBe(after);
    expect(before).toContain('/api/v1/drift');
    expect(after).toContain('"extra"');
    expect(before).not.toContain('"extra"');

    const comparison = compareContract(before, after);
    expect(comparison.equal).toBe(false);
    if (!comparison.equal) {
      expect(comparison.difference.kind).toBe('content');
      expect(comparison.difference.line).toBeGreaterThan(1);
    }
  });
});
