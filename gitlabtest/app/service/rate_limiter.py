from __future__ import annotations

import asyncio
import contextlib
import logging

logger = logging.getLogger(__name__)
import random
import time
from collections import defaultdict
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import sentry_sdk
from aiolimiter import AsyncLimiter

# --- Configuratie ---
RATE_LIMIT_1S: int = (
    8  # per-instance cap; keeps two nodes safely under HubSpot's ~19/s SECONDLY limit
)
RATE_LIMIT_10S: int = 80  # align 10s window with lower per-second rate
BURST_DELAY: int = 0
MAX_RETRIES: int = 3
RETRY_BACKOFF_BASE: int = 2
CALL_TIMEOUT: int = 25  # max seconds a single HubSpot call may block the queue
WORKER_COUNT: int = (
    3  # run multiple workers so a single slow call doesn't stall everyone
)
TIMEOUT_COOLDOWN: int = 60  # seconds to reject the same call label after a timeout
JITTER_MAX: float = 0.3  # add jitter to smooth concurrent bursts across nodes
# Bounded thread pool: prevents exhaustion from hung calls that survive asyncio cancellation.
# Hung threads can't be killed — asyncio cancels the Task but the thread keeps running.
# A hard cap makes this visible (submissions fail fast) rather than silently piling up.
EXECUTOR_MAX_WORKERS: int = 12

# --- Limiters ---
LIMITER_1S = AsyncLimiter(RATE_LIMIT_1S, 1)
LIMITER_10S = AsyncLimiter(RATE_LIMIT_10S, 10)

# --- Thread pool ---
_EXECUTOR = ThreadPoolExecutor(
    max_workers=EXECUTOR_MAX_WORKERS, thread_name_prefix="hubspot"
)

# --- Queue en tracking ---
API_QUEUE: asyncio.Queue[
    tuple[Callable[..., Any], tuple[Any, ...], dict[str, Any], asyncio.Future[Any]]
] = asyncio.Queue()
REQUEST_LOG: defaultdict[int, int] = defaultdict(int)  # Timestamp -> aantal requests
COOLDOWN_UNTIL: dict[
    str, float
] = {}  # label -> timestamp until which we skip to avoid dogpiling

# --- Worker state ---
_worker_started: bool = False
_worker_loop_id: int | None = None
_worker_tasks: list[asyncio.Task[None]] = []


def _safe_set_result(fut: asyncio.Future[Any], result: Any, label: str) -> None:
    """Set result only if the future is still pending.

    The outer asyncio.wait_for in call_hubspot_api cancels the future when its
    30s timeout fires. If the worker then calls set_result/set_exception on the
    cancelled future it raises InvalidStateError, which (before this fix) would
    propagate out of the while-True loop and silently kill the worker.
    """
    if fut.done():
        logger.debug(
            "[rate_limiter] future already done for %s, discarding result", label
        )
        return
    fut.set_result(result)


def _safe_set_exception(
    fut: asyncio.Future[Any], exc: BaseException, label: str
) -> None:
    """Set exception only if the future is still pending. See _safe_set_result."""
    if fut.done():
        logger.debug(
            "[rate_limiter] future already done for %s, discarding exception %s",
            label,
            exc,
        )
        return
    fut.set_exception(exc)


def ensure_worker_started() -> None:
    """Start the API workers lazily to avoid hangs when lifespan isn't run."""
    global _worker_started
    if _worker_started:
        return
    loop = asyncio.get_event_loop()
    for i in range(WORKER_COUNT):
        task = loop.create_task(_resilient_worker(i))
        _worker_tasks.append(task)
    _worker_started = True
    logger.info("[rate_limiter] %s worker(s) auto-started", WORKER_COUNT)


def log_request_volume() -> None:
    now = int(time.time())
    REQUEST_LOG[now] += 1
    # optioneel: clean-up
    for ts in list(REQUEST_LOG):
        if now - ts > 30:  # bewaar 30s
            del REQUEST_LOG[ts]

    # logger.info(f"Request count in last 5s: {[REQUEST_LOG.get(now - i, 0) for i in range(5)]}")


async def _resilient_worker(worker_id: int) -> None:
    """Restart api_worker if it crashes. Belt-and-suspenders: api_worker already
    has an inner guard, but this ensures the task never permanently disappears."""
    while True:
        try:
            await api_worker(worker_id)
        except Exception:
            logger.exception(
                "[rate_limiter] worker %s crashed unexpectedly; restarting in 1s",
                worker_id,
            )
            await asyncio.sleep(1)


