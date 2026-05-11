# Easy Travel Scheduler (一站式 AI 旅遊規劃網站)

整合 AI 應用與動態地圖的一站式旅遊規劃平台，讓使用者能在單一介面流暢完成景點收集、時間規劃與行程分享。

A one-stop travel platform integrating AI-driven parsing and dynamic maps, enabling users to seamlessly collect attractions, schedule itineraries, and share trips within a single interface.

[Live Demo](https://easy-travel-scheduler.linkuankuan.com/) | [API Documentation](https://easy-travel-scheduler.linkuankuan.com/docs)


## 🌟 核心功能
* **🔍 自動化推薦景點生成管線：** 整合搜尋引擎爬蟲、AI 語意萃取與非同步任務，打造旅遊數據收集系統：

  *  **搜尋目標網址：** 使用 **DuckDuckGo 搜尋引擎**，使用者輸入關鍵字，搜尋特定城市的「旅遊攻略」與「懶人包」。並設計過濾與篩選，確保取得高關聯性的目標網頁。

  *  **AI 語意解析與景點萃取：** 突破傳統依賴 DOM 結構的爬蟲限制，將目標網址匯入 **Gemini API (url_context tool)**，利用大型語言模型直接理解非結構化網頁內容，萃取推薦景點的名稱與描述，確保景點不存在「幻覺」。隨後串接 Google Places API 進行地點正規化、去重。

  *  **非同步任務與即時進度推送：** 導入 Celery 處理高耗時的爬蟲與 AI 運算任務。採用 AWS SQS 作為高可靠性的訊息佇列 (Message Broker) 實現流量削峰，並搭配 Redis 作為結果儲存區 (Result Backend) 與狀態快取，徹底解決 API 阻塞問題。以 **SSE (Server-Sent Events)** 由後端主動推送任務進度，即時通知前端任務完成。

* 🗺️ **動態地圖與路徑規劃 (Google Maps Platform)：**
整合多項 Google Maps 服務，打造流暢的行程規劃體驗：

  * Places API (Autocomplete)： 提供即時、精準的地點搜尋功能。

  * Maps JavaScript API： 渲染互動式地圖並結合景點資訊預覽面板（包含照片、地址與營業時間等細節），同時利用自訂地圖標記視覺化呈現每日行程的先後順序。

  * Routes API： 動態計算的交通路線，並精確估算已排定景點之間的移動時間與距離。

* ☁️ **雲端部署 & CI/CD:** 使用 Docker 將應用程式容器化，並透過 **GitHub Actions** 建置 CI/CD 流程，達成自動化部署至 AWS 雲端環境 (EC2/RDS)。


## 🌟 Core Features

* **🔍 Automated Attractions Generation Pipeline:**
  Integrated search engine web scraping, AI semantic extraction, and asynchronous task processing to build a robust travel data collection system:

  *  **Search target URL:** Utilized the **DuckDuckGo search engine** to programmatically fetch "travel guides" and "itineraries" with location where based on user-input keywords. Implemented filtering keyword to ensure the retrieval of highly relevant target web pages.

  *  **AI Semantic Parsing & Attraction Extraction:** Overcame the limitations of traditional DOM-dependent scrapers by feeding target URLs into the **Gemini API (url_context tool)**. Leveraged the LLM to directly understand unstructured web content, extracting recommended attraction names and descriptions, eliminating AI hallucinations. Subsequently integrated the Google Places API for location normalization, and deduplication.

  *  **Asynchronous Processing & Real-time Progress Streaming:** Implemented Celery to offload time-consuming web scraping and AI tasks. Leveraged **AWS SQS** as a highly reliable **Message Broker** for traffic leveling, paired with **Redis** as the **Result Backend** for state tracking, entirely eliminating API blocking. Using **SSE (Server-Sent Events)**, enabling the backend to proactively push task progress, delivering instant completion notifications to the frontend.

* **🗺️ Dynamic Mapping & Routing (Google Maps Platform):**
  Integrated multiple Google Maps services to deliver a smooth planning experience:
  * **Places API (Autocomplete):** Provides real-time, accurate location search and location auto-completion.
  * **Maps JavaScript API:** Renders interactive maps integrated with preview panels for location details (photos, addresses, operating hours), and utilizes custom map pins to visualize the daily itinerary sequence.
  * **Routes API:** Dynamically calculates travel routes and estimates transit times and distances between scheduled spots.

* **☁️ Cloud Deployment & CI/CD:**
  Containerized applications using **Docker** and built a CI/CD pipeline via **GitHub Actions** for automated deployment to the **AWS** cloud environment (EC2/RDS).


## **Asynchronous Processing with SSE**
```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant F as FastAPI (Backend)
    participant R as Redis (Cache & Pub/Sub)
    participant DB as MySQL (Database)
    participant SQS as AWS SQS (Broker)
    participant W as Celery Worker

    U->>F: 1. POST /api/search (location)
    F->>R: 2. Check Cache (Cache-Aside)
    R-->>F: Cache Miss
    F->>DB: 3. Check Database
    DB-->>F: Insufficient Data (< 5)
    F->>SQS: 4. Dispatch Scraping Task (task_id)
    F-->>U: 5. Return HTTP 200 (status: processing, task_id)

    note over U,F: Establish SSE Long-lived Connection
    U->>F: GET /api/search/stream/{task_id} (EventSource)
    F->>R: 6. SUBSCRIBE task:{task_id} channel
    note over F: Coroutine suspended — waiting for Pub/Sub signal

    loop Every 30 seconds (heartbeat)
        F-->>U: Push heartbeat to keep connection alive
    end

    note over SQS,W: Background Asynchronous Processing
    SQS->>W: 7. Consume Task
    W->>W: 8. Execute Web Scraping & Gemini Parsing
    W->>DB: 9. Insert Normalized & Deduplicated Attraction Data
    W->>R: 10. Invalidate Old Cache for Location
    W->>R: 11. PUBLISH {status: completed} to task:{task_id} channel

    R-->>F: 12. Signal received — coroutine wakes up
    F-->>U: 13. Push {status: completed}, close SSE stream

    note over U,DB: Page Refresh & Fetch Data
    U->>U: 14. router.push (Reload Search Page)
    U->>F: 15. POST /api/search (location)
    F->>R: Check Cache (Miss)
    F->>DB: Fetch Newly Inserted Attraction Data
    DB-->>F: Return Complete Data List
    F->>R: 16. Write Result to Cache (For Fast Subsequent Loads)
    F-->>U: Return Final Attraction Data, End Flow
```



## Cloud System Architecture Diagram
<img width="4322" height="2248" alt="image" src="https://github.com/user-attachments/assets/d320f769-6b7f-4572-8079-5f51fb9336f9" />


## ERD
```mermaid
erDiagram
    %% Soft Link (No strict FK, allows guest users to operate via edit_token)
    USERS |o--o{ TRIPS : "Create Trip (Soft Link)"
    
    %% Hard Link (FOREIGN KEY CASCADE enabled)
    TRIPS ||--o{ TRIP_DAYS : "Contains Days (FK)"
    TRIPS ||--o{ TRIP_PLACES : "Saved Places (FK)"
    DESTINATIONS ||--o{ TRIP_PLACES : "Included In (FK)"
    
    TRIPS ||--o{ ITINERARY_ITEMS : "Itinerary Details (FK)"
    DESTINATIONS ||--o{ ITINERARY_ITEMS : "Associated Destinations (FK)"
    
    TRIPS ||--o{ ITINERARY_LEGS : "Route Legs (FK)"
    ITINERARY_ITEMS ||--o{ ITINERARY_LEGS : "Route Start (FK)"
    ITINERARY_ITEMS ||--o{ ITINERARY_LEGS : "Route End (FK)"

    USERS {
        int id PK
        varchar email
        varchar name
        varchar password_hash
        tinyint is_active
    }

    DESTINATIONS {
        int id PK
        varchar google_place_id "UNIQUE"
        varchar place_name
        varchar city_name
        varchar geo_tags "Fulltext Index"
        decimal lat
        decimal lng
    }

    TRIPS {
        int id PK
        int user_id "NULLABLE (For Guests)"
        varchar edit_token
        varchar share_token "UNIQUE"
        varchar title
        int days
    }

    TRIP_DAYS {
        int id PK
        int trip_id FK
        int day_index
        date date
    }

    TRIP_PLACES {
        int trip_id PK,FK
        int destination_id PK,FK
    }

    ITINERARY_ITEMS {
        int id PK
        int trip_id FK
        int destination_id FK
        int day_index
        int position
        time arrival_time
        time departure_time
    }

    ITINERARY_LEGS {
        int id PK
        int trip_id FK
        int from_item_id FK
        int to_item_id FK
        int day_index
        varchar travel_mode
        int duration_millis
        int distance_meters
    }
```


## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TypeScript, CSS
* **Backend:** Python, FastAPI
* **Background Tasks & Cache:** Celery, AWS SQS, Redis
* **Database:** MySQL
* **AI & Third-Party APIs:** Google Gemini API, Google Maps Platform
* **DevOps:** Docker, AWS (EC2, RDS), GitHub Actions



## Screenshoot
* **Automated Attractions Generation Pipeline:**
  * input location
![Screen Recording 2026-04-09 at 3 10 45 PM](https://github.com/user-attachments/assets/6ba6a5f6-4111-4e03-b578-daf77a628fb1)
  * background task queues using **Celery, AWS SQS and Redis**
![Screen Recording 2026-04-09 at 3 11 53 PM](https://github.com/user-attachments/assets/1da13707-e4ac-407c-9da9-2692061274ff)

* **Dynamic Mapping & Routing (Google Maps Platform)**
  * **Places API (Autocomplete) & Maps JavaScript API:** 
![3](https://github.com/user-attachments/assets/7f817e3d-6c61-45c4-90fe-f1dbef4bdf66)

  * **Routes API:**
![4](https://github.com/user-attachments/assets/6ac4b0ba-0574-4fcb-bf9c-e9a545d1c291)

  * **Maps JavaScript API:** 
![5](https://github.com/user-attachments/assets/012350d1-0a95-4593-993b-8acbd3960090)


