/**
 * Office roster from staffs & court details.pdf + admin roles.
 * Mobiles are placeholders (9876502xxx) — replace before production seed.
 */
import type { DefaultCourt } from "@/lib/hearings/court-key";

const TN = "Tamil Nadu";
const ER = "Erode";

function court(
  city: string,
  courtName: string,
  district = ER,
  state = TN
): DefaultCourt {
  return { state, district, city, courtName };
}

export type OfficeRosterRow = {
  name: string;
  designation: string;
  mobile: string;
  /** Extra roles beyond designation defaults (e.g. force admin). */
  forceRoles?: ("admin" | "sub_admin" | "advocate" | "staff" | "accountant")[];
  defaultCourts: DefaultCourt[];
};

export const OFFICE_ROSTER: OfficeRosterRow[] = [
  {
    name: "Senniyappan M",
    designation: "Managing Partner",
    mobile: "9876502001",
    forceRoles: ["admin", "advocate"],
    defaultCourts: [
      court("Gobichettipalayam", "District Munsif Court, Gobichettipalayam"),
    ],
  },
  {
    name: "A. Ajithkumar",
    designation: "Partner",
    mobile: "9876502002",
    forceRoles: ["sub_admin", "advocate"],
    defaultCourts: [
      court("Gobichettipalayam", "District Munsif Court, Gobichettipalayam"),
    ],
  },
  {
    name: "Thilagavathi",
    designation: "Accountant",
    mobile: "9876502003",
    forceRoles: ["accountant"],
    defaultCourts: [],
  },
  {
    name: "M. Surya",
    designation: "HR Manager",
    mobile: "9876502004",
    forceRoles: ["sub_admin", "advocate"],
    defaultCourts: [
      court("Erode", "Principal District Court, Erode"),
      court("Erode", "Mahila Court, Erode"),
      court("Erode", "Principal District Munsif Court, Erode"),
      court("Erode", "Principal District Subordinate Court, Erode"),
      court("Erode", "Judicial Magistrate Court No.3, Erode"),
      court("Erode", "Family Court, Erode"),
      court("Erode", "Employee Compensation Court, Erode"),
    ],
  },
  {
    name: "G.V. Airal",
    designation: "Advocate",
    mobile: "9876502005",
    defaultCourts: [
      court(
        "Gobichettipalayam",
        "III-Additional District Sessions Court, Gobichettipalayam"
      ),
    ],
  },
  {
    name: "D. Subhakannan",
    designation: "Advocate",
    mobile: "9876502006",
    defaultCourts: [
      court("Gobichettipalayam", "Subordinate Court, Gobichettipalayam"),
    ],
  },
  {
    name: "M. Dineshkumar",
    designation: "Advocate",
    mobile: "9876502007",
    defaultCourts: [
      court(
        "Gobichettipalayam",
        "Judicial Magistrate Court No.I, Gobichettipalayam"
      ),
    ],
  },
  {
    name: "J. Dhivyabharathi",
    designation: "Advocate",
    mobile: "9876502008",
    defaultCourts: [
      court(
        "Gobichettipalayam",
        "Judicial Magistrate Court No.II, Gobichettipalayam"
      ),
    ],
  },
  {
    name: "T. Sivabharathi",
    designation: "Advocate",
    mobile: "9876502009",
    defaultCourts: [
      court("Sathyamangalam", "District Munsif Court, Sathyamangalam"),
      court("Sathyamangalam", "Subordinate Court, Sathyamangalam"),
      court("Sathyamangalam", "Judicial Magistrate Court, Sathyamangalam"),
      court("Anthiyur", "District Munsif Court, Anthiyur"),
      court("Bhavani", "District Munsif Court, Bhavani"),
      court("Bhavani", "Subordinate Court, Bhavani"),
      court("Bhavani", "Judicial Magistrate Court No.1, Bhavani"),
      court("Bhavani", "Judicial Magistrate Court No.2, Bhavani"),
      court("Bhavani", "Additional District Sessions Court, Bhavani"),
      court("Perundurai", "District Munsif Court, Perundurai"),
      court("Perundurai", "Subordinate Court, Perundurai"),
      court("Perundurai", "Judicial Magistrate Court, Perundurai"),
    ],
  },
  {
    name: "EzhilArasu",
    designation: "Advocate",
    mobile: "9876502010",
    defaultCourts: [
      court("Avinashi", "District Munsif Court, Avinashi", "Tiruppur"),
      court("Avinashi", "Subordinate Court, Avinashi", "Tiruppur"),
      court("Avinashi", "Judicial Magistrate Court, Avinashi", "Tiruppur"),
      court("Tiruppur", "Additional District Court, Tiruppur", "Tiruppur"),
      court("Tiruppur", "Principal District Munsif Court, Tiruppur", "Tiruppur"),
      court("Tiruppur", "Family Court, Tiruppur", "Tiruppur"),
      court("Tiruppur", "Special Tribunal Court, Tiruppur", "Tiruppur"),
      court("Palladam", "Subordinate Court, Palladam", "Tiruppur"),
      court("Palladam", "Judicial Magistrate Court, Palladam", "Tiruppur"),
      court("Uthukuli", "District Munsif Court, Uthukuli", "Tiruppur"),
      court("Kangeyam", "Subordinate Court, Kangeyam", "Tiruppur"),
    ],
  },
  {
    name: "Vignesh",
    designation: "Advocate",
    mobile: "9876502011",
    defaultCourts: [
      court("Mettupalayam", "District Munsif Court, Mettupalayam", "Coimbatore"),
      court("Mettupalayam", "Subordinate Court, Mettupalayam", "Coimbatore"),
      court(
        "Mettupalayam",
        "Judicial Magistrate Court, Mettupalayam",
        "Coimbatore"
      ),
      court("Coimbatore", "Principal District & Sessions Court", "Coimbatore"),
      court("Pollachi", "Judicial Magistrate Court, Pollachi", "Coimbatore"),
      court("Pollachi", "District Munsif Court, Pollachi", "Coimbatore"),
    ],
  },
];

export const OFFICE_ROSTER_MOBILES = new Set(
  OFFICE_ROSTER.map((r) => r.mobile)
);
