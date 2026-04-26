from pydantic import BaseModel, Field


class AuthUserOut(BaseModel):
    id: str
    username: str
    role: str
    created_at: str


class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8)


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    jellyfin_access_token: str | None
    jellyfin_status: str
    jellyfin_message: str | None
    token_type: str = "bearer"
    user: AuthUserOut

