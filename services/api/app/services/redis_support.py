"""Redis capability checks.

The rate limiter uses ``EXPIRE ... NX``, which Redis only added in 7.0. Older
servers answer ``PING`` perfectly well and then reject that one command, so a
naive "is Redis up?" check reports success while every rate-limited request
fails. Detecting the version at startup turns a confusing runtime 503 into one
clear message. See plans/90-defect-register.md D-008.
"""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

# EXPIRE ... NX was introduced in Redis 7.0.
MINIMUM_REDIS_VERSION: tuple[int, int] = (7, 0)


class RedisVersionUnsupported(RuntimeError):
    """Raised when the configured Redis cannot serve the commands we rely on."""


#: Key the document worker publishes its OCR capability under, and the TTL that
#: makes the report self-expiring. A worker that dies stops refreshing the key,
#: so the reading side sees the capability disappear rather than a stale "yes".
OCR_CAPABILITY_KEY = "vendrai:capability:ocr"
OCR_CAPABILITY_TTL_SECONDS = 120


async def publish_ocr_capability(available: bool) -> None:
    """Announce whether OCR is usable, from the process that actually runs it.

    OCR executes in the document worker, so the API cannot answer this by
    probing its own PATH -- it does not ship the binary and never will. The
    worker reports instead, and the API reads the report.
    """
    from redis.asyncio import Redis

    client = Redis.from_url(
        settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2
    )
    try:
        await client.set(
            OCR_CAPABILITY_KEY,
            "1" if available else "0",
            ex=OCR_CAPABILITY_TTL_SECONDS,
        )
    except Exception:
        # A capability report is not worth failing document processing over.
        pass
    finally:
        await client.aclose()


async def read_ocr_capability() -> bool | None:
    """OCR availability as last reported, or None when nothing has reported.

    None is distinct from False: it means no document worker has checked in
    recently, which is a different fault from a worker that is running without
    the binary.
    """
    from redis.asyncio import Redis

    client = Redis.from_url(
        settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2
    )
    try:
        raw = await client.get(OCR_CAPABILITY_KEY)
    except Exception:
        return None
    finally:
        await client.aclose()
    if raw is None:
        return None
    value = raw.decode() if isinstance(raw, bytes) else str(raw)
    return value == "1"


def parse_redis_version(raw: str) -> tuple[int, ...]:
    """Parse ``redis_version`` into a comparable tuple.

    Trailing non-numeric segments are ignored so pre-release builds such as
    ``7.4.0-rc1`` compare as ``(7, 4, 0)``.
    """
    parts: list[int] = []
    for segment in raw.split("."):
        digits = ""
        for character in segment:
            if not character.isdigit():
                break
            digits += character
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts)


async def verify_redis_version() -> str | None:
    """Check the Redis server version against the minimum this service needs.

    Returns the detected version, or ``None`` when the check was skipped.
    Raises :class:`RedisVersionUnsupported` when the server is too old.
    A server that is merely unreachable is logged and tolerated: readiness
    probes cover availability, and refusing to boot on a transient outage would
    make startup ordering brittle.
    """
    if not settings.RATE_LIMIT_ENABLED or settings.APP_ENV == "test":
        return None

    from redis.asyncio import Redis
    from redis.exceptions import ConnectionError as RedisConnectionError
    from redis.exceptions import ResponseError as RedisResponseError
    from redis.exceptions import TimeoutError as RedisTimeoutError

    minimum = ".".join(str(part) for part in MINIMUM_REDIS_VERSION)
    client = Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    try:
        info = await client.info("server")
    except (RedisConnectionError, RedisTimeoutError) as exc:
        # Unreachable is not our problem here - readiness probes cover it, and
        # refusing to boot during a transient outage makes startup brittle.
        logger.warning(
            "redis_version_check_skipped: could not reach Redis (%s). "
            "Readiness checks will report availability.",
            type(exc).__name__,
        )
        return None
    except RedisResponseError as exc:
        # The server answered and rejected the request. Modern redis-py opens
        # every connection with HELLO (Redis 6.0+), so a rejection here means
        # the server predates that - comfortably below our 7.0 floor.
        raise RedisVersionUnsupported(
            f"REDIS_VERSION_UNSUPPORTED: the server rejected the client "
            f"handshake ({exc}), which means it is older than Redis 6.0. "
            f"This service requires >= {minimum} because the rate limiter uses "
            "'EXPIRE ... NX'. Update Redis, or set RATE_LIMIT_ENABLED=false "
            "for local development."
        ) from exc
    finally:
        await client.aclose()

    raw_version = str(info.get("redis_version", ""))
    parsed = parse_redis_version(raw_version)
    if not parsed:
        logger.warning(
            "redis_version_check_skipped: server reported an unparseable "
            "version %r.",
            raw_version,
        )
        return None

    if parsed < MINIMUM_REDIS_VERSION:
        raise RedisVersionUnsupported(
            f"REDIS_VERSION_UNSUPPORTED: found {raw_version}, requires >= {minimum}. "
            "The rate limiter uses 'EXPIRE ... NX', which older servers reject. "
            "Update Redis, or set RATE_LIMIT_ENABLED=false for local development."
        )
    return raw_version
