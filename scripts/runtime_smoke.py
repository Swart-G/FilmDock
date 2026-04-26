#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parents[1]
PYTHON_BIN = ROOT_DIR / ".venv312" / "bin" / "python"


@dataclass(slots=True)
class HttpResult:
    status: int
    body: str


def _free_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = int(sock.getsockname()[1])
    sock.close()
    return port


def _request(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 8.0) -> HttpResult:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, method=method, data=data, headers=headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return HttpResult(status=int(response.status), body=body)
    except HTTPError as error:
        return HttpResult(status=int(error.code), body=error.read().decode("utf-8", errors="replace"))


def _expect_status(result: HttpResult, expected: set[int], label: str) -> None:
    if result.status not in expected:
        raise RuntimeError(f"{label}: unexpected HTTP {result.status}. Body: {result.body[:300]}")
    print(f"[ok] {label}: HTTP {result.status}")


def _wait_until_ready(url: str, timeout_seconds: float = 15.0) -> None:
    deadline = time.time() + timeout_seconds
    last_error = "unknown"
    while time.time() < deadline:
        try:
            result = _request("GET", url, timeout=2.0)
            if result.status == 200:
                return
            last_error = f"http {result.status}"
        except (URLError, TimeoutError) as error:
            last_error = str(error)
        time.sleep(0.25)
    raise RuntimeError(f"service did not become ready at {url} ({last_error})")


def _start_service(service_name: str, app_dir: Path, module_path: str, env: dict[str, str], port: int) -> subprocess.Popen[str]:
    process = subprocess.Popen(
        [
            str(PYTHON_BIN),
            "-m",
            "uvicorn",
            module_path,
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=app_dir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_until_ready(f"http://127.0.0.1:{port}/health")
    except Exception:
        output = ""
        if process.stdout is not None:
            output = process.stdout.read(1000)
        process.terminate()
        process.wait(timeout=5)
        raise RuntimeError(f"{service_name} failed to start. Output: {output}")
    return process


def _stop_service(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def smoke_worker() -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT_DIR / "apps" / "worker")
    port = _free_port()
    process = _start_service("worker", ROOT_DIR, "app.main:app", env, port)
    try:
        base = f"http://127.0.0.1:{port}"
        _expect_status(_request("GET", f"{base}/health"), {200}, "worker /health")
        jobs = _request("GET", f"{base}/jobs")
        _expect_status(jobs, {200}, "worker /jobs")
        jobs_payload = json.loads(jobs.body)
        if not isinstance(jobs_payload, list) or len(jobs_payload) == 0:
            raise RuntimeError("worker /jobs returned empty or invalid payload")
        _expect_status(_request("GET", f"{base}/openapi.json"), {200}, "worker /openapi.json")
    finally:
        _stop_service(process)


def smoke_api() -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT_DIR / "apps" / "api")
    # Intentionally do not override SWARTTUBE_DB_PATH to validate writable fallback logic.
    port = _free_port()
    process = _start_service("api", ROOT_DIR, "app.main:app", env, port)
    try:
        base = f"http://127.0.0.1:{port}"
        _expect_status(_request("GET", f"{base}/health"), {200}, "api /health")

        openapi_result = _request("GET", f"{base}/openapi.json")
        _expect_status(openapi_result, {200}, "api /openapi.json")
        openapi_payload = json.loads(openapi_result.body)
        if len(openapi_payload.get("paths", {})) < 5:
            raise RuntimeError("api /openapi.json has too few paths")

        _expect_status(_request("GET", f"{base}/api/catalog/media-items"), {200}, "api catalog list")
        _expect_status(_request("GET", f"{base}/api/catalog/media-items/does-not-exist"), {404}, "api catalog detail 404")
        _expect_status(_request("GET", f"{base}/api/torrent/exclusions"), {200}, "api torrent exclusions")
        _expect_status(_request("GET", f"{base}/api/torrent/search?q=avatar"), {200}, "api torrent search")
        _expect_status(_request("GET", f"{base}/api/integrations/jellyfin/status"), {200}, "api jellyfin status")

        _expect_status(_request("GET", f"{base}/api/library/my"), {401}, "api library auth")
        _expect_status(_request("GET", f"{base}/api/library/torrents"), {401}, "api library torrents auth")
        _expect_status(_request("GET", f"{base}/api/admin/users"), {401}, "api admin auth")
        _expect_status(_request("GET", f"{base}/api/watch/assets/asset-1"), {401}, "api watch auth")
        _expect_status(_request("POST", f"{base}/api/integrations/qbittorrent/session"), {401}, "api qbit session auth")

        _expect_status(
            _request(
                "POST",
                f"{base}/api/auth/login",
                payload={"username": "missing-user", "password": "missing-password"},
            ),
            {401},
            "api auth login invalid user",
        )
        _expect_status(
            _request(
                "POST",
                f"{base}/api/auth/refresh",
                payload={"refresh_token": "invalid-refresh-token"},
            ),
            {401},
            "api auth refresh invalid token",
        )
    finally:
        _stop_service(process)


def main() -> None:
    if not PYTHON_BIN.exists():
        raise RuntimeError(f"Missing runtime venv python: {PYTHON_BIN}")
    smoke_worker()
    smoke_api()
    print("[ok] runtime smoke complete")


if __name__ == "__main__":
    main()
