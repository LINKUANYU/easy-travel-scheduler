# Easy Travel Scheduler (一站式 AI 旅遊規劃網站)

整合 AI 應用與動態地圖的一站式旅遊規劃平台，讓使用者能在單一介面流暢完成景點收集、時間規劃與行程分享。

A one-stop travel platform integrating AI-driven parsing and dynamic maps, enabling users to seamlessly collect attractions, schedule itineraries, and share trips within a single interface.

[Live Demo](https://easy-travel-scheduler.linkuankuan.com/) | [API Documentation](https://easy-travel-scheduler.linkuankuan.com/docs)

## 核心功能
* ⚙️**自動化推薦景點生成管線：** 整合搜尋引擎爬蟲、AI 語意萃取與非同步任務，打造旅遊數據收集系統：

  * 🔍 **搜尋目標網址：** 使用 **DuckDuckGo 搜尋引擎**，使用者輸入關鍵字搜尋特定城市的「旅遊攻略」與「懶人包」。並設計過濾與篩選，確保取得高關聯性的目標網頁。

  * 🧠 **AI 語意解析與資料正規化**： 突破傳統依賴 DOM 結構的爬蟲限制，將目標網址匯入 **Gemini API (url_context tool)**，利用大型語言模型直接理解非結構化網頁內容，精準萃取推薦景點的名稱與描述。隨後串接 Google Places API 進行地點正規化、精準去重，確保寫入資料庫的結構化資料具備一致性與正確性。

  * ⚡ **非同步任務：** 考量到網頁搜尋與 AI 運算皆為高耗時操作，導入 **Celery 與 AWS SQS** 建立背景任務佇列。主伺服器接收請求後會立即回傳任務建立狀態，並由前端透過輪詢 (Short Polling) 機制持續追蹤背景執行進度。此設計將長時間任務與主伺服器完全解耦，徹底避免 API 阻塞與逾時問題，確保高併發下的系統穩定度與流暢的使用者體驗。

* 🗺️ **動態地圖與路徑規劃 (Google Maps Platform)：**
整合多項 Google Maps 服務，打造流暢的行程規劃體驗：

  * Places API (Autocomplete)： 提供即時、精準的地點搜尋功能。

  * Maps JavaScript API： 渲染互動式地圖並結合景點資訊預覽面板（包含照片、地址與營業時間等細節），同時利用自訂地圖標記視覺化呈現每日行程的先後順序。

  * Routes API： 動態計算的交通路線，並精確估算已排定景點之間的移動時間與距離。

* ☁️ **雲端部署:** 使用 Docker 將應用程式容器化，並透過 **GitHub Actions** 建置 CI/CD 流程，達成自動化部署至 AWS 雲端環境 (EC2/RDS)。

## 🌟 Core Features

* **⚙️ Automated POI Generation Pipeline:**
  Integrated search engine web scraping, AI semantic extraction, and asynchronous task processing to build a robust travel data collection system:

  * 🔍 **Search target URL:** Utilized the **DuckDuckGo search engine** to programmatically fetch "travel guides" and "itineraries" with location where based on user-input keywords. Implemented filtering keyword to ensure the retrieval of highly relevant target web pages.

  * 🧠 **AI Semantic Extraction & Data Normalization:** Overcame the limitations of traditional DOM-dependent scrapers by feeding target URLs into the **Gemini API (url_context tool)**. Leveraged the LLM to directly understand unstructured web content, accurately extracting recommended POI (Point of Interest) names and descriptions. Subsequently integrated the Google Places API for location normalization, and precise deduplication, ensuring the consistency and accuracy of the structured data ingested into the database.

  * ⚡ **Asynchronous Processing:** Given that web scraping and AI processing are time-consuming operations, integrated **Celery and AWS SQS** to establish background task queues. The main server immediately returns a task status (HTTP 200) upon receiving a request, while the frontend utilizes a Short Polling mechanism to track execution progress. This architecture completely decouples long-running tasks from the main server, eliminating API blocking and timeouts, thereby ensuring system stability under high concurrency and delivering a seamless user experience.

* **🗺️ Dynamic Mapping & Routing (Google Maps Platform):**
  Integrated multiple Google Maps services to deliver a smooth planning experience:
  * **Places API (Autocomplete):** Provides real-time, accurate location search and location auto-completion.
  * **Maps JavaScript API:** Renders interactive maps integrated with preview panels for location details (photos, addresses, operating hours), and utilizes custom map pins to visualize the daily itinerary sequence.
  * **Routes API:** Dynamically calculates travel routes and estimates transit times and distances between scheduled spots.

* **☁️ Cloud Deployment & CI/CD:**
  Containerized applications using **Docker** and built a CI/CD pipeline via **GitHub Actions** for automated deployment to the **AWS** cloud environment (EC2/RDS).

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TypeScript, CSS
* **Backend:** Python, FastAPI
* **Background Tasks & Cache:** Celery, Redis
* **Database:** MySQL
* **AI & Third-Party APIs:** Google Gemini API, Google Maps Platform
* **DevOps:** Docker, AWS (EC2, RDS), GitHub Actions

## ERD
<img width="1218" height="670" alt="Screenshot 2026-04-09 at 2 11 32 PM" src="https://github.com/user-attachments/assets/c16270be-b2f4-4474-ae11-2064a7c3d7ad" />


## Screenshoot
* **🤖 AI-Powered Attraction Extraction (Gemini API):**
  * input location
![Screen Recording 2026-04-09 at 3 10 45 PM](https://github.com/user-attachments/assets/6ba6a5f6-4111-4e03-b578-daf77a628fb1)
  * background task queues using **Celery** and **Redis**
![Screen Recording 2026-04-09 at 3 11 53 PM](https://github.com/user-attachments/assets/1da13707-e4ac-407c-9da9-2692061274ff)

* **Dynamic Mapping & Routing (Google Maps Platform)**
  * **Places API (Autocomplete) & Maps JavaScript API:** 
![3](https://github.com/user-attachments/assets/7f817e3d-6c61-45c4-90fe-f1dbef4bdf66)

  * **Routes API:**
![4](https://github.com/user-attachments/assets/6ac4b0ba-0574-4fcb-bf9c-e9a545d1c291)

  * **Maps JavaScript API:** 
![5](https://github.com/user-attachments/assets/012350d1-0a95-4593-993b-8acbd3960090)

## Cloud System Architecture Diagram
<img width="1500" height="607" alt="Cloud System Architecture Diagram" src="https://github.com/user-attachments/assets/d52a5f03-5cb5-4d83-8954-4e680912731c" />


 ## test account
| Account | Password | 
| ------ | ------ |
| test@mail.com | 12345678 |
