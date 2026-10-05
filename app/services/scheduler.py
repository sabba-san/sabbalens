from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger


scheduler = AsyncIOScheduler()


def init_scheduler():
    """Initialize and return the scheduler. Call once at startup."""
    return scheduler


def start_scheduler():
    """Start the scheduler if not already running."""
    if not scheduler.running:
        scheduler.start()


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=True)


def add_job(func, trigger, id, replace_existing=True, max_instances=1, **kwargs):
    """Add a job to the scheduler."""
    scheduler.add_job(
        func,
        trigger,
        id=id,
        replace_existing=replace_existing,
        max_instances=max_instances,
        **kwargs,
    )


def remove_job(job_id):
    """Remove a job from the scheduler."""
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass