/**
 * Command/result types for `UserRepository` — never DTOs, never a Prisma
 * model/enum crossing this boundary. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§1).
 */
export type RoleName = 'CUSTOMER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface CreateUserWithCredentialCommand {
  /** Already trimmed by the caller — the Repository never lower-cases it; `citext` compares case-insensitively in the database. */
  email: string;
  /** Already hashed (bcrypt/argon2) by the caller — the Repository never hashes nor sees the plaintext password. */
  passwordHash: string;
  /** Catalog role names, never IDs — validated by the Repository before any query. */
  roleNames: readonly RoleName[];
}

export interface CreateUserWithAuthIdentityCommand {
  email: string;
  /** Free-form OAuth provider string (e.g. 'google'). */
  provider: string;
  providerAccountId: string;
  roleNames: readonly RoleName[];
}

export interface UserAggregateResult {
  id: string;
  email: string;
  status: UserStatus;
  version: number;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Never includes passwordHash, tokens, or any Credential/AuthIdentity
  // field, nor CustomerProfile/AgentProfile/AgentLicense data — those
  // remain outside this aggregate's current operations (see
  // user.repository.ts module doc).
}
