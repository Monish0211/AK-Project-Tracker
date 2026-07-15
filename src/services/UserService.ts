import type { UserProfile } from "../types/UserProfile";

const DEFAULT_PROFILE: UserProfile = {
  fullName: "Administrator",
  email: "admin@ifluids.com",
  employeeId: "EMP-00108",
  department: "Engineering Projects",
  role: "System Administrator",
  phone: "+91 98765 43210",
  location: "Chennai, India",
};

export const getUserProfile = (): UserProfile => {
  const data = localStorage.getItem("pmo_user_profile");
  if (!data) {
    localStorage.setItem("pmo_user_profile", JSON.stringify(DEFAULT_PROFILE));
    return DEFAULT_PROFILE;
  }
  try {
    return JSON.parse(data);
  } catch {
    return DEFAULT_PROFILE;
  }
};

export const saveUserProfile = (profile: UserProfile): void => {
  localStorage.setItem("pmo_user_profile", JSON.stringify(profile));
};
export default getUserProfile;
