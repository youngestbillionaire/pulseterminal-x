from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from app.config import settings

EXCLUDED_PATHS = {"/health", "/health/live", "/health/ready", "/docs", "/openapi.json"}

class InternalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in EXCLUDED_PATHS:
            return await call_next(request)

        key = request.headers.get("X-Internal-Key")
        if not key or key != settings.INTERNAL_API_KEY:
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized: invalid internal API key"}
            )

        return await call_next(request)
