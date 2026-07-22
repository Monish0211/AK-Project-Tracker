import Projects from "./Projects";

/**
 * Reuses the exact same Project Repository component/table/search/filters/
 * sorting/pagination/actions — only the underlying dataset differs (Project
 * Status = Completed instead of <> Completed). No duplicate component.
 */
const CompletedProjects = () => <Projects mode="completed" />;

export default CompletedProjects;
