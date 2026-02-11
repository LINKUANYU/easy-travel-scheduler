from fastapi import *
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.backend.router import test_api

app = FastAPI()

app.mount("/frontend", StaticFiles(directory="app/frontend"))

app.include_router(test_api.router)

@app.get("/", include_in_schema=False)
async def index(request: Request):
	return FileResponse("./app/frontend/html/index.html", media_type="text/html")