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

* **Dynamic Mapping & Routing (Google Maps Platform)**
<img width="1201" height="669" alt="Screenshot 2026-04-09 at 2 10 13 PM" src="https://github.com/user-attachments/assets/d877ebf3-9537-4e4a-bcf4-9087cf26dbc0" />


## Cloud System Architecture Diagram
<img width="1778" height="776" alt="diagram-export-4-6-2026-11_40_32-AM" src="https://github.com/user-attachments/assets/e906e5cf-d012-4a47-bb26-9816605e59c5" />


