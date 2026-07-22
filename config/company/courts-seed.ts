/**
 * TN + KA courts for Case Register:
 * State → District → City → Court
 * City level is required when that town has its own courts (not only district HQ).
 */
export type CourtSeed = {
  state: string;
  district: string;
  /** Town / city where the court complex sits */
  city: string;
  courtName: string;
};

const TN = "Tamil Nadu";
const KA = "Karnataka";

const STANDARD = [
  "Principal District & Sessions Court",
  "Additional District Court",
  "Sub Court",
  "District Munsif Court",
  "Judicial Magistrate Court (JMFC)",
  "Chief Judicial Magistrate Court",
  "Family Court",
  "MACT (Motor Accident Claims Tribunal)",
  "Special Court (POCSO)",
  "Labour Court",
] as const;

const CITY_EXTRA = [
  "City Civil Court",
  "Assistant City Civil Court",
  "Metropolitan Magistrate Court",
  "Chief Metropolitan Magistrate Court",
  "Small Causes Court",
  "Commercial Court",
] as const;

function pack(
  state: string,
  district: string,
  city: string,
  courts: readonly string[]
): CourtSeed[] {
  return courts.map((courtName) => ({ state, district, city, courtName }));
}

function hq(
  state: string,
  district: string,
  courts: readonly string[] = STANDARD
): CourtSeed[] {
  return pack(state, district, district, courts);
}

function cityCourts(
  state: string,
  district: string,
  city: string,
  courts: readonly string[]
): CourtSeed[] {
  return pack(state, district, city, courts);
}

const TN_DISTRICTS = [
  "Ariyalur",
  "Chengalpattu",
  "Chennai",
  "Coimbatore",
  "Cuddalore",
  "Dharmapuri",
  "Dindigul",
  "Erode",
  "Kallakurichi",
  "Kancheepuram",
  "Kanniyakumari",
  "Karur",
  "Krishnagiri",
  "Madurai",
  "Mayiladuthurai",
  "Nagapattinam",
  "Namakkal",
  "Nilgiris",
  "Perambalur",
  "Pudukkottai",
  "Ramanathapuram",
  "Ranipet",
  "Salem",
  "Sivaganga",
  "Tenkasi",
  "Thanjavur",
  "Theni",
  "Thoothukudi",
  "Tiruchirappalli",
  "Tirunelveli",
  "Tirupathur",
  "Tiruppur",
  "Tiruvallur",
  "Tiruvannamalai",
  "Tiruvarur",
  "Vellore",
  "Viluppuram",
  "Virudhunagar",
] as const;

const KA_DISTRICTS = [
  "Bagalkot",
  "Ballari",
  "Belagavi",
  "Bengaluru Rural",
  "Bengaluru Urban",
  "Bidar",
  "Chamarajanagar",
  "Chikkaballapur",
  "Chikkamagaluru",
  "Chitradurga",
  "Dakshina Kannada",
  "Davangere",
  "Dharwad",
  "Gadag",
  "Hassan",
  "Haveri",
  "Kalaburagi",
  "Kodagu",
  "Kolar",
  "Koppal",
  "Mandya",
  "Mysuru",
  "Raichur",
  "Ramanagara",
  "Shivamogga",
  "Tumakuru",
  "Udupi",
  "Uttara Kannada",
  "Vijayanagara",
  "Vijayapura",
  "Yadgir",
] as const;

/** Districts that also have separate city court complexes */
const TN_MULTI_CITY: Record<string, { city: string; courts: string[] }[]> = {
  Erode: [
    {
      city: "Erode",
      courts: [...STANDARD, ...CITY_EXTRA],
    },
    {
      city: "Gobichettipalayam",
      courts: [
        "District Munsif Court, Gobichettipalayam",
        "JMFC, Gobichettipalayam",
        "Sub Court, Gobichettipalayam",
        "Family Court, Gobichettipalayam",
      ],
    },
    {
      city: "Sathyamangalam",
      courts: [
        "District Munsif Court, Sathyamangalam",
        "JMFC, Sathyamangalam",
      ],
    },
    {
      city: "Nambiyur",
      courts: ["JMFC / Taluk Court, Nambiyur"],
    },
    {
      city: "Bhavani",
      courts: ["District Munsif Court, Bhavani", "JMFC, Bhavani"],
    },
    {
      city: "Perundurai",
      courts: ["JMFC, Perundurai"],
    },
  ],
  Coimbatore: [
    { city: "Coimbatore", courts: [...STANDARD, ...CITY_EXTRA, "Labour Court"] },
    {
      city: "Pollachi",
      courts: ["Sub Court, Pollachi", "District Munsif Court, Pollachi", "JMFC, Pollachi"],
    },
    {
      city: "Tiruppur",
      courts: ["District Court, Tiruppur", "JMFC, Tiruppur"],
    },
    {
      city: "Mettupalayam",
      courts: ["District Munsif Court, Mettupalayam", "JMFC, Mettupalayam"],
    },
  ],
  Chennai: [
    {
      city: "Chennai",
      courts: [
        "Madras High Court (Principal Seat)",
        "Principal District Court, Chennai",
        "City Civil Court — Main (Madras High Court Campus)",
        "City Civil Court — Singaravelar Maligai",
        "City Civil Court — Egmore",
        ...CITY_EXTRA,
        "Family Court",
        "MACT (Motor Accident Claims Tribunal)",
        "Labour Court",
        "Consumer Disputes Redressal Commission",
      ],
    },
  ],
  Madurai: [
    {
      city: "Madurai",
      courts: [
        "Madurai Bench of Madras High Court",
        ...STANDARD,
        ...CITY_EXTRA,
        "Labour Court",
      ],
    },
  ],
  Salem: [
    { city: "Salem", courts: [...STANDARD, ...CITY_EXTRA] },
    {
      city: "Attur",
      courts: ["District Munsif Court, Attur", "JMFC, Attur"],
    },
    {
      city: "Mettur",
      courts: ["JMFC, Mettur"],
    },
  ],
  Tiruchirappalli: [
    { city: "Tiruchirappalli", courts: [...STANDARD, ...CITY_EXTRA] },
    {
      city: "Srirangam",
      courts: ["JMFC, Srirangam"],
    },
  ],
  Kanniyakumari: [
    {
      city: "Nagercoil",
      courts: [
        "Principal District & Sessions Court, Nagercoil",
        ...STANDARD,
        "City Civil Court, Nagercoil",
      ],
    },
    {
      city: "Padmanabhapuram",
      courts: ["District Munsif Court, Padmanabhapuram", "JMFC, Padmanabhapuram"],
    },
  ],
  Tiruppur: [
    { city: "Tiruppur", courts: [...STANDARD, ...CITY_EXTRA] },
    {
      city: "Dharapuram",
      courts: ["District Munsif Court, Dharapuram", "JMFC, Dharapuram"],
    },
    {
      city: "Udumalpet",
      courts: ["JMFC, Udumalpet"],
    },
  ],
  Vellore: [
    { city: "Vellore", courts: [...STANDARD, ...CITY_EXTRA] },
    {
      city: "Gudiyatham",
      courts: ["District Munsif Court, Gudiyatham", "JMFC, Gudiyatham"],
    },
  ],
};

