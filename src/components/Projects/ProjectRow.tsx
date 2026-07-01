interface ProjectRowProps {
  project: {
    prNo: string;
    client: string;
    project: string;
    department: string;
    status: string;
    woValue: string;
  };
}

const ProjectRow = ({ project }: ProjectRowProps) => {
  return (
    <tr className="border-b hover:bg-slate-50">
      <td className="p-3">{project.prNo}</td>
      <td>{project.client}</td>
      <td>{project.project}</td>
      <td>{project.department}</td>
      <td>{project.status}</td>
      <td>{project.woValue}</td>

      <td>
        <button className="text-blue-600 hover:underline">
          View
        </button>
      </td>

      <td>
        <button className="text-green-600 hover:underline">
          Edit
        </button>
      </td>
    </tr>
  );
};

export default ProjectRow;