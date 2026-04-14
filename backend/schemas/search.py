from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Union, Literal
from datetime import date
from .common import *

class SearchRequest(BaseModel):
    location: str
    allow_scrape: bool = True

# 1. 定義「完成狀態」的回傳結構
class SearchCompletedOut(BaseModel):
    status: Literal["completed"] # 鎖死這個字串
    is_exhausted: bool
    data: List[Attraction]

# 2. 定義「處理中狀態」的回傳結構
class SearchProcessingOut(BaseModel):
    status: Literal["processing"]
    is_exhausted: bool
    task_id: str

# 3. 定義「阻擋狀態」的回傳結構
class SearchBlockedOut(BaseModel):
    status: Literal["blocked"]
    is_exhausted: bool
    data: List[Attraction]

# 4. 將它們聯集起來，成為最終的 Response Model
SearchResponse = Union[SearchCompletedOut, SearchProcessingOut, SearchBlockedOut]

class SearchMore(BaseModel):
    location: str

class SearchMoreResponse(BaseModel):
    status: str
    error: Optional[str] = None
    task_id: Optional[str] = None


class TaskStatusProcessingOut(BaseModel):
    status: Literal["processing"]

class TaskStatusCompletedOut(BaseModel):
    status: Literal["completed"]

class TaskStatusfailedOut(BaseModel):
    status: Literal["failed"]
    error: str

class TaskStatusOtherOut(BaseModel):
    status: str

TaskStatusResponse = Union[TaskStatusProcessingOut, TaskStatusCompletedOut, TaskStatusfailedOut, TaskStatusOtherOut]

class PopularSearchesResponse(BaseModel):
    status: str
    data: List[str]