async def api_worker(worker_id: int | None = None) -> None:
    loop_id = id(asyncio.get_running_loop())
    logger.info("[rate_limiter] worker start id=%s loop=%s", worker_id, loop_id)
    while True:
        func, args, kwargs, fut = await API_QUEUE.get()
        label = getattr(func, "_call_label", getattr(func, "__name__", "hubspot_call"))
        try:
            now = time.time()

            # If this call recently timed out, fail fast to avoid blocking all workers with the same hang
            cooldown_until = COOLDOWN_UNTIL.get(label)
            if cooldown_until and now < cooldown_until:
                msg = f"{label} in cooldown after previous timeout; retry after {int(cooldown_until - now)}s"
                logger.warning("[rate_limiter] %s", msg)
                _safe_set_exception(fut, TimeoutError(msg), label)
                continue

            retry_count = 0
            logger.debug("[rate_limiter] start %s", label)

            while retry_count <= MAX_RETRIES:
                try:
                    # Limiter acquisitie
                    async with LIMITER_1S:
                        async with LIMITER_10S:
                            logger.debug(
                                f"[{time.time():.3f}] Limiter acquired for {label} - waiting {BURST_DELAY:.2f}s"
                            )
                            delay = BURST_DELAY + random.uniform(0, JITTER_MAX)
                            if delay:
                                await asyncio.sleep(delay)

                            logger.debug(
                                f"[{time.time():.3f}] Calling API {label} (attempt {retry_count + 1})"
                            )
                            # Guard against hung calls: enforce a max duration per call
                            call_task = asyncio.create_task(func(*args, **kwargs))
                            result = await asyncio.wait_for(
                                call_task, timeout=CALL_TIMEOUT
                            )

                    _safe_set_result(fut, result, label)
                    log_request_volume()
                    logger.debug("[rate_limiter] done %s", label)
                    break  # Succesvol -> stop retries

                except TimeoutError:
                    with contextlib.suppress(Exception):
                        call_task.cancel()
                    COOLDOWN_UNTIL[label] = time.time() + TIMEOUT_COOLDOWN
                    sentry_sdk.capture_message(
                        f"[Timeout] HubSpot call {label} exceeded {CALL_TIMEOUT}s"
                    )
                    logger.exception(
                        "[rate_limiter] HubSpot call %s timed out after %ss; skipping",
                        label,
                        CALL_TIMEOUT,
                    )
                    _safe_set_exception(
                        fut,
                        TimeoutError(f"{label} timed out after {CALL_TIMEOUT}s"),
                        label,
                    )
                    break

                except Exception as e:
                    is_429 = "429" in str(e)
                    retry_after = None

                    # Als beschikbaar, gebruik de echte retry-after header
                    if hasattr(e, "response"):
                        if getattr(e.response, "status_code", None) == 429:
                            is_429 = True
                        retry_after = e.response.headers.get("Retry-After")

                    if is_429 and retry_count < MAX_RETRIES:
                        try:
                            backoff = (
                                float(retry_after) + 1
                                if retry_after
                                else RETRY_BACKOFF_BASE ** (retry_count + 1)
                            )
                        except Exception:
                            backoff = RETRY_BACKOFF_BASE ** (retry_count + 1)

                        jitter = random.uniform(0.2, 1.0)
                        total_backoff = backoff + jitter

                        logger.warning(
                            f"[Retry {retry_count + 1}/{MAX_RETRIES}] 429 rate limit. "
                            f"Retrying after {total_backoff:.2f}s (Retry-After={retry_after})"
                        )
                        await asyncio.sleep(total_backoff)
                        retry_count += 1
                    else:
                        sentry_sdk.capture_exception(e)
                        logger.exception(
                            f"[Error] Max retries exceeded or non-429 error: {e}"
                        )
                        _safe_set_exception(fut, e, label)
                        break

            logger.debug("[rate_limiter] finished %s", label)

        except Exception:
            # Catch anything unexpected (e.g. a second InvalidStateError from _safe_set_*,
            # or an error in the cooldown/label logic) so the worker never exits this loop.
            logger.exception(
                "[rate_limiter] unexpected error in worker %s processing %s; worker continues",
                worker_id,
                label,
            )
            _safe_set_exception(
                fut, RuntimeError(f"Unexpected worker error processing {label}"), label
            )
        finally:
            # Always release the queue slot, even if an exception escaped above.
            API_QUEUE.task_done()


async def call_hubspot_api(
    sync_func: Callable[..., Any], *args: Any, **kwargs: Any
) -> Any:
    """
    Schedules a synchronous HubSpot API call to run through the shared limiter + retry system.
    """
    ensure_worker_started()
    loop = asyncio.get_event_loop()
    fut = loop.create_future()

    def blocking_func() -> Any:
        return sync_func(*args, **kwargs)

    async def async_func() -> Any:
        return await loop.run_in_executor(_EXECUTOR, blocking_func)

    label = (
        getattr(sync_func, "__qualname__", None)
        or getattr(sync_func, "__name__", None)
        or repr(sync_func)
    )
    async_func._call_label = label  # type: ignore[attr-defined]  # dynamically set for worker label lookup

    logger.debug(
        "[rate_limiter] enqueue %s loop=%s qsize=%s", label, id(loop), API_QUEUE.qsize()
    )
    await API_QUEUE.put((async_func, (), {}, fut))
    try:
        # Prevent hanging forever if the worker or HubSpot call stalls
        return await asyncio.wait_for(fut, timeout=30)
    except TimeoutError:
        logger.exception(
            "[rate_limiter] Timeout waiting for %s loop=%s qsize=%s",
            label,
            id(loop),
            API_QUEUE.qsize(),
        )
        raise
