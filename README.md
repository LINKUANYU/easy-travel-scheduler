# Easy Travel Scheduler (一站式 AI 旅遊規劃系統)

A one-stop travel platform integrating AI-driven parsing and dynamic maps, enabling users to seamlessly collect attractions, schedule itineraries, and share trips within a single interface.

[Live Demo](https://easy-travel-scheduler.linkuankuan.com/) | [API Documentation](https://easy-travel-scheduler.linkuankuan.com/docs)

## 🌟 Core Features

* **🤖 AI-Powered Attraction Extraction (Gemini API):**
  Leveraged **Google Gemini API** combined with targeted web scraping (`url_context`). The system automatically processes travel blog URLs, parses unstructured text, and intelligently extracts Points of Interest (POIs) to generate structured draft itineraries with a single click.
* **🗺️ Dynamic Mapping & Routing (Google Maps Platform):**
  Deeply integrated multiple Google Maps services to deliver a seamless planning experience:
  * **Places API (Autocomplete):** Provides real-time, accurate attraction search and location auto-completion.
  * **Maps JavaScript API:** Renders interactive maps for visualizing daily trip schedules.
  * **Routes API:** Dynamically calculates optimal travel routes and estimates transit times between scheduled spots.
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
<img width="1202" height="777" alt="Screenshot 2026-04-08 at 9 15 54 PM" src="https://github.com/user-attachments/assets/e054b2d8-2da0-445e-b933-16b5931e7461" />
