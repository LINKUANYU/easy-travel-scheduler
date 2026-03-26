// components/edit/EditSaveBtn.tsx
"use client";
import Button from "../ui/Button";

export default function EditSaveButton({
  dirty,
  saving,
  onClick,
}: {
  dirty: boolean;
  saving: boolean;
  onClick: () => void;
}) {
  // 根據 dirty 狀態決定背景顏色 (色號為近似色，可依需求微調)
  const bgColor = dirty ? "#FFA08B" : "#fff"; 

  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        position: "relative", // 重要：為了讓紅點可以相對於按鈕定位
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0px 12px",
        borderRadius: "999px", // 圓潤的膠囊造型
        border: "1px solid #d1d5db",
        background: bgColor,
        color: "black",
        cursor: saving ? "not-allowed" : "pointer",
        fontWeight: 450,
        fontSize: "14px",
        transition: "background 0.3s ease", // 加入顏色漸變動畫更平滑
      }}
    >

      {saving ? "儲存中…" : "儲存變更"}

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