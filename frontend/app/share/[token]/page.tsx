// 1. 將函式標記為 async
export default async function SharePage({
  // 2. 定義輸入的參數格式，對應資料夾名稱 [token]
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // 3. 使用 await 拆解 params 取得 token
  const { token } = await params;

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      height: "100vh",
      fontFamily: "sans-serif"
    }}>
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
        這是第四階段 🎉
      </h1>
      <p style={{ fontSize: "1.2rem", color: "#555" }}>
        目前成功接收到的 Token 是：
      </p>
      <div style={{ 
        marginTop: "1rem", 
        padding: "1rem 2rem", 
        backgroundColor: "#f3f4f6", 
        borderRadius: "8px",
        fontWeight: "monospace",
        color: "#2563eb"
      }}>
        {token}
      </div>
    </div>
  );
}