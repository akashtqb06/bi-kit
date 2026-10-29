import { describe, it, expect } from "vitest";
import { can, assertCan, NotFoundError } from "./policy";

describe("Finance Resource Policy (Owner-Only Enforced)", () => {
  const member1 = { id: "user_member_1", role: "member" };
  const member2 = { id: "user_member_2", role: "member" };
  const admin = { id: "user_admin", role: "admin" };

  const financeTypes = [
    "fin_account",
    "fin_category",
    "fin_transaction",
    "fin_valuation",
    "fin_budget",
    "fin_recurring_rule",
  ] as const;

  for (const fType of financeTypes) {
    describe(`Resource type: ${fType}`, () => {
      it("allows owner (member) to view, edit, delete, and share", () => {
        const resource = { type: fType, id: "res_1", ownerId: member1.id };
        expect(can(member1, "view", resource)).toBe(true);
        expect(can(member1, "edit", resource)).toBe(true);
        expect(can(member1, "delete", resource)).toBe(true);
        expect(can(member1, "share", resource)).toBe(true);
        expect(() => assertCan(member1, "view", resource)).not.toThrow();
        expect(() => assertCan(member1, "edit", resource)).not.toThrow();
      });

      it("denies another member from viewing, editing, or deleting", () => {
        const resource = { type: fType, id: "res_1", ownerId: member1.id };
        expect(can(member2, "view", resource)).toBe(false);
        expect(can(member2, "edit", resource)).toBe(false);
        expect(can(member2, "delete", resource)).toBe(false);
        // assertCan throws NotFoundError when view is denied to avoid leaking existence
        expect(() => assertCan(member2, "view", resource)).toThrow(NotFoundError);
      });

      it("STRICT: denies admin from viewing, editing, or deleting another user's finance resource (no admin override)", () => {
        const resource = { type: fType, id: "res_1", ownerId: member1.id };
        expect(can(admin, "view", resource)).toBe(false);
        expect(can(admin, "edit", resource)).toBe(false);
        expect(can(admin, "delete", resource)).toBe(false);
        expect(can(admin, "share", resource)).toBe(false);
        expect(() => assertCan(admin, "view", resource)).toThrow(NotFoundError);
      });

      it("allows admin to view and edit their OWN finance resource", () => {
        const adminResource = { type: fType, id: "res_admin", ownerId: admin.id };
        expect(can(admin, "view", adminResource)).toBe(true);
        expect(can(admin, "edit", adminResource)).toBe(true);
        expect(can(admin, "delete", adminResource)).toBe(true);
        expect(() => assertCan(admin, "view", adminResource)).not.toThrow();
      });

      it("handles create permissions correctly", () => {
        // Own resource creation
        expect(can(member1, "create", { type: fType, ownerId: member1.id })).toBe(true);
        expect(can(member1, "create", { type: fType })).toBe(true);
        // Cannot create on behalf of another user
        expect(can(member1, "create", { type: fType, ownerId: member2.id })).toBe(false);
        // Admin cannot create for another user either
        expect(can(admin, "create", { type: fType, ownerId: member1.id })).toBe(false);
        expect(can(admin, "create", { type: fType, ownerId: admin.id })).toBe(true);
      });
    });
  }

  describe("Non-finance resources preserve standard admin override", () => {
    it("allows admin to access member's workbook", () => {
      const workbookResource = { type: "workbook" as const, id: "wb_1", ownerId: member1.id };
      expect(can(admin, "view", workbookResource)).toBe(true);
      expect(can(admin, "edit", workbookResource)).toBe(true);
      expect(can(admin, "delete", workbookResource)).toBe(true);
    });

    it("denies member2 from accessing member1's workbook", () => {
      const workbookResource = { type: "workbook" as const, id: "wb_1", ownerId: member1.id };
      expect(can(member2, "view", workbookResource)).toBe(false);
    });
  });
});
