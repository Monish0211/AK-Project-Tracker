import type { Project } from "../types/Project";

const STORAGE_KEY = "projects";

function normalizeProject(project: Project): Project {
  return {
    ...project,
    manhourExpenses: Array.isArray(project.manhourExpenses)
      ? project.manhourExpenses
      : [],
    nonManhourExpenses: Array.isArray(project.nonManhourExpenses)
      ? project.nonManhourExpenses
      : [],
  };
}

export const getProjects = (): Project[] => {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) {
    return [];
  }

  try {
    const parsed: Project[] = JSON.parse(data);

    return parsed.map(normalizeProject);
  } catch {
    return [];
  }
};

export const saveProjects = (projects: Project[]): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(projects)
  );
};

export const addProject = (project: Project): void => {
  const projects = getProjects();

  projects.push(project);

  saveProjects(projects);
};

export const updateProject = (
  updatedProject: Project
): void => {
  const projects = getProjects();

  const updated = projects.map((project) =>
    project.id === updatedProject.id
      ? updatedProject
      : project
  );

  saveProjects(updated);
};

export const deleteProject = (id: string): void => {
  const projects = getProjects();

  const filtered = projects.filter(
    (project) => project.id !== id
  );

  saveProjects(filtered);
};

export const getProjectById = (
  id: string
): Project | undefined => {
  return getProjects().find(
    (project) => project.id === id
  );
};

export const clearProjects = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};