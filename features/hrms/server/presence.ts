import { prisma } from "@/lib/db/prisma";
import { displayMobile } from "@/lib/auth/mobile";
import { userPhotoUrl } from "@/lib/auth/user-photo";
import { personDisplayName } from "@/shared/lib/person";
import {
  derivePresenceStatus,
  type PresenceStatus,
} from "@/features/hrms/lib/status";

export type { PresenceStatus };

export type PresencePerson = {
  unitId: string;
  name: string | null;
  displayName: string;
  mobile: string;
  photoUrl?: string;
  designation: string | null;
  roles: string[];
  status: PresenceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  leaveUnitId: string | null;
};

export type PresenceCounts = {
  total: number;
  present: number;
  out: number;
  onLeave: number;
  absent: number;
};

export type PresenceBoard = {
  date: string;
  people: PresencePerson[];
  counts: PresenceCounts;
};

const STATUS_RANK: Record<PresenceStatus, number> = {
  absent: 0,
  on_leave: 1,
  out: 2,
  in: 3,
};

export async function buildPresenceBoard(dateKey: string): Promise<PresenceBoard> {
  const staff = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      unitId: true,
      name: true,
      mobile: true,
      photoKey: true,
      designation: true,
      roles: true,
    },
    orderBy: { name: "asc" },
  });

  const userIds = staff.map((s) => s.id);
  const unitIds = staff.map((s) => s.unitId);

  const [attendance, leaves] = await Promise.all([
    userIds.length
      ? prisma.attendance.findMany({
          where: { date: dateKey, userId: { in: userIds } },
          select: {
            userId: true,
            checkInAt: true,
            checkOutAt: true,
          },
        })
      : Promise.resolve([]),
    unitIds.length
      ? prisma.leaveRequest.findMany({
          where: {
            status: "approved",
            userUnitId: { in: unitIds },
            fromDate: { lte: dateKey },
            toDate: { gte: dateKey },
          },
          select: { unitId: true, userUnitId: true },
        })
      : Promise.resolve([]),
  ]);

  const attByUser = new Map(attendance.map((a) => [a.userId, a]));
  const leaveByUnit = new Map(leaves.map((l) => [l.userUnitId, l.unitId]));

  const people: PresencePerson[] = staff.map((s) => {
    const mobile = displayMobile(s.mobile);
    const displayName = personDisplayName({
      name: s.name,
      mobile,
      unitId: s.unitId,
    });
    const leaveUnitId = leaveByUnit.get(s.unitId) ?? null;
    const att = attByUser.get(s.id);
    const status = derivePresenceStatus({
      onApprovedLeave: Boolean(leaveUnitId),
      checkInAt: att?.checkInAt,
      checkOutAt: att?.checkOutAt,
    });

    return {
      unitId: s.unitId,
      name: s.name,
      displayName,
      mobile,
      photoUrl: userPhotoUrl(s.unitId, Boolean(s.photoKey)),
      designation: s.designation,
      roles: s.roles,
      status,
      checkInAt: att?.checkInAt ? att.checkInAt.toISOString() : null,
      checkOutAt: att?.checkOutAt ? att.checkOutAt.toISOString() : null,
      leaveUnitId,
    };
  });

  people.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    return a.displayName.localeCompare(b.displayName);
  });

  const counts: PresenceCounts = {
    total: people.length,
    present: people.filter((p) => p.status === "in").length,
    out: people.filter((p) => p.status === "out").length,
    onLeave: people.filter((p) => p.status === "on_leave").length,
    absent: people.filter((p) => p.status === "absent").length,
  };

  return { date: dateKey, people, counts };
}
