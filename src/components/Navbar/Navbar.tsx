const Navbar = () => {
  return (
    <div
      style={{
        height: "70px",
        backgroundColor:  "#ffffff",
        borderBottom: "1px solid #E5E7EB",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 30px",
      }}
    >
      <h2>Dashboard</h2>

      <div>
        🔔 Notifications &nbsp;&nbsp;&nbsp;
        👤 Administrator
      </div>
    </div>
  );
};

export default Navbar;