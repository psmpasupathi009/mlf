export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) {
    return digits;
  }

  return null;
}

export function displayMobile(mobile91: string): string {
  return mobile91.startsWith("91") ? mobile91.slice(2) : mobile91;
}

function envAdminMobiles(): {
  admin: string | null;
  subAdmin: string | null;
} {
  const admin = normalizeMobile(process.env.ADMIN_MOBILE_1 ?? "");
  const subAdmin = normalizeMobile(process.env.ADMIN_MOBILE_2 ?? "");

  if (admin && subAdmin && admin === subAdmin) {
    console.error(
      "[auth] ADMIN_MOBILE_1 and ADMIN_MOBILE_2 must be unique different numbers"
    );
    return { admin, subAdmin: null };
  }

  return { admin, subAdmin };
}

export function getAdminRoleForMobile(
  mobile91: string
): "admin" | "sub_admin" | null {
  const { admin, subAdmin } = envAdminMobiles();
  if (admin && mobile91 === admin) return "admin";
  if (subAdmin && mobile91 === subAdmin) return "sub_admin";
  return null;
}

export function getAdminRolesForMobile(
  mobile91: string
): ("admin" | "sub_admin")[] {
  const role = getAdminRoleForMobile(mobile91);
  return role ? [role] : [];
}

export function isEnvAdminMobile(mobile91: string): boolean {
  return getAdminRoleForMobile(mobile91) !== null;
}
