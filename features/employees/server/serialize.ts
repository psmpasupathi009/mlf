import type { User } from "@prisma/client";
import { displayMobile } from "@/lib/auth/mobile";

export type EmployeeSummary = {
  unitId: string;
  name: string | null;
  mobile: string;
  roles: string[];
  designation: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  hasPin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Never leak Mongo _id or pinHash — public shape only. */
export function toEmployeeSummary(user: User): EmployeeSummary {
  return {
    unitId: user.unitId,
    name: user.name,
    mobile: displayMobile(user.mobile),
    roles: user.roles,
    designation: user.designation,
    email: user.email,
    address: user.address,
    isActive: user.isActive,
    hasPin: Boolean(user.pinHash),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
