from __future__ import annotations

from app.services.jellyfin_client import (
    JellyfinClient,
    JellyfinConfigurationError,
    JellyfinNetworkError,
    JellyfinRequestError,
)


class JellyfinAccountError(Exception):
    pass


class JellyfinAccountConflictError(JellyfinAccountError):
    pass


class JellyfinAccountConfigurationError(JellyfinAccountError):
    pass


class JellyfinAccountProvisionError(JellyfinAccountError):
    pass


class JellyfinAccountService:
    def __init__(self, client: JellyfinClient | None = None):
        self._client = client or JellyfinClient()

    def ensure_user(self, username: str, password: str) -> dict[str, str]:
        try:
            response = self._client.request(
                "POST",
                "/Users/New",
                payload={
                    "Name": username,
                    "Password": password,
                },
            )
        except JellyfinConfigurationError as error:
            raise JellyfinAccountConfigurationError(str(error)) from error
        except JellyfinNetworkError as error:
            raise JellyfinAccountProvisionError(str(error)) from error
        except JellyfinRequestError as error:
            if error.status_code in {400, 409}:
                raise JellyfinAccountConflictError("Username already exists in Jellyfin") from error
            raise JellyfinAccountProvisionError(f"Jellyfin user provisioning failed: HTTP {error.status_code}") from error

        user_id = None
        if isinstance(response.data, dict):
            raw_id = response.data.get("Id") or response.data.get("id")
            if isinstance(raw_id, str) and raw_id.strip():
                user_id = raw_id
        return {
            "id": user_id or "",
            "username": username,
            "state": "provisioned",
        }
