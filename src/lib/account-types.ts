export const roles = ["OWNER", "ADMIN", "COACH"] as const;
export type UserRole = (typeof roles)[number];
export const roleLabels: Record<UserRole, string> = { OWNER: "Owner / Super Admin", ADMIN: "Admin Stok", COACH: "Coach / Operator" };
export type AppUser = {
  id: string; name: string; email: string; role: UserRole; status: "ACTIVE" | "DISABLED";
  avatarUrl: string | null; lastLoginAt: string | null; createdAt: string; linked: boolean;
};
export type Actor = Pick<AppUser, "id" | "name" | "role">;
export const isStaff = (user: Pick<AppUser, "role">) => user.role === "OWNER" || user.role === "ADMIN";
export type AuditEvent = { id: string; actorName: string; action: string; entityType: string; entityId: string; reason: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string };
