import React from 'react';
import Image from 'next/image';
import styles from './LogoSpinner.module.css';
import icon from '@/app/icon.png'

const LogoSpinner: React.FC = () => {
  return (
    <div className={styles.spinnerOverlay}>
      <div className={styles.logoWrapper}>
        <Image 
          src={icon} 
          alt="Logo" 
          width={240}
          height={240}
          priority // 讓 Loading 圖優先載入
        />
      </div>
      <p className={styles.loadingText}>正在載入中</p>
    </div>
  );
};

export default LogoSpinner;