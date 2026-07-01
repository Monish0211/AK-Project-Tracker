import { Link } from "react-router-dom";

const Sidebar = () => {
  return (
    <div
      style={{
        width: "260px",
        height: "100vh",
        backgroundColor: "#0F172A",
        color: "white",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <h2>iFluids PMO Portal</h2>

      <hr />

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          marginTop: "30px",
          lineHeight: "45px",
          fontSize: "18px",
        }}
      >
        <li><Link to="/" style={linkStyle}>📊 Dashboard</Link></li>

        <li><Link to="/projects" style={linkStyle}>📁 Projects</Link></li>

        <li><Link to="/deliverables" style={linkStyle}>🏭 Deliverables</Link></li>

        <li><Link to="/manpower" style={linkStyle}>👷 Manpower</Link></li>

        <li><Link to="/timesheets" style={linkStyle}>⏱ Timesheets</Link></li>

        <li><Link to="/invoices" style={linkStyle}>📄 Invoices</Link></li>

        <li><Link to="/expenses" style={linkStyle}>💰 Expenses</Link></li>

        <li><Link to="/reports" style={linkStyle}>📈 Reports</Link></li>

        <li><Link to="/resources" style={linkStyle}>👥 Resources</Link></li>

        <li><Link to="/settings" style={linkStyle}>⚙️ Settings</Link></li>
      </ul>
    </div>
  );
};

const linkStyle = {
  color: "white",
  textDecoration: "none",
  display: "block",
};

export default Sidebar;