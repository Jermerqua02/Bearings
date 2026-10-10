import XCTest

/// Taps through the app the way a person does — the bugs these guard
/// against (a menu button that ignored taps, a page opening mid-scroll)
/// were invisible in screenshots and obvious in the hand.
///
/// Runs against the local dev server with a seeded student. Pass a session
/// token in BEARINGS_UITEST_TOKEN (see ios/README.md).
final class NavigationTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let token = ProcessInfo.processInfo.environment["BEARINGS_UITEST_TOKEN"] ?? ""
        try XCTSkipIf(token.isEmpty, "Set BEARINGS_UITEST_TOKEN to a dev-server session token")
        app = XCUIApplication()
        app.launchEnvironment["BEARINGS_DEV_TOKEN"] = token
        app.launchEnvironment["BEARINGS_DEV_TAB"] = "explore"
        app.launch()
    }

    /// Opening a school starts at the top of its page.
    func testSchoolOpensAtTop() throws {
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20), "Explore results never loaded")
        first.tap()
        let name = app.staticTexts["school.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 15), "School page didn't open")
        XCTAssertTrue(name.isHittable, "School name should be on screen when the page opens")
        XCTAssertLessThan(name.frame.minY, app.frame.height * 0.4, "Page opened scrolled down")
    }

    /// Scroll down → menu collapses; back to Explore → tap the menu button →
    /// it expands, and nothing else happens.
    func testCollapsedMenuExpandsOnTap() throws {
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        first.tap()
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 15))

        app.swipeUp(); app.swipeUp()
        let expand = app.buttons["nav.expand"]
        XCTAssertTrue(expand.waitForExistence(timeout: 5), "Menu didn't collapse on scroll")

        app.navigationBars.buttons.element(boundBy: 0).tap() // back to Explore
        XCTAssertTrue(first.waitForExistence(timeout: 10))

        if !expand.exists { app.swipeUp(); app.swipeUp() }
        XCTAssertTrue(expand.waitForExistence(timeout: 5), "Menu should be collapsed after scrolling Explore")
        expand.tap()

        XCTAssertTrue(app.buttons["nav.home"].waitForExistence(timeout: 3), "Tapping the menu button didn't expand it")
        XCTAssertFalse(app.staticTexts["school.name"].exists, "Tapping the menu button opened a school instead")
    }

    /// A collapsed menu on a pushed page expands too.
    func testCollapsedMenuExpandsOnSchoolPage() throws {
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        first.tap()
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 15))
        app.swipeUp(); app.swipeUp()
        let expand = app.buttons["nav.expand"]
        XCTAssertTrue(expand.waitForExistence(timeout: 5))
        expand.tap()
        XCTAssertTrue(app.buttons["nav.explore"].waitForExistence(timeout: 3), "Menu didn't expand on the school page")
    }

    /// A school opened in Explore, then Apply, then back to Explore: the
    /// results, not the school left open.
    func testLeavingATabReturnsToItsRoot() throws {
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        first.tap()
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 15))

        tapTab("apply")
        tapTab("explore")
        XCTAssertTrue(first.waitForExistence(timeout: 10), "Explore came back on the school instead of its results")
        XCTAssertFalse(app.staticTexts["school.name"].exists)
    }

    /// Settings opened from Home, then Apply, then Home: Home itself.
    func testHomeReturnsToHomeAfterSettings() throws {
        tapTab("home")
        let profile = app.buttons["Your profile and settings"]
        XCTAssertTrue(profile.waitForExistence(timeout: 10))
        profile.tap()
        XCTAssertTrue(app.navigationBars.buttons.element(boundBy: 0).waitForExistence(timeout: 10))
        XCTAssertFalse(profile.isHittable, "Settings didn't open")

        tapTab("apply")
        tapTab("home")
        XCTAssertTrue(profile.waitForExistence(timeout: 10))
        XCTAssertTrue(profile.isHittable, "Home came back on Settings instead of Home")
    }

    /// Tapping the tab you're on goes back to its top.
    func testRetappingATabPopsToRoot() throws {
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        first.tap()
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 15))
        tapTab("explore")
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["school.name"].exists, "Tapping Explore again didn't go back to the results")
    }

    /// The nav may have collapsed to its menu button on scroll.
    private func tapTab(_ name: String) {
        let expand = app.buttons["nav.expand"]
        if expand.exists { expand.tap() }
        let tab = app.buttons["nav.\(name)"]
        XCTAssertTrue(tab.waitForExistence(timeout: 5), "No \(name) tab")
        tab.tap()
    }
}
