"""Lookups that fetch a resource only if it belongs to the current user, else 404."""

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import Project, Requirement, TestCase, TestSuite, User


def get_owned_project(project_id: uuid.UUID, current_user: User, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def get_owned_suite(suite_id: uuid.UUID, current_user: User, db: Session) -> TestSuite:
    suite = (
        db.query(TestSuite)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(TestSuite.id == suite_id, Project.user_id == current_user.id)
        .first()
    )
    if suite is None:
        raise HTTPException(404, "Test suite not found")
    return suite


def get_owned_requirement(
    requirement_id: uuid.UUID, current_user: User, db: Session
) -> Requirement:
    requirement = (
        db.query(Requirement)
        .join(TestSuite, Requirement.suite_id == TestSuite.id)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(Requirement.id == requirement_id, Project.user_id == current_user.id)
        .first()
    )
    if requirement is None:
        raise HTTPException(404, "Requirement not found")
    return requirement


def get_owned_test_case(test_case_id: uuid.UUID, current_user: User, db: Session) -> TestCase:
    test_case = (
        db.query(TestCase)
        .join(Requirement, TestCase.requirement_id == Requirement.id)
        .join(TestSuite, Requirement.suite_id == TestSuite.id)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(TestCase.id == test_case_id, Project.user_id == current_user.id)
        .first()
    )
    if test_case is None:
        raise HTTPException(404, "Test case not found")
    return test_case
