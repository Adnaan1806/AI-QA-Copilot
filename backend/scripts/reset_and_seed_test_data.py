"""
Wipes all Project/TestSuite/Requirement data and all users except ben@gmail.com,
then seeds ben's account with a small realistic Project > TestSuite > Requirement
tree for manually testing the UI (accept-all, edit/delete cascade-reset, suite
automation list, hub cards, etc.).

Run from backend/ with the venv active:
    python scripts/reset_and_seed_test_data.py
"""

from app.database.connection import SessionLocal
from app.database.models import (
    AnalysisResult,
    AutomationScript,
    Project,
    Report,
    Requirement,
    TestCase,
    TestSuite,
    User,
)

KEEP_EMAIL = "ben@gmail.com"

PLAYWRIGHT_STUB = """import { test, expect } from '@playwright/test';

test('__TITLE__', async ({ page }) => {
  // TODO: replace with real selectors for the checkout flow
  await page.goto('/checkout');
  await expect(page).toHaveTitle(/Checkout/);
});
"""


def wipe(db):
    other_users = db.query(User).filter(User.email != KEEP_EMAIL).all()
    for u in other_users:
        db.delete(u)

    ben = db.query(User).filter(User.email == KEEP_EMAIL).first()
    if ben is None:
        raise SystemExit(f"No user with email {KEEP_EMAIL} found — nothing to keep, aborting.")

    for project in list(ben.projects):
        db.delete(project)

    db.commit()
    return ben


