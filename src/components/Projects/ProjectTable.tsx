import ProjectRow from "./ProjectRow";
import { projects } from "../../data/projectData";

const ProjectTable = () => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">

      <h2 className="text-2xl font-semibold mb-6">
        Projects
      </h2>

      <table className="w-full">

        <thead>

          <tr className="bg-slate-100">

            <th className="text-left p-3">PR No</th>
            <th className="text-left">Client</th>
            <th className="text-left">Project</th>
            <th className="text-left">Department</th>
            <th className="text-left">Status</th>
            <th className="text-left">WO Value</th>
            <th className="text-left">View</th>
            <th className="text-left">Edit</th>

          </tr>

        </thead>

        <tbody>

          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
            />
          ))}

        </tbody>

      </table>

    </div>
  );
};

export default ProjectTable;