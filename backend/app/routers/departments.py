"""Department endpoints (CONTRACT §5).

Read endpoints are available to any authenticated user; create/update/delete are
restricted to admins. The router stays thin: all persistence and audit logging
live in :mod:`app.services.department_service`. Read responses are decorated with
``user_count`` / ``ticket_count`` so the frontend can render dependency totals.

Router prefix is the resource prefix only (``/departments``); ``main.py`` mounts
every router under ``settings.API_V1_PREFIX`` (``/api``), yielding final paths
such as ``/api/departments``.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, get_db, require_admin
from app.models.department import Department
from app.models.user import User
from app.schemas.department import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
)
from app.services import department_service

router = APIRouter(prefix="/departments", tags=["departments"])


def _serialize(db: Session, department: Department) -> DepartmentRead:
    """Build a :class:`DepartmentRead` decorated with dependency counts.

    The ORM model does not carry ``user_count`` / ``ticket_count`` attributes, so
    they are computed via the service and merged into the response model here.
    """

    counts = department_service.counts_for(db, department.id)
    # ``model_validate`` reads the ORM attributes; ``model_copy`` then overlays the
    # computed counts (which are not attributes on the ORM model itself).
    return DepartmentRead.model_validate(department).model_copy(
        update={
            "user_count": counts["user_count"],
            "ticket_count": counts["ticket_count"],
        },
    )


@router.get("", response_model=List[DepartmentRead])
def list_departments(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> List[DepartmentRead]:
    """List all departments (any authenticated user), with dependency counts."""

    departments = department_service.list_departments(db)
    return [_serialize(db, department) for department in departments]


@router.get("/{department_id}", response_model=DepartmentRead)
def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> DepartmentRead:
    """Fetch a single department by id (any authenticated user)."""

    department = department_service.get_department(db, department_id)
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )
    return _serialize(db, department)


@router.post(
    "",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> DepartmentRead:
    """Create a department (admin only). 409 on duplicate name."""

    if department_service.get_department_by_name(db, payload.name) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A department with this name already exists",
        )

    department = department_service.create_department(
        db,
        actor=current_user,
        data=payload.model_dump(),
    )
    return _serialize(db, department)


@router.put("/{department_id}", response_model=DepartmentRead)
def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> DepartmentRead:
    """Update a department (admin only). 409 if renaming onto an existing name."""

    department = department_service.get_department(db, department_id)
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    # Only fields explicitly provided by the client are applied.
    data = payload.model_dump(exclude_unset=True)

    # Guard against a rename that would collide with a different department.
    new_name = data.get("name")
    if new_name is not None and new_name != department.name:
        existing = department_service.get_department_by_name(db, new_name)
        if existing is not None and existing.id != department.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A department with this name already exists",
            )

    updated = department_service.update_department(
        db,
        actor=current_user,
        department=department,
        data=data,
    )
    return _serialize(db, updated)


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    """Delete a department (admin only).

    Returns 204 on success, 404 if it does not exist, and 409 if the department
    still has associated users or tickets.
    """

    department = department_service.get_department(db, department_id)
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    try:
        department_service.delete_department(
            db,
            actor=current_user,
            department=department,
        )
    except department_service.DepartmentInUseError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
