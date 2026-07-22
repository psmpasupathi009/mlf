import { Prisma, type User, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeMobile } from "@/lib/auth/mobile";
import { nextUnitId } from "@/lib/ids";

export class MobileConflictError extends Error {
  constructor(message = "This mobile number is already registered") {
    super(message);
    this.name = "MobileConflictError";
  }
}

export function requireNormalizedMobile(input: string): string {
  const mobile = normalizeMobile(input);
  if (!mobile) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }
  return mobile;
}

export async function findUserByMobile(mobile91: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { mobile: mobile91 } });
}

export async function createUserWithUniqueMobile(input: {
  mobile: string;
  roles: UserRole[];
  name?: string;
  designation?: string;
  createdById?: string;
  isActive?: boolean;
}): Promise<User> {
  const mobile = requireNormalizedMobile(input.mobile);
  const unitId = await nextUnitId("employee");

  try {
    return await prisma.user.create({
      data: {
        unitId,
        mobile,
        roles: input.roles,
        name: input.name,
        designation: input.designation,
        createdById: input.createdById,
        isActive: input.isActive ?? true,
        failedPinAttempts: 0,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MobileConflictError();
    }
    throw error;
  }
}
