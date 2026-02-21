export const AGE_GROUPS = [
  { value: "OLDIES", label: "Oldies", sportssysDivision: "1" },
  { value: "SENIOR", label: "Senior", sportssysDivision: "2" },
  { value: "U21", label: "U-21", sportssysDivision: "16" },
  { value: "U19", label: "U-19", sportssysDivision: "3" },
  { value: "U17", label: "U-17", sportssysDivision: "4" },
  { value: "U15", label: "U-15", sportssysDivision: "5" },
  { value: "U13", label: "U-13", sportssysDivision: "6" },
  { value: "U12", label: "U-12", sportssysDivision: "19" },
  { value: "U11", label: "U-11", sportssysDivision: "7" },
  { value: "U10", label: "U-10", sportssysDivision: "18" },
  { value: "U9", label: "U-9", sportssysDivision: "8" },
  { value: "U8", label: "U-8", sportssysDivision: "17" },
  { value: "U7", label: "U-7", sportssysDivision: "9" },
  { value: "U5", label: "U-5", sportssysDivision: "10" },
] as const;

export type AgeGroupValue = (typeof AGE_GROUPS)[number]["value"];

const byValue = new Map(AGE_GROUPS.map((g) => [g.value, g] as const));

export function isAgeGroupValue(value: string): value is AgeGroupValue {
  return byValue.has(value as AgeGroupValue);
}

export function getAgeGroupLabel(value: string): string {
  return byValue.get(value as AgeGroupValue)?.label ?? value;
}

export function getSportssysDivision(value: string): string | null {
  return byValue.get(value as AgeGroupValue)?.sportssysDivision ?? null;
}
