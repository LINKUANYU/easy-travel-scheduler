// components/planner/PlannerSaveBtn.tsx
"use client";

export default function PlannerSaveButton({
  dirty,
  saving,
  onClick,
}: {
  dirty: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  // 根據 dirty 狀態決定背景顏色 (色號為近似色，可依需求微調)
  const bgColor = dirty ? "#FFA08B" : "#7bb9d7"; 

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving} // 保留剛剛討論的 UX：只有儲存中才禁用，平時皆可點擊
      style={{
        position: "relative", // 重要：為了讓紅點可以相對於按鈕定位
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "10px 18px",
        borderRadius: "999px", // 圓潤的膠囊造型
        border: "none", // 移除預設邊框
        background: bgColor,
        color: "white",
        boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
        cursor: saving ? "not-allowed" : "pointer",
        fontWeight: 700,
        fontSize: "16px",
        transition: "background 0.3s ease", // 加入顏色漸變動畫更平滑
      }}
    >

      {saving ? "儲存中…" : "儲存行程"}

      {/* 如果是 dirty 狀態，在右上角渲染紅點點 */}
      {dirty && (
        <span
          style={{
            position: "absolute",
            top: "-2px", // 往上凸出一點
            right: "-2px", // 往右凸出一點
            width: "16px",
            height: "16px",
            backgroundColor: "#fe2200", // 圖片上的淺紅點點顏色
            borderRadius: "50%",
            border: "2px solid white", // 加上白框可以跟按鈕做出層次感
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        />
      )}
    </button>
  );
}