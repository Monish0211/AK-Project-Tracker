export const STATIC_PMO_COORDINATORS = [
  "Sivagnanam",
  "NaveenKumar R",
  "Aswini C",
  "Manoj Kumar G",
  "Aadhithya Hariharan",
  "Monish N",
  "Dinesh Kanth",
  "Saravanan S",
  "Shino",
  "Dhivya",
  "Solaimalai",
  "Khushbu P",
];

export function getPmoCoordinators(): string[] {
  // Reusable service to fetch PMO Coordinators.
  // In the future, this can easily query the Manpower Master.
  return [...STATIC_PMO_COORDINATORS];
}
