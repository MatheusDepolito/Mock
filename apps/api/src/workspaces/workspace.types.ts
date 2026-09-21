/**
 * Command/result types for `WorkspaceRepository` — never DTOs, never a
 * Prisma model/enum crossing this boundary. See
 * docs/adr/008-runtime-persistence-and-repositories.md (§1).
 */
export type WorkspaceType = 'INDIVIDUAL' | 'BROKERAGE';
export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface CreateIndividualWorkspaceCommand {
  /** Verified inside the transaction — see §4.2. */
  ownerUserId: string;
  /** Display/business name. Already trimmed by the caller. */
  name: string;
  /** URL slug, already trimmed; `citext` guarantees case-insensitive uniqueness in the database. */
  slug: string;
}

export interface CreateBrokerageWorkspaceCommand {
  ownerUserId: string;
  name: string;
  slug: string;
  /** Legal name — becomes `Brokerage.legalName`. */
  brokerageLegalName: string;
  /** When true, requires an existing AgentProfile for ownerUserId, and the Repository also creates AGENT + WorkspaceAgent ACTIVE — see §4.2. */
  ownerActsAsAgent: boolean;
}

export interface WorkspaceRecord {
  id: string;
  type: WorkspaceType;
  name: string;
  slug: string;
  ownerUserId: string;
  status: WorkspaceStatus;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