def seed(db, ben):
    project = Project(
        user_id=ben.id,
        name="Retail Demo Store",
        description="Sample e-commerce project for QA Copilot testing.",
    )
    db.add(project)
    db.flush()

    suite = TestSuite(
        project_id=project.id,
        name="Checkout & Payments",
        description="Covers guest checkout and payment failure handling.",
    )
    db.add(suite)
    db.flush()

    # --- Requirement 1: fully fleshed out (analysis + mixed-status test cases + automation + report) ---
    req1 = Requirement(
        suite_id=suite.id,
        name="Guest Checkout Flow",
        content=(
            "As a guest shopper, I want to check out without creating an account so that I can "
            "complete my purchase quickly. The system must collect a shipping address, validate "
            "the cart total, apply any valid promo code, and process payment via credit card. On "
            "success, the user should see an order confirmation with a unique order number and "
            "receive a confirmation email."
        ),
    )
    db.add(req1)
    db.flush()

    db.add(
        AnalysisResult(
            requirement_id=req1.id,
            requirements=[
                "Guest can proceed to checkout without registering an account",
                "Shipping address form validates required fields",
                "Promo code field validates against active codes",
                "Payment is processed via a credit card gateway",
                "Order confirmation page displays a unique order number",
                "Confirmation email is sent to the provided email address",
            ],
            risks=[
                "Payment gateway timeout could leave an order in an inconsistent state",
                "Invalid promo codes might not show a clear error message",
                "Guest email typos would prevent confirmation delivery",
            ],
            missing_info=[
                "Behavior when the cart total changes between cart and checkout",
                "Maximum number of promo code attempts allowed",
                "Supported payment methods beyond credit card",
            ],
            testing_considerations=[
                "Test with expired and invalid promo codes",
                "Test payment gateway timeout/retry behavior",
                "Verify confirmation email content and delivery time",
            ],
        )
    )

    req1_cases = [
        dict(
            title="Guest completes checkout with a valid card and no promo code",
            test_type="functional",
            priority="high",
            status="approved",
            steps=[
                "Add an item to the cart",
                "Proceed to checkout as a guest",
                "Enter a valid shipping address",
                "Enter valid credit card details",
                "Submit the order",
            ],
            expected_result=(
                "Order confirmation page is shown with a unique order number and a "
                "confirmation email is sent"
            ),
        ),
        dict(
            title="Guest checkout applies a valid promo code",
            test_type="functional",
            priority="medium",
            status="approved",
            steps=[
                "Add an item to the cart",
                "Proceed to checkout as a guest",
                "Enter a valid, active promo code",
                "Submit the order",
            ],
            expected_result="Discount is applied to the order total before payment is charged",
        ),
        dict(
            title="Checkout rejects an expired promo code",
            test_type="negative",
            priority="medium",
            status="approved",
            steps=[
                "Add an item to the cart",
                "Proceed to checkout as a guest",
                "Enter a promo code that has expired",
                "Submit the order",
            ],
            expected_result=(
                "An error message indicates the promo code has expired and the order "
                "total is unchanged"
            ),
        ),
        dict(
            title="Checkout blocks submission with an invalid shipping zip code",
            test_type="negative",
            priority="medium",
            status="draft",
            steps=[
                "Add an item to the cart",
                "Proceed to checkout as a guest",
                "Enter a shipping address with an invalid zip code",
                "Submit the order",
            ],
            expected_result="A validation error is shown and the order is not submitted",
        ),
        dict(
            title="Payment gateway timeout during guest checkout",
            test_type="edge_case",
            priority="high",
            status="draft",
            steps=[
                "Add an item to the cart",
                "Proceed to checkout as a guest",
                "Enter valid shipping and payment details",
                "Simulate a payment gateway timeout",
                "Submit the order",
            ],
            expected_result=(
                "A clear timeout error is shown, no duplicate order is created, and the "
                "user can retry payment"
            ),
        ),
    ]

    approved_cases = []
    for c in req1_cases:
        tc = TestCase(requirement_id=req1.id, **c)
        db.add(tc)
        db.flush()
        if tc.status == "approved":
            approved_cases.append(tc)

    for tc in approved_cases:
        db.add(
            AutomationScript(
                test_case_id=tc.id,
                framework="playwright",
                code=PLAYWRIGHT_STUB.replace("__TITLE__", tc.title.replace("'", "\\'")),
            )
        )

    db.add(
        Report(
            requirement_id=req1.id,
            summary=(
                "3 of 5 test cases are approved and automated for the guest checkout flow. "
                "Core happy-path and promo code coverage is in place; negative and edge-case "
                "coverage is still pending review."
            ),
            coverage_analysis=[
                "Happy-path checkout and valid promo code redemption are covered",
                "Expired promo code rejection is covered",
                "Invalid zip code validation and gateway timeout handling are not yet approved",
            ],
            quality_risks=[
                "Payment gateway timeout behavior is untested until its test case is approved",
                "No automated coverage yet for invalid shipping input",
            ],
            release_recommendation=(
                "Not ready to release — approve and automate the remaining negative and "
                "edge-case test cases before sign-off."
            ),
        )
    )

    # --- Requirement 2: analysis + all-draft test cases (nothing approved yet) ---
    req2 = Requirement(
        suite_id=suite.id,
        name="Payment Gateway Failure Handling",
        content=(
            "When the payment gateway returns an error (declined card, network failure, or "
            "timeout) during checkout, the system must show a clear error message, preserve "
            "the user's cart and shipping details, and allow the user to retry payment without "
            "re-entering information."
        ),
    )
    db.add(req2)
    db.flush()

    db.add(
        AnalysisResult(
            requirement_id=req2.id,
            requirements=[
                "Declined card shows a clear, actionable error message",
                "Cart and shipping details are preserved after a failed payment",
                "User can retry payment without re-entering information",
                "Network failures do not create duplicate orders",
            ],
            risks=[
                "A retry after a network failure could double-charge the customer",
                "Error messages could leak internal gateway error codes to the user",
            ],
            missing_info=[
                "Maximum number of retry attempts before the order is abandoned",
                "Whether a partial order is persisted server-side during a retry",
            ],
            testing_considerations=[
                "Test retry behavior after each failure type (declined, network, timeout)",
                "Verify no duplicate orders are created on retry",
            ],
        )
    )

    req2_cases = [
        dict(
            title="Declined card shows a clear retry prompt",
            test_type="functional",
            priority="high",
            steps=[
                "Add an item to the cart and proceed to checkout",
                "Enter a card number that the gateway will decline",
                "Submit the order",
            ],
            expected_result="A clear decline message is shown with an option to retry payment",
        ),
        dict(
            title="Cart and shipping details persist after a failed payment",
            test_type="functional",
            priority="high",
            steps=[
                "Proceed to checkout and enter shipping details",
                "Submit payment with a card that will be declined",
                "Return to the payment step",
            ],
            expected_result="Shipping details and cart contents are still populated",
        ),
        dict(
            title="Network failure during payment does not duplicate the order",
            test_type="edge_case",
            priority="high",
            steps=[
                "Proceed to checkout with valid details",
                "Simulate a network failure during payment submission",
                "Retry payment successfully",
            ],
            expected_result="Only one order is created despite the failed first attempt",
        ),
        dict(
            title="Checkout shows a security-safe error message without exposing gateway details",
            test_type="security",
            priority="medium",
            steps=[
                "Proceed to checkout with valid details",
                "Trigger a payment gateway error",
            ],
            expected_result=(
                "The error shown to the user contains no internal gateway codes or "
                "stack traces"
            ),
        ),
    ]
    for c in req2_cases:
        db.add(TestCase(requirement_id=req2.id, status="draft", **c))

    db.commit()
    return project, suite, [req1, req2]


def main():
    db = SessionLocal()
    try:
        ben = wipe(db)
        project, suite, reqs = seed(db, ben)
        print(f"Kept user: {ben.email}")
        print(f"Created project: {project.name} ({project.id})")
        print(f"Created suite: {suite.name} ({suite.id})")
        for r in reqs:
            print(f"  Requirement: {r.name} ({r.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
