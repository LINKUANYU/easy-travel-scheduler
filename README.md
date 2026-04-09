# Easy Travel Scheduler (一站式 AI 旅遊規劃網站)

A one-stop travel platform integrating AI-driven parsing and dynamic maps, enabling users to seamlessly collect attractions, schedule itineraries, and share trips within a single interface.

[Live Demo](https://easy-travel-scheduler.linkuankuan.com/) | [API Documentation](https://easy-travel-scheduler.linkuankuan.com/docs)

## 🌟 Core Features

* **🤖 AI-Powered Attraction Extraction (Gemini API):**
  AI Extraction & Data Normalization: Integrated web scraping with the Gemini API (url_context) to automatically parse travel blogs and extract POIs. Interfaced with the Google Places API to retrieve place_ids, implementing location standardization, coordinate conversion, and data deduplication to ensure the database is populated with clean and precise data.
* **🗺️ Dynamic Mapping & Routing (Google Maps Platform):**
  Deeply integrated multiple Google Maps services to deliver a seamless planning experience:
  * **Places API (Autocomplete):** Provides real-time, accurate attraction search and location auto-completion.
  * **Maps JavaScript API:** Renders interactive maps integrated with preview panels for location details (photos, addresses, operating hours), and utilizes custom map pins to visualize the daily itinerary sequence.
  * **Routes API:** Dynamically calculates optimal travel routes and estimates transit times and distances between scheduled spots.
* **⚡ Asynchronous Task Processing:**
  Established background task queues using **Celery** and **Redis** to decouple time-consuming web scraping and AI computing from the main server, preventing API blocking and ensuring system stability.
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
<img width="1778" height="776" alt="diagram-export-4-6-2026-11_40_32-AM" src="https://github.com/user-attachments/assets/e906e5cf-d012-4a47-bb26-9816605e59c5" />


