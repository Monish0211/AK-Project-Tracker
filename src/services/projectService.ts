import type { Project } from "../types/Project";

const STORAGE_KEY = "projects";

export const getProjects = (): Project[] => {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return [];

  return JSON.parse(data);
};

export const saveProjects = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const addProject = (project: Project) => {
  const projects = getProjects();

  projects.push(project);

  saveProjects(projects);
};