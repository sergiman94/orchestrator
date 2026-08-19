"""Asset CRUD routes with health check scheduling.

Prefix: /api/workplaces/{workplace_id}/assets
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db, User, Workplace, Asset
from backend.assets.service import (
    create_asset,
    update_asset,
    serialize_asset,
    check_health,
)

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/assets",
    tags=["assets"],
)


class AssetCreate(BaseModel):
    name: str
    type: str = "custom"
    config: dict = {}
    credentials: str = ""
    check_interval: int = 300


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    credentials: Optional[str] = None
    check_interval: Optional[int] = None


def _get_workplace_or_404(db: Session, workplace_id: str, user: User):
    wp = db.query(Workplace).filter(Workplace.id == workplace_id, Workplace.owner_id == user.id).first()
    if not wp:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return wp


def _get_asset_or_404(db: Session, workplace_id: str, asset_id: str):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.workplace_id == workplace_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("", status_code=201)
def create_asset_route(
    workplace_id: str,
    body: AssetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    asset = create_asset(
        db, workplace_id=workplace_id, name=body.name, type=body.type,
        config=body.config, credentials=body.credentials, check_interval=body.check_interval,
    )
    _schedule_health_check(asset)
    return serialize_asset(asset)


@router.get("")
def list_assets(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    assets = db.query(Asset).filter(Asset.workplace_id == workplace_id).order_by(Asset.created_at).all()
    return [serialize_asset(a) for a in assets]


@router.get("/{asset_id}")
def get_asset(
    workplace_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    asset = _get_asset_or_404(db, workplace_id, asset_id)
    return serialize_asset(asset)


@router.put("/{asset_id}")
def update_asset_route(
    workplace_id: str,
    asset_id: str,
    body: AssetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    asset = _get_asset_or_404(db, workplace_id, asset_id)
    old_interval = asset.check_interval
    updated = update_asset(db, asset, name=body.name, config=body.config, credentials=body.credentials, check_interval=body.check_interval)
    if body.check_interval is not None and body.check_interval != old_interval:
        _schedule_health_check(updated)
    return serialize_asset(updated)


@router.delete("/{asset_id}", status_code=204)
def delete_asset_route(
    workplace_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    asset = _get_asset_or_404(db, workplace_id, asset_id)
    _remove_health_check_job(asset.id)
    db.delete(asset)
    db.commit()
    return Response(status_code=204)


@router.get("/{asset_id}/health")
def check_asset_health(
    workplace_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    asset = _get_asset_or_404(db, workplace_id, asset_id)
    return check_health(db, asset)


# --- APScheduler integration (AD-11) ---

_scheduler = None


def init_scheduler(scheduler):
    """Called from main.py to inject the scheduler instance."""
    global _scheduler
    _scheduler = scheduler


def _schedule_health_check(asset: Asset):
    """Register or update the APScheduler job for this asset."""
    if _scheduler is None:
        logger.warning("Scheduler not initialized — cannot schedule health check for asset %s", asset.id)
        return
    job_id = f"asset_health_{asset.id}"
    # Remove existing job if any
    try:
        _scheduler.remove_job(job_id)
    except Exception:
        pass
    if asset.check_interval and asset.check_interval > 0:
        _scheduler.add_job(
            _run_health_check_job,
            "interval",
            seconds=asset.check_interval,
            id=job_id,
            args=[asset.id, asset.workplace_id],
            replace_existing=True,
        )
        logger.info("Scheduled health check for asset %s every %ds", asset.id, asset.check_interval)


def _remove_health_check_job(asset_id: str):
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(f"asset_health_{asset_id}")
    except Exception:
        pass


def _run_health_check_job(asset_id: str, workplace_id: str):
    """Background job called by APScheduler."""
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        asset = db.query(Asset).filter(Asset.id == asset_id).first()
        if asset:
            check_health(db, asset)
    except Exception as e:
        logger.error("Scheduled health check failed for asset %s: %s", asset_id, e)
    finally:
        db.close()


def schedule_existing_assets():
    """Called on startup to schedule health checks for all existing assets."""
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        assets = db.query(Asset).filter(Asset.check_interval > 0).all()
        for asset in assets:
            _schedule_health_check(asset)
        if assets:
            logger.info("Scheduled health checks for %d existing assets", len(assets))
    except Exception as e:
        logger.error("Failed to schedule existing assets: %s", e)
    finally:
        db.close()
