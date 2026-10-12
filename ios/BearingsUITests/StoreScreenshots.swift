import XCTest

/// The App Store screenshots, taken the way a person would reach each
/// screen. Not a check — a camera. Skipped unless the tokens are set:
///
///   BEARINGS_SHOT_STUDENT_TOKEN  a student with Pro and a full profile (the seeded Maya)
///   BEARINGS_SHOT_PARENT_TOKEN   their linked parent (the seeded David)
///   BEARINGS_SHOT_NEW_TOKEN      a brand-new account, for the welcome tour
///   BEARINGS_SHOT_SCHOOL         a school on the student's list with a regional discount
///   BEARINGS_SHOT_THREAD         the title of a counselor conversation to show
///
/// Run on the 6.9" simulator with the status bar set to 9:41 (see
/// ios/README.md). Each screenshot is attached to the result bundle.
final class StoreScreenshots: XCTestCase {
    private var app: XCUIApplication!
    private let env = ProcessInfo.processInfo.environment

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipIf((env["BEARINGS_SHOT_STUDENT_TOKEN"] ?? "").isEmpty, "Screenshots only on request")
    }

    private func launch(_ tokenKey: String, _ extra: [String: String] = [:]) {
        app = XCUIApplication()
        app.launchEnvironment["BEARINGS_DEV_TOKEN"] = env[tokenKey] ?? ""
        for (k, v) in extra { app.launchEnvironment[k] = v }
        app.launch()
    }

    func test01Welcome() throws {
        launch("BEARINGS_SHOT_NEW_TOKEN")
        XCTAssertTrue(app.buttons["Next"].waitForExistence(timeout: 20))
        settle(3)
        shoot("01-welcome")
    }

    func test02Home() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN")
        XCTAssertTrue(app.buttons["Your profile and settings"].waitForExistence(timeout: 20))
        settle(3)
        shoot("02-home")
    }

    func test03Explore() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN", ["BEARINGS_DEV_TAB": "explore"])
        XCTAssertTrue(app.buttons.matching(identifier: "explore.result").firstMatch.waitForExistence(timeout: 20))
        settle(3)
        shoot("03-explore")
    }

    func test04School() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN", ["BEARINGS_DEV_SCHOOL": env["BEARINGS_SHOT_SCHOOL"] ?? ""])
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 20))
        // "How it fits you" is written by the counselor; wait for her.
        let reading = app.staticTexts["Reading your profile…"]
        for _ in 0..<60 where reading.exists { settle(1) }
        settle(1)
        shoot("04-school")
    }

    func test05Cost() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN", ["BEARINGS_DEV_SCHOOL": env["BEARINGS_SHOT_SCHOOL"] ?? ""])
        XCTAssertTrue(app.staticTexts["school.name"].waitForExistence(timeout: 20))
        settle(4)
        // Bring "Cost — honestly" up near the top, and no further.
        let cost = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Cost")).firstMatch
        // Short drags rather than swipes, which fling past it.
        for _ in 0..<20 where !(cost.exists && cost.frame.minY > 0 && cost.frame.minY < app.frame.height * 0.22) {
            let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        settle(2)
        shoot("05-cost")
    }

    func test06Counselor() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN")
        XCTAssertTrue(app.buttons["nav.counselor"].waitForExistence(timeout: 20))
        app.buttons["nav.counselor"].tap()
        app.buttons["Past conversations"].tap()
        let thread = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", env["BEARINGS_SHOT_THREAD"] ?? "")).firstMatch
        XCTAssertTrue(thread.waitForExistence(timeout: 10))
        thread.tap()
        settle(3)
        // From the top: the question, then the start of her answer.
        for _ in 0..<5 { app.swipeDown() }
        settle(2)
        shoot("06-counselor")
    }

    func test07You() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN", ["BEARINGS_DEV_TAB": "you"])
        XCTAssertTrue(app.staticTexts["What I know about you"].waitForExistence(timeout: 20))
        settle(3)
        shoot("07-you")
    }

    func test08Interview() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN")
        app.buttons["nav.counselor"].tap()
        let practice = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Practice an interview'")).firstMatch
        XCTAssertTrue(practice.waitForExistence(timeout: 10))
        practice.tap()
        XCTAssertTrue(app.buttons["Start practice"].waitForExistence(timeout: 10))
        settle(2)
        shoot("08-interview")
    }

    func test09Apply() throws {
        launch("BEARINGS_SHOT_STUDENT_TOKEN", ["BEARINGS_DEV_TAB": "apply"])
        XCTAssertTrue(app.staticTexts["Status"].firstMatch.waitForExistence(timeout: 20))
        settle(3)
        shoot("09-apply")
    }

    func test10Parent() throws {
        launch("BEARINGS_SHOT_PARENT_TOKEN")
        XCTAssertTrue(app.buttons["Ask me anything"].waitForExistence(timeout: 20))
        settle(3)
        shoot("10-parent")
    }

    private func settle(_ seconds: Double) {
        _ = XCUIApplication().wait(for: .unknown, timeout: seconds)
    }

    private func shoot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