const KA_MULTI_CITY: Record<string, { city: string; courts: string[] }[]> = {
  "Bengaluru Urban": [
    {
      city: "Bengaluru",
      courts: [
        "High Court of Karnataka (Principal Bench)",
        "City Civil Court, Bengaluru",
        "Mayo Hall Court Complex",
        "CMM Courts, Bengaluru",
        "Commercial Court, Bengaluru",
        ...STANDARD,
        ...CITY_EXTRA,
      ],
    },
  ],
  "Bengaluru Rural": [
    { city: "Bengaluru Rural", courts: [...STANDARD] },
    {
      city: "Nelamangala",
      courts: ["JMFC, Nelamangala"],
    },
    {
      city: "Doddaballapur",
      courts: ["JMFC, Doddaballapur"],
    },
  ],
  "Dakshina Kannada": [
    {
      city: "Mangaluru",
      courts: [
        "District Court, Mangaluru",
        "City Civil Court, Mangaluru",
        "Family Court, Mangaluru",
        ...STANDARD,
        ...CITY_EXTRA,
      ],
    },
    {
      city: "Puttur",
      courts: ["JMFC, Puttur", "District Munsif Court, Puttur"],
    },
  ],
  Mysuru: [
    {
      city: "Mysuru",
      courts: ["City Civil Court, Mysuru", ...STANDARD, ...CITY_EXTRA],
    },
  ],
  Dharwad: [
    {
      city: "Hubballi",
      courts: [
        "High Court of Karnataka — Dharwad Bench",
        "District Court, Hubballi-Dharwad",
        "City Civil Court, Hubballi",
        ...STANDARD,
        ...CITY_EXTRA,
      ],
    },
    {
      city: "Dharwad",
      courts: ["District Court, Dharwad", "JMFC, Dharwad", "Family Court"],
    },
  ],
  Kalaburagi: [
    {
      city: "Kalaburagi",
      courts: [
        "High Court of Karnataka — Kalaburagi Bench",
        ...STANDARD,
        ...CITY_EXTRA,
      ],
    },
  ],
  Belagavi: [
    { city: "Belagavi", courts: [...STANDARD, ...CITY_EXTRA] },
  ],
  Udupi: [
    { city: "Udupi", courts: [...STANDARD] },
    {
      city: "Kundapura",
      courts: ["JMFC, Kundapura"],
    },
  ],
};

function buildState(
  state: string,
  districts: readonly string[],
  multi: Record<string, { city: string; courts: string[] }[]>,
  cityDistricts: Set<string>
): CourtSeed[] {
  const rows: CourtSeed[] = [];
  for (const district of districts) {
    const multiCities = multi[district];
    if (multiCities) {
      for (const { city, courts } of multiCities) {
        rows.push(...cityCourts(state, district, city, courts));
      }
      continue;
    }
    const courts = cityDistricts.has(district)
      ? [...STANDARD, ...CITY_EXTRA]
      : [...STANDARD];
    rows.push(...hq(state, district, courts));
  }
  return rows;
}

const TN_CITY_DISTRICTS = new Set([
  "Coimbatore",
  "Madurai",
  "Salem",
  "Tiruchirappalli",
  "Tirunelveli",
  "Tiruppur",
  "Erode",
  "Vellore",
  "Thoothukudi",
]);

const KA_CITY_DISTRICTS = new Set([
  "Mysuru",
  "Belagavi",
  "Kalaburagi",
  "Shivamogga",
  "Tumakuru",
  "Davangere",
]);

export const courtsSeed: CourtSeed[] = [
  ...buildState(TN, TN_DISTRICTS, TN_MULTI_CITY, TN_CITY_DISTRICTS),
  ...buildState(KA, KA_DISTRICTS, KA_MULTI_CITY, KA_CITY_DISTRICTS),
];

export const COURT_STATES = [TN, KA] as const;
