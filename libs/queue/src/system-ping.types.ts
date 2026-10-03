/**
 * Payload of the technical `system.ping` job. Kept deliberately minimal —
 * this job carries no business data, only what is needed to prove the
 * API → Redis → worker path end to end.
 */
export interface SystemPingJobPayload {
  /** ISO 8601 timestamp of when the producer published the job. */
  publishedAt: string;
  /**
   * Correlation ID for this job. Always present — mirrors
   * `X-Request-Id`/`requestId` of the originating HTTP request when the
   * job was published from within a real request (no such flow exists
   * yet in this phase, since there is no HTTP endpoint for this job);
   * otherwise the producer generates a new UUID itself (the same
   * `randomUUID()` utility already used by the API's request-id
   * middleware), so the job always carries a traceable correlation ID
   * even for a standalone smoke-test run. See
   * docs/TARGET_ARCHITECTURE.md, section 4 ("Correlation ID").
   */
  requestId: string;
}
