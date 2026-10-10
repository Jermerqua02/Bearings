import StoreKitTest
import XCTest

/// Where a Free account sees its plan and the way to Pro: the pill beside
/// the profile photo, the counselor's "Upgrade to keep talking", and a
/// paywall whose plans and buy button are on screen without scrolling.
///
/// Needs a Free student who has onboarded and used both sample messages,
/// in BEARINGS_UITEST_FREE_TOKEN (see ios/README.md). Plans come from
/// Lumni.storekit through SKTestSession, so nothing reaches the App Store.
final class PlanTests: XCTestCase {
    private var app: XCUIApplication!
    private var session: SKTestSession!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let token = ProcessInfo.processInfo.environment["BEARINGS_UITEST_FREE_TOKEN"] ?? ""
        try XCTSkipIf(token.isEmpty, "Set BEARINGS_UITEST_FREE_TOKEN to a Free student who used their sample")
        session = try SKTestSession(configurationFileNamed: "Lumni")
        session.disableDialogs = true
        session.clearTransactions()
        app = XCUIApplication()
        app.launchEnvironment["BEARINGS_DEV_TOKEN"] = token
        app.launch()
    }

    func testFreeAccountSeesItsPlanAndAWayToPay() throws {
        // A Free account with a profile is offered the trial once; the plans
        // are on that screen without scrolling.
        let buy = app.buttons["paywall.buy"]
        if app.buttons["Not now"].waitForExistence(timeout: 15) {
            XCTAssertTrue(buy.waitForExistence(timeout: 15), "The trial offer has no way to pay")
            XCTAssertTrue(buy.isHittable, "The buy button should be on screen, not a scroll away")
            attach("intro-paywall")
            app.buttons["Not now"].tap()
        }

        let pill = app.buttons["plan.pill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 15), "No plan pill beside the profile photo")
        XCTAssertEqual(pill.label, "Free plan. Upgrade to Lumni Pro")
        attach("home-pill")

        app.buttons["nav.counselor"].tap()
        let upgrade = app.buttons["Upgrade to Lumni Pro to keep talking"]
        XCTAssertTrue(upgrade.waitForExistence(timeout: 10))
        XCTAssertGreaterThanOrEqual(upgrade.frame.minX, 16, "The upgrade bar runs to the screen's edge")
        XCTAssertLessThanOrEqual(upgrade.frame.maxX, app.frame.width - 16, "The upgrade bar runs to the screen's edge")
        attach("counselor-upgrade")

        upgrade.tap()
        XCTAssertTrue(buy.waitForExistence(timeout: 15), "The counselor's paywall has no way to pay")
        XCTAssertTrue(buy.isHittable, "The buy button should be on screen, not a scroll away")
        attach("counselor-paywall")
    }

    private func attach(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
