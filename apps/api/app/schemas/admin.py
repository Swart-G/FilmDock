from pydantic import BaseModel, Field


class AdminUserCreateIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8)
    role: str = "user"


class AdminUserOut(BaseModel):
    id: str
    username: str
    role: str
    created_at: str
