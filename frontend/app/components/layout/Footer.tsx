export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "#fafafa",
        borderTop: "1px solid #eaeaea",
        padding: "24px 0",
        textAlign: "center",
        color: "#666",
        fontSize: "14px",
        marginTop: "auto", // 如果父層是 flex flex-col min-h-screen，這會把 footer 推到最底
        zIndex: 5,
      }}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>
        讓旅遊規劃變輕鬆 © {new Date().getFullYear()} Easy-Travel-Scheduler
      </p>
    </footer>
  );
}