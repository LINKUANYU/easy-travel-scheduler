// app/components/ui/Button.tsx
"use client";

import React from "react";

// 定義按鈕可用的層級和大小
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

// 統一的品牌主色 (這裡使用 Share 頁面那個好看的寶石藍)
const PRIMARY_COLOR = "#2563EB";
const PRIMARY_HOVER = "#1d4ed8";

export default function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  disabled,
  ...props
}: ButtonProps) {
  
  // 1. 統一的基礎樣式 (包含你之前設定的粗體、游標、動畫)
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px", // 讓按鈕內的 Icon 和文字有間距
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    opacity: disabled ? 0.6 : 1,
    // 統一圓角大小 (這裡選用大圓角膠囊狀，若你喜歡方一點可改為 8px)
    borderRadius: "999px", 
  };

  // 2. 根據 size 決定 padding 和字體大小
  const sizeStyle: React.CSSProperties = {
    sm: { height: "32px", padding: "0 12px", fontSize: "14px" },
    md: { height: "40px", padding: "0 18px", fontSize: "16px" },
    lg: { height: "48px", padding: "0 24px", fontSize: "18px" },
  }[size];

  // 3. 根據 variant 決定顏色與邊框
  let variantStyle: React.CSSProperties = {};
  
  if (variant === "primary") {
    variantStyle = {
      backgroundColor: PRIMARY_COLOR,
      color: "#fff",
      border: "none",
      boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)", // 給主按鈕加一點專屬陰影
    };
  } else if (variant === "secondary") {
    variantStyle = {
      backgroundColor: "#fff",
      color: "#374151",
      border: "1px solid #d1d5db",
    };
  } else if (variant === "danger") {
    variantStyle = {
      backgroundColor: "#fef2f2", // 淺紅底
      color: "#ef4444",           // 紅字
      border: "none",
    };
  } else if (variant === "ghost") {
    variantStyle = {
      backgroundColor: "transparent",
      color: "#4b5563",
      border: "none",
    };
  }

  // 為了處理 Hover 變色，我們簡單加個 onMouseOver 事件 (因為 inline style 沒辦法寫 :hover)
  const handleMouseOver = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (variant === "primary") e.currentTarget.style.backgroundColor = PRIMARY_HOVER;
    if (variant === "secondary") e.currentTarget.style.backgroundColor = "#f9fafb";
    if (variant === "danger") e.currentTarget.style.backgroundColor = "#fee2e2";
    if (variant === "ghost") e.currentTarget.style.backgroundColor = "#f3f4f6";
  };

  const handleMouseOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (variant === "primary") e.currentTarget.style.backgroundColor = PRIMARY_COLOR;
    if (variant === "secondary") e.currentTarget.style.backgroundColor = "#fff";
    if (variant === "danger") e.currentTarget.style.backgroundColor = "#fef2f2";
    if (variant === "ghost") e.currentTarget.style.backgroundColor = "transparent";
  };

  return (
    <button
      style={{ ...baseStyle, ...sizeStyle, ...variantStyle, ...style }}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}