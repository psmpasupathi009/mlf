export function normalizeMobile(input: string | null | undefined): string | null {
  if (!input) return null;
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

function envMobileCandidates(): string[] {
  return [
    process.env.SUPER_ADMIN_MOBILE,
    process.env.ADMIN_MOBILE,
    process.env.ADMIN_MOBILE_1,
  ].filter((v): v is string => Boolean(v?.trim()));
}

/** Every bootstrap admin mobile from env (super-admin + legacy admin). */
export function getEnvAdminMobiles(): string[] {
  const out = new Set<string>();
  for (const raw of envMobileCandidates()) {
    const n = normalizeMobile(raw);
    if (n) out.add(n);
  }
  return [...out];
}

/** Primary bootstrap mobile (`SUPER_ADMIN_MOBILE`, then `ADMIN_MOBILE`). */
export function getEnvAdminMobile(): string | null {
  return getEnvAdminMobiles()[0] ?? null;
}

/** True when this mobile is an env bootstrap admin (super-admin or office admin). */
export function isEnvAdminMobile(mobile91: string): boolean {
  return getEnvAdminMobiles().includes(mobile91);
}
