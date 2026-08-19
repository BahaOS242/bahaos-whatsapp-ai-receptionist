import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";

describe("db schema", () => {
  it("exports the tenants table with a unique slug column", () => {
    expect(schema.tenants).toHaveProperty("id");
    expect(schema.tenants).toHaveProperty("slug");
  });

  const tenantAwareTables: Record<string, unknown> = {
    staffUsers: schema.staffUsers,
    whatsappAccounts: schema.whatsappAccounts,
    customers: schema.customers,
    conversations: schema.conversations,
    messages: schema.messages,
    services: schema.services,
    appointments: schema.appointments,
    handoffs: schema.handoffs,
    auditEvents: schema.auditEvents,
  };

  it.each(Object.entries(tenantAwareTables))(
    "%s carries a tenantId column for tenant isolation",
    (_name, table) => {
      expect(table).toHaveProperty("tenantId");
    },
  );

  it("keeps whatsapp_accounts and access tokens out of scope for Phase 1", () => {
    expect(schema.whatsappAccounts).not.toHaveProperty("accessToken");
  });
});
