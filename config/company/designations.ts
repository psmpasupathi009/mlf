import type { UserRole } from "@prisma/client";

export const DESIGNATIONS = [
  "Advocate",
  "Clerk",
  "Typist",
  "Administration",
  "Driver",
  "Accountant",
] as const;

export type Designation = (typeof DESIGNATIONS)[number];

/** Designation → default roles prefills on employee create. */
export const designationDefaultRoles: Record<Designation, UserRole[]> = {
  Advocate: ["advocate"],
  Clerk: ["staff"],
  Typist: ["staff"],
  Administration: ["sub_admin"],
  Driver: ["staff"],
  Accountant: ["accountant"],
};

export function isDesignation(value: string): value is Designation {
  return (DESIGNATIONS as readonly string[]).includes(value);
}
